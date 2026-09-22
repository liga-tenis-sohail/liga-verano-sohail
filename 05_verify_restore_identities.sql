-- SOHAIL v4.0 — READ-ONLY verification, after running 04_restore_identities.sql.
-- Does not restore a league, create users, read contacts or expose credentials.
-- Expected: every row has ok=true. This checks installation/grants, not a restore.
WITH checks AS (
 SELECT 'Registry table installed'::text AS comprobacion,
        to_regclass('public.sohail_identity_registry') IS NOT NULL AS ok
 UNION ALL SELECT 'Private operations table installed',
        to_regclass('public.sohail_data_operations') IS NOT NULL
 UNION ALL SELECT 'Atomic operation function installed',
        to_regprocedure('public.sohail_apply_data_operation(uuid,text,text,text,bigint,text,text,jsonb,bigint,jsonb,jsonb)') IS NOT NULL
 UNION ALL SELECT 'Anonymous cannot call operation function',
        coalesce(NOT has_function_privilege('anon',to_regprocedure('public.sohail_apply_data_operation(uuid,text,text,text,bigint,text,text,jsonb,bigint,jsonb,jsonb)'),'EXECUTE'),false)
 UNION ALL SELECT 'Authenticated browser cannot call operation function',
        coalesce(NOT has_function_privilege('authenticated',to_regprocedure('public.sohail_apply_data_operation(uuid,text,text,text,bigint,text,text,jsonb,bigint,jsonb,jsonb)'),'EXECUTE'),false)
 UNION ALL SELECT 'Server can call operation function',
        coalesce(has_function_privilege('service_role',to_regprocedure('public.sohail_apply_data_operation(uuid,text,text,text,bigint,text,text,jsonb,bigint,jsonb,jsonb)'),'EXECUTE'),false)
 UNION ALL SELECT 'Anonymous cannot access security snapshots',
        coalesce(NOT has_table_privilege('anon',to_regclass('public.sohail_data_operations'),'SELECT,INSERT,UPDATE,DELETE'),false)
 UNION ALL SELECT 'Authenticated browser cannot access security snapshots',
        coalesce(NOT has_table_privilege('authenticated',to_regclass('public.sohail_data_operations'),'SELECT,INSERT,UPDATE,DELETE'),false)
 UNION ALL SELECT 'Anonymous cannot access identity registry',
        coalesce(NOT has_table_privilege('anon',to_regclass('public.sohail_identity_registry'),'SELECT,INSERT,UPDATE,DELETE'),false)
 UNION ALL SELECT 'Authenticated browser cannot access identity registry',
        coalesce(NOT has_table_privilege('authenticated',to_regclass('public.sohail_identity_registry'),'SELECT,INSERT,UPDATE,DELETE'),false)
 UNION ALL SELECT 'Anonymous cannot access raw league data directly',
        coalesce(NOT has_table_privilege('anon',to_regclass('public.liga_state'),'SELECT,INSERT,UPDATE,DELETE'),false)
 UNION ALL SELECT 'Authenticated browser cannot access raw league data directly',
        coalesce(NOT has_table_privilege('authenticated',to_regclass('public.liga_state'),'SELECT,INSERT,UPDATE,DELETE'),false)
 UNION ALL SELECT 'RLS enabled on both new tables',
        (SELECT count(*)=2 AND bool_and(relrowsecurity) FROM pg_class WHERE oid IN (to_regclass('public.sohail_identity_registry'),to_regclass('public.sohail_data_operations')))
)
SELECT comprobacion,ok FROM checks ORDER BY comprobacion;
