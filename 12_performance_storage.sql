-- Sohail v5.1.0. After SQL08 and SQL10. No rules, players or matches are deleted by installation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE OR REPLACE FUNCTION public.sohail_perf_document(p_raw jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE d jsonb;
BEGIN
 d:=CASE WHEN jsonb_typeof(p_raw)='string' THEN (p_raw#>>'{}')::jsonb ELSE p_raw END;
 IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid league document'; END IF;
 RETURN d;
END $$;
CREATE OR REPLACE FUNCTION public.sohail_perf_projection(p_raw jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE d jsonb; users jsonb; matches jsonb;
BEGIN
 d:=public.sohail_perf_document(p_raw);
 IF jsonb_typeof(d->'users') IS DISTINCT FROM 'object' OR jsonb_typeof(d->'matches') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Incomplete sporting source'; END IF;
 SELECT coalesce(jsonb_object_agg(u.key,(SELECT coalesce(jsonb_object_agg(x.key,x.value),'{}'::jsonb) FROM jsonb_each(CASE WHEN jsonb_typeof(u.value)='object' THEN u.value ELSE '{}'::jsonb END) x WHERE x.key IN ('name','jugadorId','historialId','historialNombre'))),'{}'::jsonb) INTO users FROM jsonb_each(d->'users') u;
 SELECT coalesce(jsonb_agg((SELECT coalesce(jsonb_object_agg(x.key,x.value),'{}'::jsonb) FROM jsonb_each(CASE WHEN jsonb_typeof(m.value)='object' THEN m.value ELSE '{}'::jsonb END) x WHERE x.key IN ('id','po','cycle','g','sets','club','date','status','wo','np','npReason','injurySide','winner','retiroDe','poNames','aName','bName','tLabel','which')) ORDER BY m.ordinality),'[]'::jsonb) INTO matches FROM jsonb_array_elements(d->'matches') WITH ORDINALITY m;
 RETURN jsonb_build_object('users',users,'matches',matches,'cycles',(SELECT coalesce(jsonb_agg(jsonb_build_object('n',c.value->'n','groups',CASE WHEN jsonb_typeof(c.value->'groups')='array' THEN (SELECT coalesce(jsonb_agg('{}'::jsonb),'[]'::jsonb) FROM jsonb_array_elements(c.value->'groups')) ELSE 'null'::jsonb END) ORDER BY c.ordinality),'[]'::jsonb) FROM jsonb_array_elements(CASE WHEN d->'cycles' IS NULL OR d->'cycles'='null'::jsonb THEN '[]'::jsonb ELSE d->'cycles' END) WITH ORDINALITY c),'RATING_SEEDS',coalesce(d->'RATING_SEEDS','{}'::jsonb),'RATING_OVERRIDES',coalesce(d->'RATING_OVERRIDES','{}'::jsonb));
END $$;
CREATE TABLE IF NOT EXISTS public.sohail_sport_versions(liga_id text PRIMARY KEY REFERENCES public.liga_state(id) ON DELETE CASCADE, source_version bigint NOT NULL, sport_hash text NOT NULL CHECK(sport_hash ~ '^[a-f0-9]{64}$'));
CREATE TABLE IF NOT EXISTS public.sohail_derived_cache(scope text PRIMARY KEY CHECK(scope IN ('public','authenticated')),signature text NOT NULL,model text NOT NULL,as_of date NOT NULL,payload jsonb NOT NULL CHECK(octet_length(payload::text)<=4194304),created_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION public.sohail_perf_track_state()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d jsonb; h text;
BEGIN
 d:=public.sohail_perf_document(NEW.data);h:=encode(sha256(convert_to(public.sohail_perf_projection(d)::text,'UTF8')),'hex');
 INSERT INTO public.sohail_sport_versions(liga_id,source_version,sport_hash) VALUES(NEW.id,coalesce((d->>'_v')::bigint,0),h) ON CONFLICT(liga_id) DO UPDATE SET source_version=excluded.source_version,sport_hash=excluded.sport_hash;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sohail_perf_state_version ON public.liga_state;
CREATE TRIGGER sohail_perf_state_version AFTER INSERT OR UPDATE OF data ON public.liga_state FOR EACH ROW EXECUTE FUNCTION public.sohail_perf_track_state();
INSERT INTO public.sohail_sport_versions(liga_id,source_version,sport_hash) SELECT id,coalesce((public.sohail_perf_document(data)->>'_v')::bigint,0),encode(sha256(convert_to(public.sohail_perf_projection(data)::text,'UTF8')),'hex') FROM public.liga_state ON CONFLICT(liga_id) DO UPDATE SET source_version=excluded.source_version,sport_hash=excluded.sport_hash;
CREATE OR REPLACE FUNCTION public.sohail_perf_manifest(p_private boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE items jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM public.liga_index i LEFT JOIN public.sohail_sport_versions v ON v.liga_id=i.id LEFT JOIN public.liga_state s ON s.id=i.id WHERE (p_private OR i.estado='finalizada') AND (v.liga_id IS NULL OR s.id IS NULL)) THEN RAISE EXCEPTION 'Incomplete sporting source'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'nombre',i.nombre,'estado',i.estado,'orden',i.orden,'version',v.source_version,'sport',v.sport_hash) ORDER BY i.id),'[]'::jsonb) INTO items FROM public.liga_index i JOIN public.sohail_sport_versions v ON v.liga_id=i.id WHERE p_private OR i.estado='finalizada';
 RETURN jsonb_build_object('index',items,'signature',encode(sha256(convert_to((SELECT coalesce(jsonb_agg(x.value-'version' ORDER BY x.value->>'id'),'[]'::jsonb)::text FROM jsonb_array_elements(items) x),'UTF8')),'hex'));
END $$;
CREATE OR REPLACE FUNCTION public.sohail_perf_source(p_private boolean,p_snapshot boolean DEFAULT false,p_model text DEFAULT '',p_player text DEFAULT NULL,p_signature text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m jsonb; s jsonb; cached jsonb;
BEGIN
 m:=public.sohail_perf_manifest(p_private);
 SELECT payload INTO cached FROM public.sohail_derived_cache WHERE scope=CASE WHEN p_private THEN 'authenticated' ELSE 'public' END AND signature=m->>'signature' AND model=p_model AND as_of=(statement_timestamp() AT TIME ZONE 'UTC')::date;
 IF cached IS NOT NULL THEN
  cached:=jsonb_set(cached,'{computed,info}',(SELECT coalesce(jsonb_object_agg(x.key,CASE WHEN x.key=p_player THEN x.value ELSE x.value-'selected' END),'{}'::jsonb) FROM jsonb_each(cached->'computed'->'info') x));
 END IF;
 IF p_snapshot AND (p_signature IS NULL OR p_signature IS DISTINCT FROM m->>'signature') THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'data',public.sohail_perf_projection(l.data)||jsonb_build_object('_v',v.source_version)) ORDER BY l.id),'[]'::jsonb) INTO s FROM public.liga_state l JOIN public.liga_index i ON i.id=l.id JOIN public.sohail_sport_versions v ON v.liga_id=l.id WHERE p_private OR i.estado='finalizada';
 END IF;
 RETURN m||jsonb_build_object('states',s,'cache',cached,'asOf',to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD'));
END $$;
CREATE OR REPLACE FUNCTION public.sohail_perf_cache_put(p_private boolean,p_signature text,p_model text,p_as_of date,p_payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF length(p_model)>100 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>4194304 THEN RETURN false; END IF;
 IF p_signature IS DISTINCT FROM (public.sohail_perf_manifest(p_private)->>'signature') OR p_as_of IS DISTINCT FROM (statement_timestamp() AT TIME ZONE 'UTC')::date THEN RETURN false; END IF;
 INSERT INTO public.sohail_derived_cache(scope,signature,model,as_of,payload) VALUES(CASE WHEN p_private THEN 'authenticated' ELSE 'public' END,p_signature,p_model,p_as_of,p_payload) ON CONFLICT(scope) DO UPDATE SET signature=excluded.signature,model=excluded.model,as_of=excluded.as_of,payload=excluded.payload,created_at=now();
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.sohail_perf_login_source(p_user text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE idx jsonb; states jsonb;
BEGIN
 IF p_user IS NULL OR length(p_user) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid user'; END IF;
 IF EXISTS(SELECT 1 FROM public.liga_index i LEFT JOIN public.liga_state s ON s.id=i.id WHERE i.estado='activa' AND (s.id IS NULL OR jsonb_typeof(public.sohail_perf_document(s.data)->'users') IS DISTINCT FROM 'object')) THEN RAISE EXCEPTION 'Incomplete login source'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'estado',estado,'orden',orden) ORDER BY orden ASC,id),'[]'::jsonb) INTO idx FROM public.liga_index;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'data',CASE WHEN (public.sohail_perf_document(s.data)->'users') ? p_user THEN public.sohail_perf_document(s.data) ELSE '{"users":{}}'::jsonb END) ORDER BY i.orden ASC,i.id),'[]'::jsonb) INTO states FROM public.liga_index i JOIN public.liga_state s ON s.id=i.id WHERE i.estado='activa';
 RETURN jsonb_build_object('index',idx,'states',states);
