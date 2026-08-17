-- ============================================================================
-- LIGA DE TENIS — TABLA DE PASSKEYS (login con Face ID / Touch ID / huella)
-- ============================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
--
-- QUÉ HACE:
--   1. Crea la tabla `passkeys` (una fila por cada passkey registrada).
--   2. Configura RLS (seguridad) CERRADA: nadie accede directo, solo el
--      servidor con la service_role key. Igual que las otras tablas.
--
-- POR QUÉ UNA TABLA APARTE:
--   Las passkeys son datos de seguridad (credenciales por dispositivo). No van
--   dentro del estado de la liga: se guardan aparte para aislarlas y para que
--   un jugador tenga sus passkeys aunque cambie de liga.
--
-- QUÉ GUARDA CADA FILA:
--   • credential_id: identificador único de la passkey (lo genera el dispositivo)
--   • public_key: la clave pública de esa passkey (con esto se verifica la firma)
--   • counter: contador anti-clonación que sube en cada uso
--   • user_name: a qué jugador pertenece
--   • device_label: nombre amigable ("iPhone de Marcos") para que el usuario
--     reconozca y pueda borrar sus dispositivos
--   • Nunca guarda datos biométricos: la cara/huella NUNCA sale del dispositivo.
--     Solo se guarda la clave pública, que no sirve para nada sin el dispositivo.
-- ============================================================================


-- ============================================================================
-- PASO 1 — Crear la tabla passkeys
-- ============================================================================
CREATE TABLE IF NOT EXISTS passkeys (
  credential_id  TEXT PRIMARY KEY,           -- id único de la credencial (base64url)
  user_name      TEXT NOT NULL,              -- jugador dueño de la passkey
  public_key     TEXT NOT NULL,              -- clave pública (base64url) para verificar firmas
  counter        BIGINT NOT NULL DEFAULT 0,  -- contador anti-clonación
  device_label   TEXT,                       -- nombre amigable del dispositivo
  transports     TEXT,                       -- cómo se conecta (internal, usb, nfc...) JSON
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at   TIMESTAMPTZ
);

-- Índice para buscar rápido todas las passkeys de un jugador.
CREATE INDEX IF NOT EXISTS passkeys_user_name_idx ON passkeys (user_name);


-- ============================================================================
-- PASO 2 — RLS cerrado (sin acceso público)
-- ============================================================================
-- Igual que las otras tablas: se activa RLS y NO se crea ninguna política
-- pública. Así nadie puede leer ni escribir desde el cliente. Solo el servidor,
-- que usa la service_role key (que saltea RLS), puede tocar esta tabla.
ALTER TABLE passkeys ENABLE ROW LEVEL SECURITY;

-- Por las dudas, si quedaron políticas viejas de un intento anterior, se borran.
DROP POLICY IF EXISTS "passkeys_public_read"  ON passkeys;
DROP POLICY IF EXISTS "passkeys_public_write" ON passkeys;

-- No se crea ninguna política: RLS activo + sin políticas = tabla cerrada al
-- público. Solo la service_role key del servidor entra.


-- ============================================================================
-- LISTO
-- ============================================================================
-- La tabla passkeys queda creada y cerrada. El endpoint /api/passkey del
-- servidor es el único que la toca, usando la service_role key.
-- ============================================================================
