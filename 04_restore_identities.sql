-- SOHAIL v4.0 — transactional restores and sporting identities.
-- Run ONCE (safe to repeat) in the SAME Supabase project as the app.
-- This is an upgrade, NOT an initial database setup. No league is imported here.
BEGIN;
DO $$
BEGIN
 IF to_regclass('public.liga_state') IS NULL OR to_regclass('public.liga_index') IS NULL
    OR to_regclass('public.sohail_account_security') IS NULL OR to_regclass('public.jugadores') IS NULL THEN
  RAISE EXCEPTION 'Missing existing Sohail tables. This upgrade does not create or replace the current authentication schema.';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.sohail_identity_registry (
 id integer PRIMARY KEY CHECK(id=1),
 version bigint NOT NULL DEFAULT 0,
 data jsonb NOT NULL DEFAULT '{"links":{},"profiles":{},"decisions":{}}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.sohail_identity_registry(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.sohail_data_operations (
 id uuid PRIMARY KEY,
 kind text NOT NULL,
 actor text NOT NULL,
 actor_key text NOT NULL,
 request_digest text NOT NULL,
 before_states jsonb NOT NULL,
 before_registry jsonb,
 after_versions jsonb NOT NULL,
 registry_after bigint NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sohail_data_operations_created_idx ON public.sohail_data_operations(created_at DESC);
ALTER TABLE public.sohail_identity_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sohail_data_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sohail_identity_registry,public.sohail_data_operations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.sohail_identity_registry,public.sohail_data_operations TO service_role;
-- Previous legacy setup files exposed entire states and password configuration.
-- Current app reads/writes through the server. Close direct browser access, not API access.
ALTER TABLE public.liga_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.liga_state FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.liga_state TO service_role;
DO $$ BEGIN
 IF to_regclass('public.liga_config') IS NOT NULL THEN
  EXECUTE 'ALTER TABLE public.liga_config ENABLE ROW LEVEL SECURITY';
  EXECUTE 'REVOKE ALL ON public.liga_config FROM PUBLIC,anon,authenticated';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sohail_v400_document(v jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog
AS $$ SELECT CASE WHEN jsonb_typeof(v)='string' THEN (v#>>'{}')::jsonb ELSE v END $$;
REVOKE ALL ON FUNCTION public.sohail_v400_document(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sohail_v400_document(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.sohail_apply_data_operation(
 p_id uuid,p_kind text,p_actor text,p_actor_key text,p_epoch bigint,p_source text,
 p_digest text,p_states jsonb,p_registry_version bigint,p_registry jsonb,p_summary jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE
 reg public.sohail_identity_registry%ROWTYPE;
 oldop public.sohail_data_operations%ROWTYPE;
 item jsonb; doc jsonb; account jsonb; source_doc jsonb; actor_user jsonb;
 before_docs jsonb:='{}'::jsonb; versions jsonb:='{}'::jsonb; next_doc jsonb;
 v bigint; is_super boolean; target_user jsonb; actor_principal text;
 operation_result jsonb; dtype text; oldreg jsonb; existing_index jsonb;
BEGIN
 IF p_kind NOT IN ('restore','merge','link','decision','undo') OR p_digest IS NULL
    OR jsonb_typeof(p_states) IS DISTINCT FROM 'array' OR jsonb_array_length(p_states)<1 THEN
  RAISE EXCEPTION 'Invalid operation';
 END IF;
 -- Serialize this release's operations and prevent two equal request IDs committing.
 SELECT * INTO reg FROM public.sohail_identity_registry WHERE id=1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Registry missing'; END IF;
 SELECT * INTO oldop FROM public.sohail_data_operations WHERE id=p_id;
 IF FOUND THEN
  IF oldop.actor_key IS DISTINCT FROM p_actor_key OR oldop.kind IS DISTINCT FROM p_kind
     OR oldop.request_digest IS DISTINCT FROM p_digest THEN RETURN jsonb_build_object('ok',false,'code','OPERATION_REUSED'); END IF;
  RETURN oldop.result;
 END IF;
 IF reg.version<>p_registry_version THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT'); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_states) x GROUP BY x->>'id' HAVING count(*)>1)
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_states) x WHERE x->>'id'=p_source) THEN RAISE EXCEPTION 'Invalid lock set'; END IF;
 -- Lock the security row first, following the password-change flow's lock order.
 SELECT to_jsonb(a) INTO account FROM public.sohail_account_security a WHERE a.id=p_actor_key FOR UPDATE;
 IF account IS NULL OR (account->>'epoch')::bigint IS DISTINCT FROM p_epoch OR coalesce((account->>'must_change')::boolean,false) THEN
  RETURN jsonb_build_object('ok',false,'code','FORBIDDEN');
 END IF;
 -- All state and index rows are locked in a deterministic order; validate ALL versions
 -- before the first write. Any error below rolls back snapshots, index and states.
 FOR item IN SELECT value FROM jsonb_array_elements(p_states) ORDER BY value->>'id' LOOP
  SELECT public.sohail_v400_document(to_jsonb(s.data)) INTO doc FROM public.liga_state s WHERE s.id=item->>'id' FOR UPDATE;
  IF doc IS NULL THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT'); END IF;
  v:=coalesce((doc->>'_v')::bigint,0);
  IF v IS DISTINCT FROM (item->>'expected')::bigint THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT','currentV',v); END IF;
  SELECT to_jsonb(i) INTO existing_index FROM public.liga_index i WHERE i.id=item->>'id' FOR UPDATE;
  IF existing_index IS NULL THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT'); END IF;
  before_docs:=before_docs||jsonb_build_object(item->>'id',jsonb_build_object('state',doc,'indexName',existing_index->>'nombre','write',coalesce((item->>'write')::boolean,false)));
  IF item->>'id'=p_source THEN source_doc:=doc; END IF;
 END LOOP;
 actor_user:=source_doc->'users'->p_actor;
 actor_principal:=CASE WHEN coalesce(actor_user->>'jugadorId','')<>'' THEN 'g:'||(actor_user->>'jugadorId')
                       WHEN coalesce(actor_user->>'_credentialId','')<>'' THEN 'i:'||(actor_user->>'_credentialId') ELSE 'n:'||p_actor END;
 IF actor_user IS NULL OR coalesce((actor_user->>'inactive')::boolean,false) OR actor_principal<>p_actor_key THEN
  RETURN jsonb_build_object('ok',false,'code','FORBIDDEN');
 END IF;
 is_super:=coalesce(actor_user->>'role','')='superadmin';
 IF p_kind='undo' AND NOT is_super THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN'); END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_states) LOOP
  IF NOT coalesce((item->>'write')::boolean,false) THEN CONTINUE; END IF;
  doc:=before_docs->(item->>'id')->'state';target_user:=doc->'users'->p_actor;
  actor_principal:=CASE WHEN coalesce(target_user->>'jugadorId','')<>'' THEN 'g:'||(target_user->>'jugadorId')
                       WHEN coalesce(target_user->>'_credentialId','')<>'' THEN 'i:'||(target_user->>'_credentialId') ELSE 'n:'||p_actor END;
  IF NOT is_super AND (target_user IS NULL OR coalesce((target_user->>'inactive')::boolean,false)
     OR actor_principal<>p_actor_key OR NOT(coalesce(target_user->>'role','') IN ('admin','superadmin') OR coalesce((target_user->>'isAdmin')::boolean,false))) THEN
   RETURN jsonb_build_object('ok',false,'code','FORBIDDEN');
  END IF;
 END LOOP;
 -- Registry-only decisions still require an actual administrative source account.
 IF NOT is_super AND NOT(coalesce(actor_user->>'role','')='admin' OR coalesce((actor_user->>'isAdmin')::boolean,false)) THEN
  RETURN jsonb_build_object('ok',false,'code','FORBIDDEN');
 END IF;
 SELECT format_type(a.atttypid,a.atttypmod) INTO dtype FROM pg_attribute a
 WHERE a.attrelid='public.liga_state'::regclass AND a.attname='data' AND NOT a.attisdropped;
 IF dtype NOT IN ('text','json','jsonb','character varying') THEN RAISE EXCEPTION 'Unsupported liga_state.data type'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_states) ORDER BY value->>'id' LOOP
  IF NOT coalesce((item->>'write')::boolean,false) THEN CONTINUE; END IF;
  v:=(item->>'expected')::bigint+1;
  next_doc:=jsonb_set(item->'data','{_v}',to_jsonb(v),true);
  IF jsonb_typeof(next_doc->'users') IS DISTINCT FROM 'object' OR jsonb_typeof(next_doc->'matches') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid state document'; END IF;
  EXECUTE format('UPDATE public.liga_state SET data=$1::text::%s WHERE id=$2',dtype) USING next_doc::text,item->>'id';
  IF item ? 'indexName' THEN UPDATE public.liga_index SET nombre=item->>'indexName' WHERE id=item->>'id'; END IF;
  versions:=versions||jsonb_build_object(item->>'id',v);
 END LOOP;
 IF p_registry IS NOT NULL THEN
  IF jsonb_typeof(p_registry) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid registry'; END IF;
  oldreg:=reg.data;
  UPDATE public.sohail_identity_registry SET data=p_registry,version=version+1,updated_at=now() WHERE id=1 RETURNING * INTO reg;
 END IF;
 operation_result:=jsonb_build_object('ok',true,'operationId',p_id,'versions',versions,'registryVersion',reg.version,'summary',p_summary);
 INSERT INTO public.sohail_data_operations(id,kind,actor,actor_key,request_digest,before_states,before_registry,after_versions,registry_after,result)
 VALUES(p_id,p_kind,p_actor,p_actor_key,p_digest,before_docs,oldreg,versions,reg.version,operation_result);
 RETURN operation_result;
END $$;
REVOKE ALL ON FUNCTION public.sohail_apply_data_operation(uuid,text,text,text,bigint,text,text,jsonb,bigint,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sohail_apply_data_operation(uuid,text,text,text,bigint,text,text,jsonb,bigint,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
-- Expected: Success. Existing leagues, accounts, passwords and passkeys are unchanged.
