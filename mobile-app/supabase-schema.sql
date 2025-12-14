-- Tabla principal de estado del brick
-- Ejecutar en SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS brick_status (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_locked BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar fila inicial
INSERT INTO brick_status (id, is_locked)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brick_status_updated_at
  BEFORE UPDATE ON brick_status
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Habilitar RLS
ALTER TABLE brick_status ENABLE ROW LEVEL SECURITY;

-- Política: cualquiera puede leer (para el realtime)
CREATE POLICY "Anyone can read brick_status"
  ON brick_status FOR SELECT
  USING (true);

-- Política: cualquiera puede actualizar (o limitar a usuarios autenticados)
CREATE POLICY "Anyone can update brick_status"
  ON brick_status FOR UPDATE
  USING (true);

-- =============================================
-- IMPORTANTE: Habilitar Realtime en Supabase
-- =============================================
-- 1. Ve a Database > Replication
-- 2. En "Supabase Realtime" activa la tabla "brick_status"
-- O ejecuta:
ALTER PUBLICATION supabase_realtime ADD TABLE brick_status;
