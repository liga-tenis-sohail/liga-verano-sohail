-- Only in the disposable test DB, after tests/security-db/fixture.sql and SQL08.
DO $$ BEGIN IF current_database()<>'sohail_security_test' THEN RAISE EXCEPTION 'TEST DATABASE ONLY'; END IF; END $$;
CREATE TABLE public.liga_index(id text PRIMARY KEY,nombre text,estado text,orden integer);
CREATE TABLE public.password_resets(token text PRIMARY KEY,user_name text);
CREATE TABLE public.rate_limits(key text PRIMARY KEY,failed integer);
CREATE TABLE public.mensajes(id bigserial PRIMARY KEY,texto text);
CREATE TABLE public.admin_notify_channels(id bigserial PRIMARY KEY,api_key text);
CREATE TABLE public.sohail_identity_registry(id integer PRIMARY KEY,version integer,data jsonb);
CREATE TABLE public.sohail_data_operations(id uuid PRIMARY KEY,data jsonb);
CREATE TABLE public.sohail_login_order(id integer PRIMARY KEY,version integer,league_ids jsonb);
INSERT INTO public.liga_index VALUES('liga-actual','Synthetic league','activa',1);
INSERT INTO public.password_resets VALUES('must-not-export','Player');
INSERT INTO public.mensajes(texto) SELECT 'Synthetic message '||n FROM generate_series(1,1503) n;
INSERT INTO public.admin_notify_channels(api_key) VALUES('fake-sensitive-value');
ALTER TABLE public.liga_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY stale_read ON public.liga_state FOR SELECT TO anon USING(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.password_resets TO anon,authenticated;
GRANT SELECT(email) ON public.jugadores TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon,authenticated;
-- Preserve a fingerprint across the migration; no real player data is used.
CREATE TABLE public.test_before AS SELECT md5(string_agg(data::text,'' ORDER BY id)) AS digest FROM public.liga_state;
