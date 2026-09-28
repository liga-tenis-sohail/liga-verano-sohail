-- READ ONLY. After SQL12: 50 rows, every ok=true. Does not disclose user data.
WITH tables(name) AS (VALUES ('sohail_sport_versions'),('sohail_derived_cache'),('sohail_backup_lock'),('sohail_backup_runs')),
functions(signature) AS (VALUES
 ('public.sohail_perf_document(jsonb)'),('public.sohail_perf_projection(jsonb)'),('public.sohail_perf_track_state()'),
 ('public.sohail_perf_manifest(boolean)'),('public.sohail_perf_source(boolean,boolean,text,text,text)'),
 ('public.sohail_perf_cache_put(boolean,text,text,date,jsonb)'),('public.sohail_perf_login_source(text)'),
 ('public.sohail_perf_backup(text,jsonb)'),('public.sohail_perf_rules_doc(jsonb)'),
 ('public.sohail_perf_principal(text,jsonb)'),('public.sohail_perf_rules(text,jsonb)')),
checks AS (
 SELECT name||':exists' check_name,to_regclass('public.'||name) IS NOT NULL ok FROM tables
 UNION ALL SELECT name||':rls',coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||name)),false) FROM tables
 UNION ALL SELECT name||':no_client_grants',coalesce(NOT has_table_privilege('anon',to_regclass('public.'||name),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND NOT has_table_privilege('authenticated',to_regclass('public.'||name),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),false) FROM tables
 UNION ALL SELECT name||':service_access',coalesce(has_table_privilege('service_role',to_regclass('public.'||name),'SELECT') AND has_table_privilege('service_role',to_regclass('public.'||name),'INSERT') AND has_table_privilege('service_role',to_regclass('public.'||name),'UPDATE') AND has_table_privilege('service_role',to_regclass('public.'||name),'DELETE'),false) FROM tables
 UNION ALL SELECT signature||':exists',to_regprocedure(signature) IS NOT NULL FROM functions
 UNION ALL SELECT signature||':service_only_invoker',coalesce(NOT has_function_privilege('anon',to_regprocedure(signature),'EXECUTE') AND NOT has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE') AND has_function_privilege('service_role',to_regprocedure(signature),'EXECUTE') AND (SELECT NOT prosecdef FROM pg_proc WHERE oid=to_regprocedure(signature)),false) FROM functions
 UNION ALL SELECT 'version_trigger_active',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.liga_state'::regclass AND tgname='sohail_perf_state_version' AND tgenabled='O' AND tgfoid='public.sohail_perf_track_state()'::regprocedure)
 UNION ALL SELECT 'version_rows_complete',NOT EXISTS(SELECT 1 FROM public.liga_state s LEFT JOIN public.sohail_sport_versions v ON v.liga_id=s.id WHERE v.liga_id IS NULL)
 UNION ALL SELECT 'version_numbers_current',NOT EXISTS(SELECT 1 FROM public.liga_state s JOIN public.sohail_sport_versions v ON v.liga_id=s.id WHERE v.source_version IS DISTINCT FROM coalesce((public.sohail_perf_document(s.data)->>'_v')::bigint,0))
 UNION ALL SELECT 'sport_hashes_current',NOT EXISTS(SELECT 1 FROM public.liga_state s JOIN public.sohail_sport_versions v ON v.liga_id=s.id WHERE v.sport_hash IS DISTINCT FROM encode(sha256(convert_to(public.sohail_perf_projection(s.data)::text,'UTF8')),'hex'))
 UNION ALL SELECT 'cache_scope_constraint',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.sohail_derived_cache'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%scope%' AND pg_get_constraintdef(oid) LIKE '%authenticated%')
 UNION ALL SELECT 'cache_size_constraint',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.sohail_derived_cache'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%4194304%')
 UNION ALL SELECT 'cache_current_row_bound',(SELECT count(*)<=2 FROM public.sohail_derived_cache)
 UNION ALL SELECT 'daily_unique_index',EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.sohail_backup_one_day') AND indisunique AND indisvalid AND indpred IS NOT NULL)
 UNION ALL SELECT 'backup_lock_singleton',(SELECT count(*)=1 AND min(id)=1 FROM public.sohail_backup_lock)
 UNION ALL SELECT 'manifest_stable',(SELECT provolatile='s' FROM pg_proc WHERE oid='public.sohail_perf_manifest(boolean)'::regprocedure)
 UNION ALL SELECT 'source_stable',(SELECT provolatile='s' FROM pg_proc WHERE oid='public.sohail_perf_source(boolean,boolean,text,text,text)'::regprocedure)
 UNION ALL SELECT 'login_source_stable',(SELECT provolatile='s' FROM pg_proc WHERE oid='public.sohail_perf_login_source(text)'::regprocedure)
)
SELECT check_name,coalesce(ok,false) AS ok FROM checks ORDER BY check_name;
-- 16 table checks + 22 function checks + 12 integration checks = 50.
