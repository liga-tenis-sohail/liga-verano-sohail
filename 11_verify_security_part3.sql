-- READ ONLY. Every row must return ok=true. No password/hash/content is returned.
WITH app_tables(name) AS (VALUES
 ('liga_state'),('liga_index'),('jugadores'),('passkeys'),('password_resets'),('rate_limits'),('audit_log'),('mensajes'),('admin_notify_channels'),('sohail_account_security'),('sohail_identity_registry'),('sohail_data_operations'),('sohail_login_order'),('sohail_auth_sessions'),('sohail_auth_challenges'),('sohail_request_budgets')
), checks AS (
 SELECT name||': RLS' AS check_name,COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||name)),false) AS ok FROM app_tables
 UNION ALL
 SELECT name||': closed to clients',COALESCE((SELECT NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND NOT has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AND NOT has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') FROM pg_class c WHERE c.oid=to_regclass('public.'||name)),false) FROM app_tables
 UNION ALL
 SELECT name||': server access',COALESCE((SELECT has_table_privilege('service_role',c.oid,'SELECT') AND has_table_privilege('service_role',c.oid,'INSERT') AND has_table_privilege('service_role',c.oid,'UPDATE') AND has_table_privilege('service_role',c.oid,'DELETE') FROM pg_class c WHERE c.oid=to_regclass('public.'||name)),false) FROM app_tables
 UNION ALL
 SELECT name||': private sequence',COALESCE((SELECT NOT has_sequence_privilege('anon',c.oid,'USAGE,SELECT,UPDATE') AND NOT has_sequence_privilege('authenticated',c.oid,'USAGE,SELECT,UPDATE') AND has_sequence_privilege('service_role',c.oid,'USAGE') FROM pg_class c WHERE c.oid=to_regclass('public.'||name) AND c.relkind='S'),false) FROM (VALUES ('audit_log_id_seq'),('mensajes_id_seq'),('admin_notify_channels_id_seq')) s(name)
 UNION ALL
 SELECT 'P3 functions installed',COUNT(*)=3 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('sohail_p3_budget','sohail_p3_cleanup','sohail_p3_backup_snapshot')
 UNION ALL
 SELECT 'Internal functions closed',COUNT(*)>=3 AND bool_and(NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND has_function_privilege('service_role',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'sohail\_%' ESCAPE '\'
 UNION ALL
 SELECT 'No stale app policies',NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN(SELECT name FROM app_tables))
 UNION ALL
 SELECT 'Snapshot is stable',COALESCE((SELECT provolatile='s' FROM pg_proc WHERE oid=to_regprocedure('public.sohail_p3_backup_snapshot()')),false)
)
SELECT check_name,ok FROM checks ORDER BY check_name;