END $$;
-- Lease and ledger for new daily-v510 objects only. Legacy copies are not silently deleted.
CREATE TABLE IF NOT EXISTS public.sohail_backup_lock(id integer PRIMARY KEY CHECK(id=1),owner uuid,expires_at timestamptz);
CREATE TABLE IF NOT EXISTS public.sohail_backup_runs(file text PRIMARY KEY CHECK(file ~ '^daily-v510-[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-f0-9]{32}\.sohail\.enc$'),day date NOT NULL,verified boolean NOT NULL DEFAULT false,digest text,size_bytes bigint,created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS sohail_backup_one_day ON public.sohail_backup_runs(day) WHERE verified;
INSERT INTO public.sohail_backup_lock(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.sohail_perf_backup(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE own uuid=(p_data->>'owner')::uuid; l public.sohail_backup_lock; existing jsonb; keep jsonb; obsolete jsonb;
BEGIN
 IF own IS NULL THEN RAISE EXCEPTION 'Missing backup owner'; END IF;
 SELECT * INTO l FROM public.sohail_backup_lock WHERE id=1 FOR UPDATE;
 IF p_action='acquire' THEN
  IF l.expires_at>clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'code','BACKUP_BUSY'); END IF;
  UPDATE public.sohail_backup_lock SET owner=own,expires_at=clock_timestamp()+interval '10 minutes' WHERE id=1;
  SELECT to_jsonb(r) INTO existing FROM public.sohail_backup_runs r WHERE day=(statement_timestamp() AT TIME ZONE 'UTC')::date AND verified;
  RETURN jsonb_build_object('ok',true,'day',to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD'),'existing',existing);
 END IF;
 IF l.owner IS DISTINCT FROM own OR l.expires_at IS NULL OR l.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'code','BACKUP_LOCK_LOST'); END IF;
 IF p_action='release' THEN UPDATE public.sohail_backup_lock SET owner=NULL,expires_at=NULL WHERE id=1;RETURN jsonb_build_object('ok',true);END IF;
 IF p_action='register' THEN
  IF (p_data->>'day')::date IS DISTINCT FROM (statement_timestamp() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'Invalid day';END IF;
  IF (p_data->>'file') IS NULL OR substring(p_data->>'file' from 12 for 10) IS DISTINCT FROM p_data->>'day' THEN RAISE EXCEPTION 'Invalid filename day';END IF;
  INSERT INTO public.sohail_backup_runs(file,day) VALUES(p_data->>'file',(p_data->>'day')::date);
 ELSIF p_action='verified' THEN
  IF (p_data->>'digest') IS NULL OR (p_data->>'size') IS NULL OR (p_data->>'digest') !~ '^[a-f0-9]{64}$' OR (p_data->>'size')::bigint NOT BETWEEN 1 AND 37748736 THEN RAISE EXCEPTION 'Invalid backup record';END IF;
  UPDATE public.sohail_backup_runs SET verified=true,digest=p_data->>'digest',size_bytes=(p_data->>'size')::bigint WHERE file=p_data->>'file';IF NOT FOUND THEN RAISE EXCEPTION 'Unknown backup';END IF;
 ELSIF p_action='plan' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(k) ORDER BY k.day DESC),'[]'::jsonb) INTO keep FROM(SELECT * FROM public.sohail_backup_runs WHERE verified ORDER BY day DESC LIMIT 3) k;
  IF jsonb_array_length(keep)=0 THEN RETURN jsonb_build_object('ok',true,'keep',keep,'remove','[]'::jsonb);END IF;
  SELECT coalesce(jsonb_agg(r.file),'[]'::jsonb) INTO obsolete FROM public.sohail_backup_runs r WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(keep) k WHERE k->>'file'=r.file);
  RETURN jsonb_build_object('ok',true,'keep',keep,'remove',obsolete);
 ELSIF p_action='deleted' THEN
  DELETE FROM public.sohail_backup_runs WHERE file IN(SELECT jsonb_array_elements_text(p_data->'files')) AND file NOT IN(SELECT file FROM public.sohail_backup_runs WHERE verified ORDER BY day DESC LIMIT 3);
 ELSE RAISE EXCEPTION 'Unknown backup action';END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
