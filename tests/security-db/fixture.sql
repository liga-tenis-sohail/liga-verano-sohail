-- TEST DATABASE ONLY. Never execute in Supabase or your production database.
-- A deliberate database-name guard prevents accidentally using a live project.
DO $$ BEGIN IF current_database()<>'sohail_security_test' THEN RAISE EXCEPTION 'TEST DATABASE ONLY'; END IF; END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE TABLE public.sohail_account_security(id text PRIMARY KEY,pass_hash text NOT NULL,epoch bigint NOT NULL DEFAULT 0,must_change boolean NOT NULL DEFAULT false,tutorial_epoch bigint NOT NULL DEFAULT 1,tutorial_done_epoch bigint NOT NULL DEFAULT 0,tutorial_version integer NOT NULL DEFAULT 0,tutorial_status text,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.liga_state(id text PRIMARY KEY,data jsonb,updated_at timestamptz DEFAULT now());
CREATE TABLE public.jugadores(id text PRIMARY KEY,nombre text NOT NULL,email text,pass text,creado timestamptz DEFAULT now(),actualizado timestamptz DEFAULT now());
CREATE TABLE public.passkeys(credential_id text PRIMARY KEY,user_name text NOT NULL,public_key text NOT NULL,counter bigint NOT NULL DEFAULT 0,device_label text,transports text,created_at timestamptz NOT NULL DEFAULT now(),last_used_at timestamptz);
CREATE TABLE public.audit_log(id bigserial PRIMARY KEY,at timestamptz NOT NULL DEFAULT now(),actor text NOT NULL,actor_ip text,action text NOT NULL,target text,details jsonb);
CREATE FUNCTION public.sohail_decode_state(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN RETURN CASE WHEN jsonb_typeof(p)='string' THEN (p#>>'{}')::jsonb ELSE p END; END $$;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.sohail_decode_state(jsonb) TO service_role;
INSERT INTO public.sohail_account_security(id,pass_hash) VALUES('n:admin','legacy-admin'),('g:p1','legacy-player'),('g:p2','legacy-other');
INSERT INTO public.jugadores(id,nombre,pass) VALUES('p1','Player','legacy-player'),('p2','Other','legacy-other');
INSERT INTO public.liga_state(id,data) VALUES('liga-actual','{"_v":1,"users":{"admin":{"role":"admin","pass":"legacy-admin"},"Player":{"role":"player","jugadorId":"p1","pass":"legacy-player"},"Other":{"role":"player","jugadorId":"p2","pass":"legacy-other"}},"matches":[{"id":"sport-1"}]}'),
 ('liga-anterior','{"_v":8,"users":{"Historical alias":{"role":"player","jugadorId":"p1","pass":"legacy-player"}},"matches":[{"id":"sport-2"}]}');
INSERT INTO public.passkeys(credential_id,user_name,public_key) VALUES('existing-device-player','Player','TEST-PUBLIC-KEY');
