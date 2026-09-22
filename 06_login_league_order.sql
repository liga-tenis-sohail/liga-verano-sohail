-- SOHAIL v4.3 — Orden compartido de ligas cerradas en el login.
-- Ejecutar COMPLETO en el SQL Editor del proyecto Supabase de la app.
-- Requiere las tablas actuales y la migración 04. No reejecutar el setup antiguo.
-- No cambia ligas, resultados, credenciales ni el orden cronológico (`orden`).
-- Repetir esta migración NO restablece un orden ya guardado.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.liga_state') IS NULL
 OR to_regclass('public.liga_index') IS NULL
 OR to_regclass('public.sohail_account_security') IS NULL
 OR to_regprocedure('public.sohail_v400_document(jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Faltan tablas actuales o la migracion 04. No ejecutar el setup antiguo: revisar la instalacion existente.';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.sohail_login_order (
 id integer PRIMARY KEY CHECK (id=1),
 version bigint NOT NULL DEFAULT 0 CHECK (version>=0),
 league_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(league_ids)='array'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text
);
INSERT INTO public.sohail_login_order(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
ALTER TABLE public.sohail_login_order ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sohail_login_order FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.sohail_login_order TO service_role;

CREATE OR REPLACE FUNCTION public.sohail_set_login_league_order(
 p_actor text,p_actor_key text,p_epoch bigint,p_source text,p_expected bigint,p_ids jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s'
AS $$
DECLARE
 config public.sohail_login_order%ROWTYPE;
 account jsonb; doc jsonb; u jsonb; principal text; actual jsonb; wanted jsonb;
BEGIN
 IF p_ids IS NULL OR jsonb_typeof(p_ids) IS DISTINCT FROM 'array'
 OR p_expected IS NULL OR p_expected<0 THEN
  RETURN jsonb_build_object('ok',false,'code','INVALID_ORDER');
 END IF;
 IF jsonb_array_length(p_ids)>5000 THEN
  RETURN jsonb_build_object('ok',false,'code','INVALID_ORDER');
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_ids) AS x(value)
   WHERE jsonb_typeof(value)<>'string' OR (value#>>'{}') !~ '^[a-z0-9][a-z0-9-]{0,63}$')
 OR (SELECT count(*) FROM jsonb_array_elements(p_ids))<>
    (SELECT count(DISTINCT value) FROM jsonb_array_elements(p_ids)) THEN
  RETURN jsonb_build_object('ok',false,'code','INVALID_ORDER');
 END IF;
 -- Recheck current identity/epoch/role inside the transaction, not just in Node.
 -- Same security -> source-state lock order as credential/state operations.
 SELECT to_jsonb(a) INTO account FROM public.sohail_account_security a
 WHERE a.id=p_actor_key FOR SHARE;
 IF account IS NULL OR (account->>'epoch')::bigint IS DISTINCT FROM p_epoch
 OR coalesce((account->>'must_change')::boolean,false) THEN
  RETURN jsonb_build_object('ok',false,'code','FORBIDDEN');
 END IF;
 SELECT public.sohail_v400_document(to_jsonb(s.data)) INTO doc
 FROM public.liga_state s WHERE s.id=p_source FOR SHARE;
 u:=doc->'users'->p_actor;
 principal:=CASE WHEN nullif(u->>'jugadorId','') IS NOT NULL THEN 'g:'||(u->>'jugadorId')
   WHEN nullif(u->>'_credentialId','') IS NOT NULL THEN 'i:'||(u->>'_credentialId')
   ELSE 'n:'||p_actor END;
 IF u IS NULL OR coalesce((u->>'inactive')::boolean,false)
 OR principal IS DISTINCT FROM p_actor_key
 OR NOT (coalesce(u->>'role','') IN ('admin','superadmin') OR coalesce(u->'isAdmin'='true'::jsonb,false)) THEN
  RETURN jsonb_build_object('ok',false,'code','FORBIDDEN');
 END IF;
 SELECT * INTO config FROM public.sohail_login_order WHERE id=1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Falta la configuracion de orden del login'; END IF;
 IF config.version<>p_expected THEN
  RETURN jsonb_build_object('ok',false,'code','CONFLICT');
 END IF;
 -- Freeze the small index only while comparing and saving its cosmetic order.
 -- No sporting state/index values are modified. Closure/reopening/creation wait
 -- until this transaction ends instead of producing a partially outdated list.
 LOCK TABLE public.liga_index IN SHARE MODE;
 SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) INTO actual
 FROM public.liga_index WHERE estado='finalizada';
 SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO wanted
 FROM jsonb_array_elements_text(p_ids);
 IF wanted IS DISTINCT FROM actual THEN
  RETURN jsonb_build_object('ok',false,'code','LEAGUES_CHANGED');
 END IF;
 IF config.league_ids IS DISTINCT FROM p_ids THEN
  UPDATE public.sohail_login_order SET league_ids=p_ids,version=version+1,
   updated_at=now(),updated_by=p_actor WHERE id=1 RETURNING * INTO config;
 END IF;
 RETURN jsonb_build_object('ok',true,'version',config.version,'ids',config.league_ids);
END $$;
REVOKE ALL ON FUNCTION public.sohail_set_login_league_order(text,text,bigint,text,bigint,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sohail_set_login_league_order(text,text,bigint,text,bigint,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