CREATE OR REPLACE FUNCTION public.sohail_perf_rules_doc(p_raw jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('normativa',coalesce(public.sohail_perf_document(p_raw)->>'REGLAMENTO',''),'secciones',CASE WHEN jsonb_typeof(public.sohail_perf_document(p_raw)->'REGLAMENTO_SECCIONES')='object' THEN public.sohail_perf_document(p_raw)->'REGLAMENTO_SECCIONES' ELSE '{}'::jsonb END);
$$;
CREATE OR REPLACE FUNCTION public.sohail_perf_principal(p_name text,p_user jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN coalesce(p_user->>'jugadorId','')<>'' THEN 'g:'||(p_user->>'jugadorId') WHEN coalesce(p_user->>'_credentialId','')<>'' THEN 'i:'||(p_user->>'_credentialId') ELSE 'n:'||p_name END;
$$;
CREATE OR REPLACE FUNCTION public.sohail_perf_rules(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE session jsonb; actor text=p_data->>'actor'; principal text=p_data->>'principal'; src jsonb; su jsonb; st jsonb; tu jsonb; raw jsonb; docs jsonb; cleaned jsonb; sections jsonb; row record; section record; output jsonb='[]'::jsonb; is_super boolean; h text; v bigint; saved_bytes integer; kind text=p_data->>'kind';
BEGIN
 IF p_action NOT IN('report','export','clean') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid rules action';END IF;
 PERFORM 1 FROM public.sohail_account_security WHERE id=principal AND epoch=(p_data->>'epoch')::bigint FOR SHARE;
 session:=public.sohail_p2_session('read',jsonb_build_object('id',p_data->>'sid','principal',principal,'epoch',(p_data->>'epoch')::bigint));
 IF coalesce((session->>'ok')::boolean,false)=false OR coalesce((session->>'must_change')::boolean,true) THEN RETURN jsonb_build_object('ok',false,'code','SESSION_EXPIRED');END IF;
 SELECT public.sohail_perf_document(data) INTO src FROM public.liga_state WHERE id=p_data->>'source' FOR SHARE;
 su:=src->'users'->actor;is_super:=coalesce(su->>'role'='superadmin',false);
 IF su IS NULL OR coalesce((su->>'inactive')::boolean,false) OR public.sohail_perf_principal(actor,su) IS DISTINCT FROM principal OR NOT(is_super OR coalesce(su->>'role'='admin',false) OR coalesce((su->>'isAdmin')::boolean,false)) THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN');END IF;
 IF p_action='clean' AND(session->'session'->>'verified_at' IS NULL OR (session->'session'->>'verified_at')::timestamptz<clock_timestamp()-interval '10 minutes' OR (session->'session'->>'verified_at')::timestamptz>clock_timestamp()+interval '1 minute') THEN RETURN jsonb_build_object('ok',false,'code','REAUTH_REQUIRED');END IF;
 FOR row IN SELECT i.id,i.nombre FROM public.liga_index i WHERE i.estado='finalizada' AND(p_action='report' OR i.id=p_data->>'league') ORDER BY i.id FOR UPDATE LOOP
  SELECT data INTO raw FROM public.liga_state WHERE id=row.id FOR UPDATE;
  st:=public.sohail_perf_document(raw);tu:=st->'users'->actor;
  IF NOT is_super AND(tu IS NULL OR coalesce((tu->>'inactive')::boolean,false) OR public.sohail_perf_principal(actor,tu) IS DISTINCT FROM principal OR NOT(coalesce(tu->>'role' IN('admin','superadmin'),false) OR coalesce((tu->>'isAdmin')::boolean,false))) THEN CONTINUE;END IF;
  docs:=public.sohail_perf_rules_doc(raw);v:=coalesce((st->>'_v')::bigint,0);h:=encode(sha256(convert_to(docs::text,'UTF8')),'hex');
  IF p_action='report' THEN output:=output||jsonb_build_array(jsonb_build_object('id',row.id,'name',row.nombre,'version',v,'digest',h,'bytes',octet_length(docs::text),'images',(SELECT count(*) FROM regexp_matches(docs::text,'data:image/','g'))));CONTINUE;END IF;
  IF p_action='export' THEN RETURN jsonb_build_object('ok',true,'format','sohail-rules-archive-1','id',row.id,'name',row.nombre,'version',v,'digest',h,'rules',docs);END IF;
  IF p_data->>'digest' IS DISTINCT FROM h OR (p_data->>'version')::bigint IS DISTINCT FROM v THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT');END IF;
  IF kind='images' THEN
   sections:='{}'::jsonb;
   FOR section IN SELECT key,value FROM jsonb_each(docs->'secciones') LOOP
    IF jsonb_typeof(section.value)<>'string' THEN RAISE EXCEPTION 'Invalid rule section';END IF;
    sections:=sections||jsonb_build_object(section.key,regexp_replace(section.value#>>'{}',$rx$<img\y(?:[^>"']|"[^"]*"|'[^']*')*>$rx$,'','gi'));
   END LOOP;
   cleaned:=jsonb_build_object('normativa',regexp_replace(docs->>'normativa',$rx$<img\y(?:[^>"']|"[^"]*"|'[^']*')*>$rx$,'','gi'),'secciones',sections);
  ELSIF kind='all' THEN cleaned:='{"normativa":"","secciones":{}}'::jsonb;
  ELSE RAISE EXCEPTION 'Invalid rules cleanup mode';END IF;
  IF cleaned=docs THEN RETURN jsonb_build_object('ok',true,'changed',false,'savedBytes',0,'version',v);END IF;
  st:=jsonb_set(jsonb_set(st,'{REGLAMENTO}',cleaned->'normativa',true),'{REGLAMENTO_SECCIONES}',cleaned->'secciones',true);
  st:=jsonb_set(st,'{_v}',to_jsonb(v+1),true);saved_bytes:=greatest(0,octet_length(docs::text)-octet_length(cleaned::text));
  UPDATE public.liga_state SET data=CASE WHEN jsonb_typeof(raw)='string' THEN to_jsonb(st::text) ELSE st END WHERE id=p_data->>'league';
  INSERT INTO public.audit_log(actor,action,target,details) VALUES(actor,'rules.cleanup',p_data->>'league',jsonb_build_object('kind',kind,'savedBytes',saved_bytes,'previousDigest',h));
  RETURN jsonb_build_object('ok',true,'changed',true,'savedBytes',saved_bytes,'version',v+1);
 END LOOP;
 IF p_action='report' THEN RETURN jsonb_build_object('ok',true,'leagues',output);END IF;
 RETURN jsonb_build_object('ok',false,'code','RULES_NOT_AVAILABLE');
END $$;
DO $$ DECLARE t text; f record; BEGIN
 FOREACH t IN ARRAY ARRAY['sohail_sport_versions','sohail_derived_cache','sohail_backup_lock','sohail_backup_runs'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO service_role',t);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'sohail_perf_%' LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
