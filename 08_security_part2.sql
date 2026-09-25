-- SOHAIL Security Part 2 / v4.9. ADDITIVE migration in the existing project.
-- Do not run supabase_setup.sql. Back up first. No password is reset by this script.
BEGIN;
SET LOCAL lock_timeout='8s';
SET LOCAL statement_timeout='120s';
DO $$ BEGIN
 IF to_regclass('public.sohail_account_security') IS NULL OR to_regclass('public.liga_state') IS NULL
 OR to_regclass('public.audit_log') IS NULL OR to_regclass('public.jugadores') IS NULL OR to_regclass('public.passkeys') IS NULL
 OR to_regprocedure('public.sohail_decode_state(jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Existing Sohail authentication schema required. No changes applied.';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.sohail_auth_sessions(
 id text PRIMARY KEY CHECK(id ~ '^[0-9a-f]{64}$'),
 public_id uuid NOT NULL UNIQUE,
 principal text NOT NULL REFERENCES public.sohail_account_security(id) ON DELETE CASCADE,
 epoch bigint NOT NULL CHECK(epoch>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),
 method text NOT NULL CHECK(method IN ('password','passkey')),
 device_label text NOT NULL DEFAULT 'Browser' CHECK(length(device_label)<=80),
 revoked_at timestamptz,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '24 hours')
);
CREATE INDEX IF NOT EXISTS sohail_auth_sessions_account_idx ON public.sohail_auth_sessions(principal,expires_at);
CREATE TABLE IF NOT EXISTS public.sohail_auth_challenges(
 id text PRIMARY KEY CHECK(id ~ '^[0-9a-f]{64}$'),
 kind text NOT NULL CHECK(kind IN ('auth','reg','reauth')),
 principal text,
 epoch bigint,
 session_hash text,
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sohail_auth_challenges_expiry_idx ON public.sohail_auth_challenges(expires_at);
ALTER TABLE public.sohail_auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sohail_auth_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sohail_auth_sessions,public.sohail_auth_challenges FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.sohail_auth_sessions,public.sohail_auth_challenges TO service_role;
ALTER TABLE public.passkeys ADD COLUMN IF NOT EXISTS principal_key text;
-- Bind existing devices ONLY when their name has exactly one credential identity.
-- Ambiguous names remain unbound and must use the password until reviewed.
WITH candidates AS (
 SELECT k.credential_id, CASE WHEN coalesce(u.value->>'jugadorId','')<>'' THEN 'g:'||(u.value->>'jugadorId')
 WHEN coalesce(u.value->>'_credentialId','')<>'' THEN 'i:'||(u.value->>'_credentialId') ELSE 'n:'||u.key END principal
 FROM public.passkeys k CROSS JOIN public.liga_state s
 CROSS JOIN LATERAL jsonb_each(coalesce(public.sohail_decode_state(to_jsonb(s.data))->'users','{}'::jsonb)) u
 WHERE k.principal_key IS NULL AND u.key=k.user_name
), unique_ids AS (SELECT credential_id,min(principal) principal FROM candidates GROUP BY credential_id HAVING count(DISTINCT principal)=1)
UPDATE public.passkeys k SET principal_key=u.principal FROM unique_ids u WHERE k.credential_id=u.credential_id AND k.principal_key IS NULL;

CREATE OR REPLACE FUNCTION public.sohail_p2_session(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.sohail_account_security%ROWTYPE; s public.sohail_auth_sessions%ROWTYPE;
 prior public.sohail_auth_sessions%ROWTYPE; sid text:=p_data->>'id'; pk text:=p_data->>'principal';
 ep bigint:=(p_data->>'epoch')::bigint; now_at timestamptz:=clock_timestamp(); n integer; out_rows jsonb;
BEGIN
 IF p_action IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR p_action NOT IN ('create','read','revoke','list','revoke-one','revoke-all','cleanup') THEN RAISE EXCEPTION 'Unknown session action'; END IF;
 IF p_action='cleanup' THEN
  DELETE FROM public.sohail_auth_sessions WHERE expires_at<now_at-interval '7 days';
  GET DIAGNOSTICS n=ROW_COUNT;
  DELETE FROM public.sohail_auth_challenges WHERE expires_at<now_at;
  RETURN jsonb_build_object('ok',true,'sessionsRemoved',n);
 END IF;
 IF sid IS NULL OR sid !~ '^[0-9a-f]{64}$' OR pk IS NULL OR ep IS NULL THEN RAISE EXCEPTION 'Invalid session parameters'; END IF;
 -- Account before session: same lock order as credential writes and rotation.
 IF p_action IN ('create','revoke','revoke-one','revoke-all') THEN
  SELECT * INTO a FROM public.sohail_account_security WHERE id=pk FOR UPDATE;
 ELSE SELECT * INTO a FROM public.sohail_account_security WHERE id=pk; END IF;
 IF a.id IS NULL OR a.epoch<>ep THEN
  RETURN jsonb_build_object('ok',p_action='revoke','revoked',0);
 END IF;
 IF p_action='create' THEN
  IF coalesce(p_data->>'method','') NOT IN ('password','passkey') THEN RAISE EXCEPTION 'Invalid proof method'; END IF;
  IF p_data->>'method'='passkey' THEN
   -- A deletion or password reset during verification must not create a session.
   PERFORM 1 FROM public.passkeys WHERE credential_id=p_data->>'credential_id' AND principal_key=pk FOR KEY SHARE;
   IF NOT FOUND OR a.must_change THEN RETURN jsonb_build_object('ok',false); END IF;
  END IF;
  IF p_data->>'previous' IS NOT NULL THEN
   SELECT * INTO prior FROM public.sohail_auth_sessions WHERE id=p_data->>'previous' AND principal=pk FOR UPDATE;
   IF prior.id IS NULL OR prior.epoch<>ep OR prior.revoked_at IS NOT NULL OR prior.expires_at<=now_at OR a.must_change THEN RETURN jsonb_build_object('ok',false); END IF;
  END IF;
  INSERT INTO public.sohail_auth_sessions(id,public_id,principal,epoch,created_at,expires_at,verified_at,method,device_label)
  VALUES(sid,(p_data->>'public_id')::uuid,pk,ep,coalesce(prior.created_at,date_trunc('milliseconds',now_at)),
   coalesce(prior.expires_at,date_trunc('milliseconds',now_at)+CASE WHEN a.must_change THEN interval '15 minutes' ELSE interval '24 hours' END),
   date_trunc('milliseconds',now_at),p_data->>'method',left(coalesce(p_data->>'device','Browser'),80)) RETURNING * INTO s;
  IF prior.id IS NOT NULL THEN UPDATE public.sohail_auth_sessions SET revoked_at=now_at WHERE id=prior.id; END IF;
  -- Bound storage and simultaneous device sessions without extending their lifetime.
  UPDATE public.sohail_auth_sessions SET revoked_at=now_at WHERE id IN
   (SELECT id FROM public.sohail_auth_sessions WHERE principal=pk AND revoked_at IS NULL AND expires_at>now_at ORDER BY (id=sid) DESC,verified_at DESC,id DESC OFFSET 30);
  DELETE FROM public.sohail_auth_sessions WHERE principal=pk AND expires_at<now_at-interval '7 days';
  RETURN jsonb_build_object('ok',true,'session',to_jsonb(s)-'id','must_change',a.must_change);
 END IF;
 SELECT * INTO s FROM public.sohail_auth_sessions WHERE id=sid AND principal=pk;
 IF p_action='revoke' THEN
  UPDATE public.sohail_auth_sessions SET revoked_at=now_at WHERE id=sid AND principal=pk AND epoch=ep AND revoked_at IS NULL;
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'revoked',n);
 END IF;
 IF s.id IS NULL OR s.epoch<>ep OR s.revoked_at IS NOT NULL OR s.expires_at<=now_at THEN RETURN jsonb_build_object('ok',false); END IF;
 IF p_action='read' THEN RETURN jsonb_build_object('ok',true,'epoch',a.epoch,'must_change',a.must_change,'session',to_jsonb(s)-'id'); END IF;
 IF p_action='list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.public_id,'device',x.device_label,'created',x.created_at,'expires',x.expires_at,'method',x.method,'current',x.id=sid) ORDER BY x.created_at DESC),'[]'::jsonb)
  INTO out_rows FROM public.sohail_auth_sessions x WHERE x.principal=pk AND x.epoch=ep AND x.revoked_at IS NULL AND x.expires_at>now_at;
  RETURN jsonb_build_object('ok',true,'sessions',out_rows);
 END IF;
 IF p_action='revoke-one' THEN
  UPDATE public.sohail_auth_sessions SET revoked_at=now_at WHERE principal=pk AND public_id=(p_data->>'target')::uuid AND revoked_at IS NULL;
 ELSE UPDATE public.sohail_auth_sessions SET revoked_at=now_at WHERE principal=pk AND revoked_at IS NULL; END IF;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('ok',true,'revoked',n,'signedOut',p_action='revoke-all' OR s.public_id::text=p_data->>'target');
END $$;
REVOKE ALL ON FUNCTION public.sohail_p2_session(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sohail_p2_session(text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.sohail_p2_store_password(p_principal text,p_epoch bigint,p_hash text,p_temporary boolean,p_rehash boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE acc public.sohail_account_security%ROWTYPE; row_state record; st jsonb; item record;
 matched boolean; ct text; output text; computed_principal text;
BEGIN
 IF p_hash IS NULL OR p_hash !~ '^v3:scrypt:32768:8:3:[0-9a-f]{32}:[0-9a-f]{64}$' OR p_temporary IS NULL OR p_rehash IS NULL THEN RAISE EXCEPTION 'Invalid v3 password format'; END IF;
 SELECT * INTO acc FROM public.sohail_account_security WHERE id=p_principal FOR UPDATE;
 IF NOT FOUND OR acc.epoch<>p_epoch THEN RETURN jsonb_build_object('ok',false); END IF;
 UPDATE public.sohail_account_security SET pass_hash=p_hash,epoch=epoch+CASE WHEN p_rehash THEN 0 ELSE 1 END,
 must_change=p_temporary,tutorial_epoch=tutorial_epoch+CASE WHEN p_temporary AND NOT p_rehash THEN 1 ELSE 0 END,updated_at=clock_timestamp()
 WHERE id=p_principal RETURNING * INTO acc;
 IF NOT p_rehash THEN UPDATE public.sohail_auth_sessions SET revoked_at=clock_timestamp() WHERE principal=p_principal AND revoked_at IS NULL; END IF;
 IF left(p_principal,2)='g:' THEN
  UPDATE public.jugadores SET pass=p_hash,actualizado=clock_timestamp() WHERE id=substr(p_principal,3);
  IF NOT FOUND THEN RAISE EXCEPTION 'Global profile missing'; END IF;
 END IF;
 SELECT udt_name INTO ct FROM information_schema.columns WHERE table_schema='public' AND table_name='liga_state' AND column_name='data';
 IF ct NOT IN ('json','jsonb','text','varchar') THEN RAISE EXCEPTION 'Unsupported state type'; END IF;
 FOR row_state IN SELECT id,to_jsonb(data) raw FROM public.liga_state ORDER BY id FOR UPDATE LOOP
  st=public.sohail_decode_state(row_state.raw);matched=false;
  FOR item IN SELECT key,value FROM jsonb_each(coalesce(st->'users','{}'::jsonb)) LOOP
   computed_principal=CASE WHEN coalesce(item.value->>'jugadorId','')<>'' THEN 'g:'||(item.value->>'jugadorId')
    WHEN coalesce(item.value->>'_credentialId','')<>'' THEN 'i:'||(item.value->>'_credentialId') ELSE 'n:'||item.key END;
   IF computed_principal=p_principal THEN
    st=jsonb_set(st,ARRAY['users',item.key,'pass'],to_jsonb(p_hash),true);
    st=jsonb_set(st,ARRAY['users',item.key,'passwordTemporary'],to_jsonb(p_temporary),true);matched=true;
   END IF;
  END LOOP;
  IF matched THEN
   -- Rehash changes only server credential metadata, never sporting data or the
   -- public version. Password changes increment the version as before.
   IF NOT p_rehash THEN st=jsonb_set(st,'{_v}',to_jsonb(coalesce((st->>'_v')::bigint,0)+1),true); END IF;
   output=CASE WHEN ct IN ('json','jsonb') AND jsonb_typeof(row_state.raw)='string' THEN to_jsonb(st::text)::text ELSE st::text END;
   EXECUTE format('UPDATE public.liga_state SET data=$2::%s WHERE id=$1',ct) USING row_state.id,output;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'account',to_jsonb(acc));
END $$;
REVOKE ALL ON FUNCTION public.sohail_p2_store_password(text,bigint,text,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sohail_p2_store_password(text,bigint,text,boolean,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.sohail_p2_rehash(p_principal text,p_epoch bigint,p_expected text,p_hash text,p_master boolean,p_temporary boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.sohail_account_security%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.sohail_account_security WHERE id=p_principal FOR UPDATE;
 IF a.id IS NULL OR a.epoch<>p_epoch OR a.pass_hash IS DISTINCT FROM p_expected OR a.pass_hash LIKE 'v3:%'
 OR (p_master AND a.epoch<>0) THEN RETURN jsonb_build_object('ok',false); END IF;
 RETURN public.sohail_p2_store_password(p_principal,p_epoch,p_hash,a.must_change OR p_temporary,true);
END $$;
REVOKE ALL ON FUNCTION public.sohail_p2_rehash(text,bigint,text,text,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sohail_p2_rehash(text,bigint,text,text,boolean,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.sohail_p2_change_password(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.sohail_account_security%ROWTYPE; actor_acc public.sohail_account_security%ROWTYPE;
 s public.sohail_auth_sessions%ROWTYPE; st jsonb; actor_user jsonb; target_user jsonb;
 actor_key text:=p_data->>'actor_key'; target_key text:=p_data->>'target_key';
 target_name text:=p_data->>'target'; actor_name text:=p_data->>'actor';
 pk text; other boolean:=actor_key IS DISTINCT FROM target_key; manager boolean; r jsonb;
BEGIN
 -- Deterministic account lock order prevents two administrators resetting each
 -- other from deadlocking. Session must still be live at the moment of mutation.
 PERFORM 1 FROM public.sohail_account_security WHERE id IN (actor_key,target_key) ORDER BY id FOR UPDATE;
 SELECT * INTO actor_acc FROM public.sohail_account_security WHERE id=actor_key;
 SELECT * INTO a FROM public.sohail_account_security WHERE id=target_key;
 SELECT * INTO s FROM public.sohail_auth_sessions WHERE id=p_data->>'session_hash' AND principal=actor_key FOR UPDATE;
 IF a.id IS NULL OR actor_acc.id IS NULL OR s.id IS NULL OR s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp()
 OR s.epoch<>actor_acc.epoch OR a.epoch IS DISTINCT FROM (p_data->>'target_epoch')::bigint
 OR a.pass_hash IS DISTINCT FROM p_data->>'expected_hash' THEN RETURN jsonb_build_object('ok',false,'code','CREDENTIAL_CONFLICT'); END IF;
 -- Lock all state rows in the same order used by the credential-copy writer.
 -- A role cannot change between authorization and password mutation.
 PERFORM 1 FROM public.liga_state ORDER BY id FOR UPDATE;
 SELECT public.sohail_decode_state(to_jsonb(data)) INTO st FROM public.liga_state WHERE id=p_data->>'liga';
 actor_user=st->'users'->actor_name;target_user=st->'users'->target_name;
 IF actor_user IS NULL OR target_user IS NULL OR coalesce((actor_user->>'inactive')::boolean,false) THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN'); END IF;
 pk=CASE WHEN coalesce(actor_user->>'jugadorId','')<>'' THEN 'g:'||(actor_user->>'jugadorId') WHEN coalesce(actor_user->>'_credentialId','')<>'' THEN 'i:'||(actor_user->>'_credentialId') ELSE 'n:'||actor_name END;
 IF pk<>actor_key THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN'); END IF;
 pk=CASE WHEN coalesce(target_user->>'jugadorId','')<>'' THEN 'g:'||(target_user->>'jugadorId') WHEN coalesce(target_user->>'_credentialId','')<>'' THEN 'i:'||(target_user->>'_credentialId') ELSE 'n:'||target_name END;
 IF pk<>target_key THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN'); END IF;
 manager=actor_name='admin' OR coalesce(actor_user->>'role','')='superadmin';
 IF other AND (actor_acc.must_change OR s.verified_at<clock_timestamp()-interval '10 minutes'
 OR NOT(coalesce(actor_user->>'role','') IN ('admin','superadmin') OR coalesce((actor_user->>'isAdmin')::boolean,false))
 OR coalesce(target_user->>'role','')='superadmin' OR (NOT manager AND (target_name='admin' OR coalesce(target_user->>'role','')='admin' OR coalesce((target_user->>'isAdmin')::boolean,false)))) THEN
 RETURN jsonb_build_object('ok',false,'code','FORBIDDEN'); END IF;
 r=public.sohail_p2_store_password(target_key,a.epoch,p_data->>'hash',other,false);
 IF r->>'ok'='true' THEN
  IF other AND coalesce((p_data->>'revoke_passkeys')::boolean,false) THEN DELETE FROM public.passkeys WHERE principal_key=target_key; END IF;
  INSERT INTO public.audit_log(actor,action,target,details) VALUES(actor_name,CASE WHEN other THEN 'pass.admin_reset' ELSE 'pass.self_change' END,target_name,
   jsonb_build_object('temporary',other,'passkeysRevoked',other AND coalesce((p_data->>'revoke_passkeys')::boolean,false),'format','scrypt-v3'));
 END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.sohail_p2_change_password(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sohail_p2_change_password(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.sohail_p2_challenge(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.sohail_auth_challenges%ROWTYPE;
BEGIN
 IF p_action='issue' THEN
  DELETE FROM public.sohail_auth_challenges WHERE expires_at<clock_timestamp()-interval '1 hour';
  INSERT INTO public.sohail_auth_challenges(id,kind,principal,epoch,session_hash,expires_at)
  VALUES(p_data->>'id',p_data->>'kind',p_data->>'principal',(p_data->>'epoch')::bigint,p_data->>'session_hash',clock_timestamp()+interval '5 minutes');
  RETURN jsonb_build_object('ok',true);
 ELSIF p_action='consume' THEN
  UPDATE public.sohail_auth_challenges SET used_at=clock_timestamp() WHERE id=p_data->>'id' AND kind=p_data->>'kind'
  AND principal IS NOT DISTINCT FROM p_data->>'principal' AND epoch IS NOT DISTINCT FROM (p_data->>'epoch')::bigint
  AND session_hash IS NOT DISTINCT FROM p_data->>'session_hash' AND used_at IS NULL AND expires_at>clock_timestamp() RETURNING * INTO c;
  RETURN jsonb_build_object('ok',c.id IS NOT NULL);
 END IF;
 RAISE EXCEPTION 'Unknown challenge action';
END $$;
REVOKE ALL ON FUNCTION public.sohail_p2_challenge(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sohail_p2_challenge(text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.sohail_p2_passkey(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.sohail_account_security%ROWTYPE; s public.sohail_auth_sessions%ROWTYPE;
 k public.passkeys%ROWTYPE; st jsonb; u jsonb; actual_key text; n bigint;
BEGIN
 IF p_action='counter' THEN
  UPDATE public.passkeys SET counter=(p_data->>'counter')::bigint,last_used_at=clock_timestamp()
   WHERE credential_id=p_data->>'credential_id' AND principal_key=p_data->>'principal_key'
   AND counter=(p_data->>'expected')::bigint AND (p_data->>'counter')::bigint>=counter
   RETURNING * INTO k;
  RETURN jsonb_build_object('ok',k.credential_id IS NOT NULL);
 END IF;
 IF p_action<>'register' OR p_action IS NULL THEN RAISE EXCEPTION 'Unknown passkey action'; END IF;
 SELECT * INTO a FROM public.sohail_account_security WHERE id=p_data->>'principal_key' FOR UPDATE;
 SELECT * INTO s FROM public.sohail_auth_sessions WHERE id=p_data->>'session_hash' AND principal=a.id FOR UPDATE;
 IF a.id IS NULL OR a.epoch IS DISTINCT FROM (p_data->>'epoch')::bigint OR a.must_change OR s.id IS NULL
 OR s.epoch<>a.epoch OR s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp()
 OR s.verified_at<clock_timestamp()-interval '10 minutes' THEN RETURN jsonb_build_object('ok',false,'code','SESSION_EXPIRED'); END IF;
 SELECT public.sohail_decode_state(to_jsonb(data)) INTO st FROM public.liga_state WHERE id=p_data->>'liga' FOR SHARE;
 u=st->'users'->(p_data->>'user_name');
 IF u IS NULL OR coalesce((u->>'inactive')::boolean,false) THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN'); END IF;
 actual_key=CASE WHEN coalesce(u->>'jugadorId','')<>'' THEN 'g:'||(u->>'jugadorId')
  WHEN coalesce(u->>'_credentialId','')<>'' THEN 'i:'||(u->>'_credentialId') ELSE 'n:'||(p_data->>'user_name') END;
 IF actual_key<>a.id THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN'); END IF;
 SELECT count(*) INTO n FROM public.passkeys WHERE principal_key=a.id;
 IF n>=10 THEN RETURN jsonb_build_object('ok',false,'code','PASSKEY_LIMIT'); END IF;
 -- Never UPSERT: a credential can never be reassigned to a different person.
 INSERT INTO public.passkeys(credential_id,user_name,principal_key,public_key,counter,device_label,transports)
 VALUES(p_data->>'credential_id',p_data->>'user_name',a.id,p_data->>'public_key',(p_data->>'counter')::bigint,
  left(coalesce(p_data->>'device_label','Device'),60),p_data->>'transports') ON CONFLICT(credential_id) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('ok',n=1);
END $$;
REVOKE ALL ON FUNCTION public.sohail_p2_passkey(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sohail_p2_passkey(text,jsonb) TO service_role;

-- A still-running old deployment must not downgrade an already migrated hash.
CREATE OR REPLACE FUNCTION public.sohail_p2_credential_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.epoch<OLD.epoch THEN RAISE EXCEPTION 'Credential epoch downgrade prohibited'; END IF;
 IF OLD.pass_hash LIKE 'v3:%' AND NEW.pass_hash NOT LIKE 'v3:%' THEN RAISE EXCEPTION 'Credential downgrade prohibited'; END IF;
 IF NEW.epoch<>OLD.epoch THEN UPDATE public.sohail_auth_sessions SET revoked_at=clock_timestamp() WHERE principal=NEW.id AND revoked_at IS NULL; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sohail_p2_credential_guard ON public.sohail_account_security;
CREATE TRIGGER sohail_p2_credential_guard BEFORE UPDATE ON public.sohail_account_security FOR EACH ROW EXECUTE FUNCTION public.sohail_p2_credential_guard();
REVOKE ALL ON FUNCTION public.sohail_p2_credential_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sohail_p2_credential_guard() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
