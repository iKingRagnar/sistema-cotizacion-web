-- =============================================================================
-- SOLO COTIZACIONES + LÍNEAS (30 + 30). Ejecutar si el script grande falló a medias
-- o si solo te faltan cotizaciones.
--
-- Requiere ya existir en la BD:
--   clientes DUM2026-C01..C30, refacciones DUM2026-R01..R30,
--   maquinas DUM2026-M01..M30, tecnicos "DUM Personal 01".."DUM Personal 30"
-- (salen del seed-dummy-30.sql pasos 1–4).
--
-- PowerShell:
--   Get-Content .\scripts\seed-cotizaciones-30.sql -Raw | turso db shell TU_BD
-- =============================================================================

PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

DELETE FROM movimientos_stock WHERE cotizacion_id IN (SELECT id FROM cotizaciones WHERE folio LIKE 'DUM2026-Q%');
DELETE FROM cotizacion_lineas WHERE cotizacion_id IN (SELECT id FROM cotizaciones WHERE folio LIKE 'DUM2026-Q%');
DELETE FROM cotizaciones WHERE folio LIKE 'DUM2026-Q%';

INSERT INTO cotizaciones (
  folio, cliente_id, tipo, fecha, subtotal, iva, total, tipo_cambio, moneda, maquinas_ids, estado, notas,
  fecha_aprobacion, vendedor, vendedor_personal_id, descuento_pct
)
SELECT
  'DUM2026-Q' || printf('%02d', n),
  (SELECT id FROM clientes WHERE codigo = 'DUM2026-C' || printf('%02d', n)),
  CASE WHEN n % 3 = 0 THEN 'mano_obra' ELSE 'refacciones' END,
  date('now', '-' || (60 - n) || ' days'),
  10000.0 + n * 250.0,
  1600.0 + n * 40.0,
  11600.0 + n * 290.0,
  17.0,
  'MXN',
  '[]',
  CASE WHEN n > 15 THEN 'aplicada' ELSE 'borrador' END,
  'Cotización dummy automática',
  CASE WHEN n > 15 THEN date('now', '-' || (45 - n) || ' days') ELSE NULL END,
  'Vendedor Demo ' || printf('%02d', n),
  (SELECT id FROM tecnicos WHERE nombre = 'DUM Personal ' || printf('%02d', ((n - 1) % 30) + 1) LIMIT 1),
  0
FROM (
  VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13),(14),(15),(16),(17),(18),(19),(20),(21),(22),(23),(24),(25),(26),(27),(28),(29),(30)
) AS t(n);

INSERT INTO cotizacion_lineas (
  cotizacion_id, refaccion_id, maquina_id, tipo_linea, descripcion, cantidad,
  precio_unitario, precio_usd, subtotal, iva, total, orden
)
SELECT
  (SELECT id FROM cotizaciones WHERE folio = 'DUM2026-Q' || printf('%02d', n)),
  (SELECT id FROM refacciones WHERE codigo = 'DUM2026-R' || printf('%02d', n)),
  (SELECT id FROM maquinas WHERE codigo = 'DUM2026-M' || printf('%02d', n)),
  'refaccion',
  'Parte demo línea ' || n,
  2.0,
  500.0 + n * 10.0,
  30.0 + n,
  1000.0 + n * 20.0,
  160.0,
  1160.0 + n * 20.0,
  1
FROM (
  VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13),(14),(15),(16),(17),(18),(19),(20),(21),(22),(23),(24),(25),(26),(27),(28),(29),(30)
) AS t(n);

COMMIT;
