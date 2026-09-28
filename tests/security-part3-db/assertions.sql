DO $$ BEGIN IF current_database()<>'sohail_security_test' THEN RAISE EXCEPTION 'TEST DATABASE ONLY'; END IF; END $$;
DO $$ DECLARE previous text; current_value text; BEGIN
 SELECT digest INTO previous FROM public.test_before;
 SELECT md5(string_agg(data::text,'' ORDER BY id)) INTO current_value FROM public.liga_state;
 IF previous<>current_value THEN RAISE EXCEPTION 'Migration changed sporting data'; END IF;
END $$;
SET ROLE service_role;
DO $$ DECLARE result jsonb; i integer; BEGIN
 FOR i IN 1..3 LOOP
  result=public.sohail_p3_budget('backup',repeat('a',64));
  IF result->>'allowed'<>'true' THEN RAISE EXCEPTION 'Allowed budget rejected'; END IF;
 END LOOP;
 result=public.sohail_p3_budget('backup',repeat('a',64));
 IF result->>'allowed'<>'false' OR (result->>'retry_after')::integer<1 THEN RAISE EXCEPTION 'Budget not enforced'; END IF;
 result=public.sohail_p3_backup_snapshot();
 IF result->>'consistency'<>'single-statement-snapshot' OR (result->'counts'->>'mensajes')::integer<>1503 THEN RAISE EXCEPTION 'Snapshot truncated'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(result->'tables'))<>11 OR result->'tables'?'password_resets' OR result->'tables'?'sohail_auth_sessions' OR result->'tables'?'sohail_auth_challenges' THEN RAISE EXCEPTION 'Unexpected backup credentials'; END IF;
 IF result->'tables'->'admin_notify_channels'->0->>'api_key'<>'fake-sensitive-value' THEN RAISE EXCEPTION 'Persistent configuration missing'; END IF;
END $$;
RESET ROLE;
-- Execution must be rejected, not merely return an empty set.
SET ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.sohail_p3_backup_snapshot();RAISE EXCEPTION 'Public snapshot access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.sohail_p3_budget('auth',repeat('b',64));RAISE EXCEPTION 'Public quota mutation';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM email FROM public.jugadores;RAISE EXCEPTION 'Public column access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM nextval('public.mensajes_id_seq');RAISE EXCEPTION 'Public sequence access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM token FROM public.password_resets;RAISE EXCEPTION 'Authenticated reset access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.sohail_p3_backup_snapshot();RAISE EXCEPTION 'Authenticated snapshot access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
-- New objects created by this migration owner must not become public by default.
CREATE TABLE public.test_closed_default(id integer);
CREATE FUNCTION public.test_closed_default_fn() RETURNS integer LANGUAGE sql AS 'SELECT 1';
DO $$ BEGIN
 IF has_table_privilege('anon','public.test_closed_default','SELECT') OR has_function_privilege('anon','public.test_closed_default_fn()','EXECUTE') THEN RAISE EXCEPTION 'Unsafe default privileges'; END IF;
END $$;
SELECT 'Security Part 3 SQL assertions passed' AS result;
-- Recovery drill confined to a NEW schema in the disposable test DB.
-- This is not a production restore command and never restores active sessions.
CREATE SCHEMA recovery_drill;
DO $$ DECLARE backup jsonb; item record; restored jsonb; expected jsonb; BEGIN
 backup=public.sohail_p3_backup_snapshot();
 FOR item IN SELECT key,value FROM jsonb_each(backup->'tables') LOOP
  EXECUTE format('CREATE TABLE recovery_drill.%I (LIKE public.%I INCLUDING CONSTRAINTS)',item.key,item.key);
  EXECUTE format('INSERT INTO recovery_drill.%I SELECT * FROM jsonb_populate_recordset(NULL::recovery_drill.%I,$1)',item.key,item.key) USING item.value;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM recovery_drill.%I t',item.key) INTO restored;
  SELECT coalesce(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) INTO expected FROM jsonb_array_elements(item.value);
  IF restored<>expected THEN RAISE EXCEPTION 'Restored table differs: %',item.key; END IF;
 END LOOP;
END $$;
SELECT 'Recovery drill: eleven tables restored exactly in disposable schema' AS result;
