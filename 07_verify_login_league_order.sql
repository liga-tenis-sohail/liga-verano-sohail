-- SOHAIL v4.3 — Verificación de SOLO LECTURA. No instala ni cambia datos.
-- Ejecutar después del SQL 06. Las 11 filas deben devolver ok = true.
WITH objects AS (
 SELECT to_regclass('public.sohail_login_order') AS tbl,
 to_regprocedure('public.sohail_set_login_league_order(text,text,bigint,text,bigint,jsonb)') AS fn
)
SELECT '01_tabla_instalada' AS comprobacion,tbl IS NOT NULL AS ok FROM objects
UNION ALL SELECT '02_rls_activo',coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=tbl),false) FROM objects
UNION ALL SELECT '03_sin_lectura_publica',coalesce(NOT has_table_privilege('anon',tbl,'SELECT'),false) FROM objects
UNION ALL SELECT '04_sin_escritura_anon',coalesce(NOT has_table_privilege('anon',tbl,'INSERT,UPDATE,DELETE'),false) FROM objects
UNION ALL SELECT '05_sin_escritura_authenticated',coalesce(NOT has_table_privilege('authenticated',tbl,'INSERT,UPDATE,DELETE'),false) FROM objects
UNION ALL SELECT '06_lectura_servidor',coalesce(has_table_privilege('service_role',tbl,'SELECT'),false) FROM objects
UNION ALL SELECT '07_funcion_instalada',fn IS NOT NULL FROM objects
UNION ALL SELECT '08_funcion_solo_servidor',coalesce(has_function_privilege('service_role',fn,'EXECUTE') AND NOT has_function_privilege('anon',fn,'EXECUTE') AND NOT has_function_privilege('authenticated',fn,'EXECUTE'),false) FROM objects
UNION ALL SELECT '09_definer_y_ruta_segura',coalesce((SELECT prosecdef AND EXISTS(SELECT 1 FROM unnest(proconfig) c WHERE replace(c,' ','')='search_path=pg_catalog,public') FROM pg_proc WHERE oid=fn),false) FROM objects
UNION ALL SELECT '10_una_fila_de_configuracion',coalesce((SELECT count(*)=1 AND bool_and(id=1 AND version>=0 AND jsonb_typeof(league_ids)='array') FROM public.sohail_login_order),false)
UNION ALL SELECT '11_dependencia_04_instalada',to_regprocedure('public.sohail_v400_document(jsonb)') IS NOT NULL
ORDER BY comprobacion;
