-- READ ONLY. Run after 08_security_part2.sql. Every row must have ok=true.
-- No password values, tokens, user names, or player records are returned.
WITH expected_tables(name) AS (VALUES ('sohail_auth_sessions'),('sohail_auth_challenges')),
expected_functions(signature) AS (VALUES
 ('public.sohail_p2_session(text,jsonb)'),
 ('public.sohail_p2_store_password(text,bigint,text,boolean,boolean)'),
 ('public.sohail_p2_rehash(text,bigint,text,text,boolean,boolean)'),
 ('public.sohail_p2_change_password(jsonb)'),
 ('public.sohail_p2_challenge(text,jsonb)'),
 ('public.sohail_p2_passkey(text,jsonb)'),
 ('public.sohail_p2_credential_guard()')),
checks AS (
 SELECT 'table exists + RLS: '||e.name check_name,
  coalesce((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=e.name),false) ok
 FROM expected_tables e
 UNION ALL SELECT 'no public policies: '||e.name,NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=e.name) FROM expected_tables e
 UNION ALL SELECT 'anon/authenticated no table access: '||e.name,
  coalesce(NOT has_table_privilege('anon',to_regclass('public.'||e.name),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  AND NOT has_table_privilege('authenticated',to_regclass('public.'||e.name),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),false) FROM expected_tables e
 UNION ALL SELECT 'service table access: '||e.name,
  coalesce(has_table_privilege('service_role',to_regclass('public.'||e.name),'SELECT') AND has_table_privilege('service_role',to_regclass('public.'||e.name),'INSERT')
  AND has_table_privilege('service_role',to_regclass('public.'||e.name),'UPDATE') AND has_table_privilege('service_role',to_regclass('public.'||e.name),'DELETE'),false) FROM expected_tables e
 UNION ALL SELECT 'function exists, invoker, isolated search path: '||e.signature,
  coalesce((SELECT NOT p.prosecdef AND EXISTS(SELECT 1 FROM unnest(p.proconfig) conf WHERE conf IN ('search_path=""','search_path=')) FROM pg_proc p WHERE p.oid=to_regprocedure(e.signature)),false) FROM expected_functions e
 UNION ALL SELECT 'no public function execution: '||e.signature,
  coalesce(NOT has_function_privilege('anon',to_regprocedure(e.signature),'EXECUTE') AND NOT has_function_privilege('authenticated',to_regprocedure(e.signature),'EXECUTE'),false) FROM expected_functions e
 UNION ALL SELECT 'service function execution: '||e.signature,
  coalesce(has_function_privilege('service_role',to_regprocedure(e.signature),'EXECUTE'),false) FROM expected_functions e
 UNION ALL SELECT 'passkey identity column',EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='passkeys' AND column_name='principal_key' AND data_type='text')
 UNION ALL SELECT 'credential downgrade/revocation trigger',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.sohail_account_security') AND tgname='sohail_p2_credential_guard' AND tgenabled='O')
 UNION ALL SELECT 'session expiry index',to_regclass('public.sohail_auth_sessions_account_idx') IS NOT NULL
 UNION ALL SELECT 'challenge expiry index',to_regclass('public.sohail_auth_challenges_expiry_idx') IS NOT NULL
)
SELECT check_name,ok FROM checks ORDER BY check_name;
