-- SOHAIL SECURITY PART 3 — additive migration; no sporting data is removed.
-- Run only after the isolated PostgreSQL workflow has passed. Part 2 is required.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $guard$
BEGIN
 IF pg_catalog.to_regclass('public.sohail_auth_sessions') IS NULL OR pg_catalog.to_regclass('public.sohail_account_security') IS NULL THEN
  RAISE EXCEPTION 'Install and verify Security Part 2 before Part 3';
 END IF;
END $guard$;

CREATE TABLE IF NOT EXISTS public.sohail_request_budgets(
 category text NOT NULL CHECK(category IN ('public','auth','read','write','heavy','backup')),
 key_hash text NOT NULL CHECK(key_hash ~ '^[0-9a-f]{64}$'),
 window_start timestamptz NOT NULL,
 hits integer NOT NULL CHECK(hits>0),
 PRIMARY KEY(category,key_hash)
);
CREATE INDEX IF NOT EXISTS sohail_request_budgets_expiry ON public.sohail_request_budgets(window_start);

CREATE OR REPLACE FUNCTION public.sohail_p3_budget(p_category text,p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE cap integer; seconds integer; stamp timestamptz; used integer; wait_s integer;
BEGIN
 cap=CASE p_category WHEN 'public' THEN 120 WHEN 'auth' THEN 30 WHEN 'read' THEN 240 WHEN 'write' THEN 60 WHEN 'heavy' THEN 12 WHEN 'backup' THEN 3 ELSE NULL END;
 IF cap IS NULL OR p_key IS NULL OR p_key !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid request budget' USING ERRCODE='22023'; END IF;
 seconds=CASE WHEN p_category='backup' THEN 300 ELSE 60 END;
 stamp=pg_catalog.to_timestamp(pg_catalog.floor(EXTRACT(epoch FROM pg_catalog.statement_timestamp())/seconds)*seconds);
 INSERT INTO public.sohail_request_budgets(category,key_hash,window_start,hits) VALUES(p_category,p_key,stamp,1)
 ON CONFLICT(category,key_hash) DO UPDATE SET
  window_start=EXCLUDED.window_start,
  hits=CASE WHEN public.sohail_request_budgets.window_start=EXCLUDED.window_start THEN LEAST(public.sohail_request_budgets.hits+1,cap+1) ELSE 1 END
 RETURNING hits INTO used;
 wait_s=GREATEST(1,CEIL(EXTRACT(epoch FROM (stamp+pg_catalog.make_interval(secs=>seconds)-pg_catalog.statement_timestamp())))::integer);
 RETURN pg_catalog.jsonb_build_object('allowed',used<=cap,'retry_after',CASE WHEN used<=cap THEN 0 ELSE wait_s END);
END $fn$;

CREATE OR REPLACE FUNCTION public.sohail_p3_cleanup()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE n bigint;
BEGIN
 DELETE FROM public.sohail_request_budgets WHERE window_start<pg_catalog.statement_timestamp()-interval '1 day';
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN pg_catalog.jsonb_build_object('ok',true,'budgets_deleted',n);
END $fn$;

-- STABLE uses the caller's statement snapshot for every SELECT, so the tables
-- belong to one database snapshot instead of independent paginated reads.
-- No sessions, challenges or password-reset tokens are included in this export.
CREATE OR REPLACE FUNCTION public.sohail_p3_backup_snapshot()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE tab text; payload jsonb; tables jsonb='{}'::jsonb; counts jsonb='{}'::jsonb; n integer;
BEGIN
 FOREACH tab IN ARRAY ARRAY['liga_state','liga_index','jugadores','passkeys','audit_log','mensajes','admin_notify_channels','sohail_account_security','sohail_identity_registry','sohail_data_operations','sohail_login_order'] LOOP
  EXECUTE pg_catalog.format('SELECT COALESCE(jsonb_agg(to_jsonb(t)),''[]''::jsonb) FROM (SELECT * FROM public.%I LIMIT 250001) t',tab) INTO payload;
  n=pg_catalog.jsonb_array_length(payload);
  IF n>250000 THEN RAISE EXCEPTION 'Backup table exceeds operating limit; use a native PostgreSQL backup'; END IF;
  tables=tables||pg_catalog.jsonb_build_object(tab,payload);
  counts=counts||pg_catalog.jsonb_build_object(tab,n);
  IF pg_catalog.octet_length(tables::text)>33554432 THEN RAISE EXCEPTION 'Backup exceeds 32 MiB; no partial backup is returned'; END IF;
 END LOOP;
 RETURN pg_catalog.jsonb_build_object('version',3,'consistency','single-statement-snapshot','generated_at',pg_catalog.statement_timestamp(),'tables',tables,'counts',counts);
END $fn$;

-- The app talks to the Data API ONLY through its server. Close grants and stale
-- permissive policies on the explicit app tables; never alter auth/storage tables.
DO $acl$
DECLARE tab text; policy record; fn record; col record; seq text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['liga_state','liga_index','jugadores','passkeys','password_resets','rate_limits','audit_log','mensajes','admin_notify_channels','sohail_account_security','sohail_identity_registry','sohail_data_operations','sohail_login_order','sohail_auth_sessions','sohail_auth_challenges','sohail_request_budgets'] LOOP
  IF pg_catalog.to_regclass('public.'||tab) IS NULL THEN RAISE EXCEPTION 'Missing required application table: %',tab; END IF;
  EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',tab);
  -- Explicitly clear any column-level grants as well.
  FOR col IN SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=tab LOOP
   EXECUTE pg_catalog.format('REVOKE SELECT (%I), INSERT (%I), UPDATE (%I), REFERENCES (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated',col.column_name,col.column_name,col.column_name,col.column_name,tab);
   seq=pg_catalog.pg_get_serial_sequence(pg_catalog.format('public.%I',tab),col.column_name);
   IF seq IS NOT NULL THEN
    EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC,anon,authenticated',seq);
    EXECUTE pg_catalog.format('GRANT USAGE,SELECT ON SEQUENCE %s TO service_role',seq);
   END IF;
  END LOOP;
  EXECUTE pg_catalog.format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',tab);
  FOR policy IN SELECT policyname FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename=tab LOOP
   EXECUTE pg_catalog.format('DROP POLICY %I ON public.%I',policy.policyname,tab);
  END LOOP;
 END LOOP;
 FOR fn IN SELECT p.oid::pg_catalog.regprocedure AS signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'sohail\_%' ESCAPE '\' LOOP
  EXECUTE pg_catalog.format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',fn.signature);
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn.signature);
 END LOOP;
END $acl$;
-- Close future client grants for the executing owner, globally and in public.
-- Per-schema REVOKE alone cannot remove PostgreSQL's global PUBLIC EXECUTE
-- default. Existing objects in auth/storage and defaults of other owners are
-- NOT changed. Future functions created by this owner need explicit grants.
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
