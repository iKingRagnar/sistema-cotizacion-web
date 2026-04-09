-- =============================================================================
-- Datos demo: ≥30 registros por módulo principal (SQLite / Turso).
-- Prefijo DUM2026- en códigos/folios para poder borrar o filtrar después.
-- Ejecutar UNA VEZ; si falla por UNIQUE, borra primero los registros DUM2026-*.
-- Si te faltan solo cotizaciones: scripts/seed-cotizaciones-30.sql (tras tener clientes/refacciones/máquinas/personal).
-- Las tarifas dummy usan INSERT OR IGNORE para no revertir todo el COMMIT si ya existían.
--
-- Turso CLI:  turso db shell <nombre-bd> < scripts/seed-dummy-30.sql
-- SQLite local:  sqlite3 ruta/cotizacion.db < scripts/seed-dummy-30.sql
-- =============================================================================

PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

-- ---------------------------------------------------------------------------
-- 1) CLIENTES (30)
-- ---------------------------------------------------------------------------
INSERT INTO clientes (codigo, nombre, rfc, contacto, direccion, telefono, email, ciudad) VALUES
('DUM2026-C01','Industrias Demo Norte SA','IND010101AAA','Ing. López','Av. Industrial 101','81100000001','c01@dummy.local','Monterrey'),
('DUM2026-C02','Plásticos Delta SC','PLA020202BBB','Lic. Ruiz','Blvd. 202','81100000002','c02@dummy.local','Guadalupe'),
('DUM2026-C03','Metalúrgica Sigma SA','MET030303CCC','Ing. Torres','Km 5.5','81100000003','c03@dummy.local','Apodaca'),
('DUM2026-C04','Empaques Gamma SA','EMP040404DDD','C.P. Vega','Zona 4','81100000004','c04@dummy.local','Escobedo'),
('DUM2026-C05','Alimentos Omega SC','ALI050505EEE','Q.F. Núñez','Parque 5','81100000005','c05@dummy.local','San Nicolás'),
('DUM2026-C06','Refacciones Omega','REF060606FFF','Ing. Gómez','Calle 6','81100000006','c06@dummy.local','Monterrey'),
('DUM2026-C07','Textiles Lambda SA','TEX070707GGG','Mtra. Díaz','Col.7','81100000007','c07@dummy.local','Santa Catarina'),
('DUM2026-C08','Químicos Pi SA','QUI080808HHH','Ing. Flores','Zona 8','81100000008','c08@dummy.local','Monterrey'),
('DUM2026-C09','Automotriz Rho SC','AUT090909III','Ing. Ramos','Av.9','81100000009','c09@dummy.local','Apodaca'),
('DUM2026-C10','Maderas Tau SA','MAD101010JJJ','Arq. Silva','Carr.10','81100000010','c10@dummy.local','Santiago'),
('DUM2026-C11','Hidráulica Upsilon','HID111111KKK','Ing. Ortiz','PI 11','81100000011','c11@dummy.local','Monterrey'),
('DUM2026-C12','Eléctrica Phi SC','ELE121212LLL','Ing. Cruz','Blvd.12','81100000012','c12@dummy.local','Guadalupe'),
('DUM2026-C13','Lámina Chi SA','LAM131313MMM','Ing. Reyes','Zona 13','81100000013','c13@dummy.local','Escobedo'),
('DUM2026-C14','Fundición Psi SC','FUN141414NNN','Ing. Mora','Parque14','81100000014','c14@dummy.local','Apodaca'),
('DUM2026-C15','Refrigeración Omega SA','REF151515OOO','Ing. Luna','Calle15','81100000015','c15@dummy.local','Monterrey'),
('DUM2026-C16','Empaque Alpha SC','EMP161616PPP','Lic. Soto','Av.16','81100000016','c16@dummy.local','San Nicolás'),
('DUM2026-C17','CNC Beta SA','CNC171717QQQ','Ing. Vargas','PI 17','81100000017','c17@dummy.local','Santa Catarina'),
('DUM2026-C18','Robótica Gamma','ROB181818RRR','Ing. Campos','Km18','81100000018','c18@dummy.local','Monterrey'),
('DUM2026-C19','Troquelado Delta SA','TRO191919SSS','Ing. Ibarra','Zona19','81100000019','c19@dummy.local','Guadalupe'),
('DUM2026-C20','Inyección Épsilon SC','INY202020TTT','Ing. Medina','Av.20','81100000020','c20@dummy.local','Apodaca'),
('DUM2026-C21','Estampado Zeta SA','EST212121UUU','Ing. Rojas','Calle21','81100000021','c21@dummy.local','Escobedo'),
('DUM2026-C22','Soldadura Eta SC','SOL222222VVV','Ing. Aguilar','PI 22','81100000022','c22@dummy.local','Monterrey'),
('DUM2026-C23','Pulido Theta SA','PUL232323WWW','Ing. Navarro','Blvd.23','81100000023','c23@dummy.local','San Nicolás'),
('DUM2026-C24','Corte Iota SC','COR242424XXX','Ing. Delgado','Zona24','81100000024','c24@dummy.local','Santa Catarina'),
('DUM2026-C25','Doblado Kappa SA','DOB252525YYY','Ing. Peña','Av.25','81100000025','c25@dummy.local','Monterrey'),
('DUM2026-C26','Punzonado Lambda SC','PUN262626ZZZ','Ing. Camacho','Km26','81100000026','c26@dummy.local','Guadalupe'),
('DUM2026-C27','Acabados Mu SA','ACA272727AAA','Ing. Ríos','PI 27','81100000027','c27@dummy.local','Apodaca'),
('DUM2026-C28','Pintura Nu SC','PIN282828BBB','Ing. Salas','Calle28','81100000028','c28@dummy.local','Escobedo'),
('DUM2026-C29','Logística Xi SA','LOG292929CCC','Ing. Miranda','Zona29','81100000029','c29@dummy.local','Monterrey'),
('DUM2026-C30','Distribución Omicron','DIS303030DDD','Ing. Fuentes','Av.30','81100000030','c30@dummy.local','San Nicolás');

-- ---------------------------------------------------------------------------
-- 2) REFACCIONES (30)
-- ---------------------------------------------------------------------------
INSERT INTO refacciones (codigo, descripcion, zona, stock, stock_minimo, precio_unitario, precio_usd, unidad, categoria, subcategoria, activo) VALUES
('DUM2026-R01','Filtro hidráulico HF-01','A-01-01',80,5,1250.50,74.00,'PZA','Hidráulica','Filtros',1),
('DUM2026-R02','Sellos kit SK-02','A-01-02',120,8,890.00,52.00,'KIT','Sellos','Kits',1),
('DUM2026-R03','Bomba engrane BG-03','B-02-01',15,2,15400.00,900.00,'PZA','Bomba','Engranes',1),
('DUM2026-R04','Válvula proporcional VP-04','B-02-02',22,3,9800.00,575.00,'PZA','Válvulas','Proporcional',1),
('DUM2026-R05','Sensor inductivo SI-05','C-03-01',200,10,450.00,26.00,'PZA','Sensores','Inductivos',1),
('DUM2026-R06','PLC módulo IO-06','C-03-02',8,1,22000.00,1290.00,'PZA','Eléctrico','PLC',1),
('DUM2026-R07','Variador VF-07','D-04-01',6,1,18500.00,1085.00,'PZA','Drives','Variadores',1),
('DUM2026-R08','Contactores kit KC-08','D-04-02',45,5,2100.00,123.00,'KIT','Eléctrico','Contactores',1),
('DUM2026-R09','Fusible NH-09','E-05-01',500,50,85.00,5.00,'PZA','Eléctrico','Fusibles',1),
('DUM2026-R10','Cable servo CS-10','E-05-02',150,15,32.00,1.85,'M','Cable','Servo',1),
('DUM2026-R11','Acople flexible AF-11','F-06-01',40,4,3200.00,188.00,'PZA','Mecánico','Acoples',1),
('DUM2026-R12','Rodamiento 7205-12','F-06-02',90,10,680.00,40.00,'PZA','Mecánico','Rodamientos',1),
('DUM2026-R13','Correa dentada CD-13','G-07-01',35,5,1450.00,85.00,'PZA','Transmisión','Correas',1),
('DUM2026-R14','Guía lineal GL-14','G-07-02',12,2,8900.00,523.00,'PZA','Lineal','Guías',1),
('DUM2026-R15','Tornillo de bolas TB-15','H-08-01',18,3,5600.00,329.00,'PZA','Lineal','Tornillos',1),
('DUM2026-R16','Encoder rotativo ER-16','H-08-02',25,3,4100.00,241.00,'PZA','Feedback','Encoder',1),
('DUM2026-R17','Motor servo MS-17','I-09-01',10,2,12500.00,735.00,'PZA','Motores','Servo',1),
('DUM2026-R18','Pinza neumática PN-18','I-09-02',30,5,7800.00,458.00,'PZA','Neumática','Pinzas',1),
('DUM2026-R19','Regulador presión RP-19','J-10-01',55,8,1200.00,70.00,'PZA','Neumática','Reguladores',1),
('DUM2026-R20','Cilindro compacto CC-20','J-10-02',40,6,2900.00,170.00,'PZA','Neumática','Cilindros',1),
('DUM2026-R21','Manguera hidráulica MH-21','K-11-01',200,20,95.00,5.50,'M','Hidráulica','Mangueras',1),
('DUM2026-R22','Acoplamiento rápido AR-22','K-11-02',85,10,450.00,26.00,'PZA','Hidráulica','Acoples',1),
('DUM2026-R23','Refrigerador aceite RA-23','L-12-01',14,2,6700.00,394.00,'PZA','Hidráulica','Refrigeración',1),
('DUM2026-R24','Termopar tipo K TK-24','L-12-02',120,12,220.00,13.00,'PZA','Instrumentación','Termopares',1),
('DUM2026-R25','Presostato PS-25','M-13-01',65,8,1850.00,109.00,'PZA','Instrumentación','Presión',1),
('DUM2026-R26','Inversor frecuencia IF-26','M-13-02',9,1,14200.00,835.00,'PZA','Drives','Inversores',1),
('DUM2026-R27','Tarjeta I/O TI-27','N-14-01',16,2,5600.00,329.00,'PZA','Eléctrico','I/O',1),
('DUM2026-R28','Fuente 24V FS-28','N-14-02',40,5,1850.00,109.00,'PZA','Eléctrico','Fuentes',1),
('DUM2026-R29','Rele seguridad RS-29','O-15-01',28,4,4200.00,247.00,'PZA','Seguridad','Relés',1),
('DUM2026-R30','Interruptor carga IC-30','O-15-02',50,6,3100.00,182.00,'PZA','Seguridad','Interruptores',1);

-- ---------------------------------------------------------------------------
-- 3) MÁQUINAS (30) — una por cliente demo
-- ---------------------------------------------------------------------------
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30
)
INSERT INTO maquinas (cliente_id, codigo, nombre, marca, modelo, numero_serie, ubicacion, activo, categoria, categoria_principal, precio_lista_usd, stock)
SELECT
  (SELECT id FROM clientes WHERE codigo = 'DUM2026-C' || printf('%02d', seq.n)),
  'DUM2026-M' || printf('%02d', seq.n),
  'Centro CNC demo ' || seq.n,
  'Haas',
  'VF-2SS',
  'SN-DUM-' || printf('%02d', seq.n),
  'Planta principal',
  1,
  'CNC',
  'Vertical',
  85000 + seq.n * 1000,
  0
FROM seq;

-- ---------------------------------------------------------------------------
-- 4) PERSONAL / TÉCNICOS (30) — nombres únicos
-- ---------------------------------------------------------------------------
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30
)
INSERT INTO tecnicos (nombre, activo, rol, puesto, departamento, profesion, habilidades, es_vendedor, comision_maquinas_pct, comision_refacciones_pct, ocupado)
SELECT
  'DUM Personal ' || printf('%02d', seq.n),
  1,
  CASE WHEN seq.n % 2 = 0 THEN 'Técnico servicio' ELSE 'Vendedor' END,
  CASE WHEN seq.n % 3 = 0 THEN 'Jefe de área' ELSE 'Técnico' END,
  CASE WHEN seq.n % 2 = 0 THEN 'Servicio' ELSE 'Ventas' END,
  'Ingeniero industrial',
  'CNC, hidráulica, PLC',
  CASE WHEN seq.n % 2 = 0 THEN 0 ELSE 1 END,
  8 + (seq.n % 5),
  10 + (seq.n % 4),
  0
FROM seq;

-- ---------------------------------------------------------------------------
-- 5) COTIZACIONES (30) — 15 borrador + 15 aplicada (Ventas lee aplicada/venta)
--     Usa VALUES(1..30) en lugar de WITH RECURSIVE (más compatible con Turso).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 6) LÍNEAS DE COTIZACIÓN (30) — una por cotización
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 7) INCIDENTES (30)
-- ---------------------------------------------------------------------------
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30
)
INSERT INTO incidentes (
  folio, cliente_id, maquina_id, descripcion, prioridad, fecha_reporte,
  estatus, tecnico_responsable, fecha_vencimiento
)
SELECT
  'DUM2026-I' || printf('%02d', seq.n),
  (SELECT id FROM clientes WHERE codigo = 'DUM2026-C' || printf('%02d', seq.n)),
  (SELECT id FROM maquinas WHERE codigo = 'DUM2026-M' || printf('%02d', seq.n)),
  'Falla reportada en equipo demo ' || seq.n,
  CASE WHEN seq.n % 4 = 0 THEN 'alta' WHEN seq.n % 4 = 1 THEN 'media' ELSE 'baja' END,
  date('now', '-' || seq.n || ' days'),
  CASE WHEN seq.n % 5 = 0 THEN 'cerrado' ELSE 'abierto' END,
  'Técnico Demo',
  date('now', '+' || (7 + seq.n) || ' days')
FROM seq;

-- ---------------------------------------------------------------------------
-- 8) BITÁCORAS (30) — bitácora de horas
-- ---------------------------------------------------------------------------
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30
)
INSERT INTO bitacoras (incidente_id, cotizacion_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados)
SELECT
  (SELECT id FROM incidentes WHERE folio = 'DUM2026-I' || printf('%02d', seq.n)),
  NULL,
  date('now', '-' || seq.n || ' days'),
  'Téc. Bitácora ' || printf('%02d', seq.n),
  'Servicio en campo, revisión y ajuste. Orden ' || seq.n,
  2.5 + (seq.n % 6) * 0.5,
  'Consumibles demo'
FROM seq;

-- ---------------------------------------------------------------------------
-- 9) MANTENIMIENTOS (calendario / máquina)
-- ---------------------------------------------------------------------------
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30
)
INSERT INTO mantenimientos (maquina_id, tipo, fecha_inicio, fecha_fin, descripcion_falla, tecnico, horas_invertidas, costo_total)
SELECT
  (SELECT id FROM maquinas WHERE codigo = 'DUM2026-M' || printf('%02d', seq.n)),
  CASE WHEN seq.n % 2 = 0 THEN 'preventivo' ELSE 'correctivo' END,
  date('now', '-' || (120 - seq.n) || ' days'),
  date('now', '-' || (119 - seq.n) || ' days'),
  'Mantenimiento programado / revisión ' || seq.n,
  'Mant. Demo',
  3.0 + (seq.n % 4),
  2500.0 + seq.n * 150.0
FROM seq;

-- ---------------------------------------------------------------------------
-- 10) REPORTES (30)
-- ---------------------------------------------------------------------------
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30
)
INSERT INTO reportes (
  folio, cliente_id, razon_social, maquina_id, numero_maquina, tipo_reporte, subtipo,
  descripcion, tecnico, fecha, estatus, finalizado
)
SELECT
  'DUM2026-REP' || printf('%02d', seq.n),
  (SELECT id FROM clientes WHERE codigo = 'DUM2026-C' || printf('%02d', seq.n)),
  'Cliente demo ' || seq.n,
  (SELECT id FROM maquinas WHERE codigo = 'DUM2026-M' || printf('%02d', seq.n)),
  'NM-DUM-' || printf('%02d', seq.n),
  CASE WHEN seq.n % 2 = 0 THEN 'servicio' ELSE 'venta' END,
  CASE WHEN seq.n % 3 = 0 THEN 'falla_mecanica' WHEN seq.n % 3 = 1 THEN 'falla_electrica' ELSE 'instalacion' END,
  'Reporte de servicio demo ' || seq.n,
  'Ing. Reporte',
  date('now', '-' || (30 - seq.n) || ' days'),
  CASE WHEN seq.n % 4 = 0 THEN 'cerrado' ELSE 'abierto' END,
  CASE WHEN seq.n % 4 = 0 THEN 1 ELSE 0 END
FROM seq;

-- ---------------------------------------------------------------------------
-- 11) GARANTÍAS (30) — mitad activas, mitad sin cobertura (activa=0)
-- ---------------------------------------------------------------------------
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30
)
INSERT INTO garantias (
  cliente_id, razon_social, modelo_maquina, numero_serie, tipo_maquina, fecha_entrega, activa, maximo_mantenimientos
)
SELECT
  (SELECT id FROM clientes WHERE codigo = 'DUM2026-C' || printf('%02d', seq.n)),
  'Razón social demo ' || seq.n,
  'Mod-Garantía-' || printf('%02d', seq.n),
  'GSN-DUM-' || printf('%02d', seq.n),
  'CNC vertical',
  date('now', '-' || (300 + seq.n) || ' days'),
  CASE WHEN seq.n <= 15 THEN 1 ELSE 0 END,
  2
FROM seq;

-- ---------------------------------------------------------------------------
-- 12) MANTENIMIENTOS DE GARANTÍA (30)
-- ---------------------------------------------------------------------------
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30
)
INSERT INTO mantenimientos_garantia (
  garantia_id, numero, anio, fecha_programada, fecha_realizada, costo, confirmado, pagado, notas
)
SELECT
  (SELECT g.id FROM garantias g
   JOIN clientes c ON c.id = g.cliente_id
   WHERE c.codigo = 'DUM2026-C' || printf('%02d', seq.n)
   ORDER BY g.id DESC LIMIT 1),
  1 + (seq.n % 2),
  CAST(strftime('%Y', 'now') AS INTEGER),
  date('now', '+' || seq.n || ' days'),
  CASE WHEN seq.n % 2 = 0 THEN date('now', '-' || seq.n || ' days') ELSE NULL END,
  1500.0 + seq.n * 50.0,
  CASE WHEN seq.n % 2 = 0 THEN 1 ELSE 0 END,
  CASE WHEN seq.n % 2 = 0 THEN 1500.0 ELSE 0 END,
  'MG demo ' || seq.n
FROM seq;

-- ---------------------------------------------------------------------------
-- 13) BONOS (30)
-- ---------------------------------------------------------------------------
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30
)
INSERT INTO bonos (reporte_id, tecnico, tipo_capacitacion, modalidad, monto_bono, dias, monto_total, fecha, pagado)
SELECT
  (SELECT id FROM reportes WHERE folio = 'DUM2026-REP' || printf('%02d', seq.n)),
  'Capacitador Demo',
  'CNC',
  CASE WHEN seq.n % 2 = 0 THEN 'remoto' ELSE 'local' END,
  500.0,
  1 + (seq.n % 3),
  500.0 * (1 + (seq.n % 3)),
  date('now', '-' || (10 - seq.n) || ' days'),
  CASE WHEN seq.n % 3 = 0 THEN 1 ELSE 0 END
FROM seq;

-- ---------------------------------------------------------------------------
-- 14) VIAJES (30)
-- ---------------------------------------------------------------------------
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30
)
INSERT INTO viajes (
  tecnico, cliente_id, razon_social, maquina, numero_serie, actividad, estado,
  fecha_inicio, fecha_fin, dias, monto_viaticos, descripcion, reporte_id, liquidado
)
SELECT
  'Viajero Demo ' || printf('%02d', seq.n),
  (SELECT id FROM clientes WHERE codigo = 'DUM2026-C' || printf('%02d', seq.n)),
  'Cliente viaje ' || seq.n,
  'VF-2',
  'SN-V-' || printf('%02d', seq.n),
  'Instalación / servicio',
  'NL',
  date('now', '-' || (40 - seq.n) || ' days'),
  date('now', '-' || (38 - seq.n) || ' days'),
  2,
  2000.0,
  'Viaje demo ' || seq.n,
  (SELECT id FROM reportes WHERE folio = 'DUM2026-REP' || printf('%02d', seq.n)),
  CASE WHEN seq.n % 4 = 0 THEN 1 ELSE 0 END
FROM seq;

-- ---------------------------------------------------------------------------
-- 15) MOVIMIENTOS DE STOCK (30)
-- ---------------------------------------------------------------------------
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30
)
INSERT INTO movimientos_stock (refaccion_id, tipo, cantidad, costo_unitario, cotizacion_id, referencia, fecha)
SELECT
  (SELECT id FROM refacciones WHERE codigo = 'DUM2026-R' || printf('%02d', seq.n)),
  CASE WHEN seq.n % 2 = 0 THEN 'entrada' ELSE 'salida' END,
  5.0 + (seq.n % 10),
  400.0 + seq.n * 5.0,
  (SELECT id FROM cotizaciones WHERE folio = 'DUM2026-Q' || printf('%02d', seq.n)),
  'Mov demo ' || seq.n,
  date('now', '-' || seq.n || ' days')
FROM seq;

-- ---------------------------------------------------------------------------
-- 16) REVISIÓN MÁQUINAS (30)
-- ---------------------------------------------------------------------------
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30
)
INSERT INTO revision_maquinas (
  maquina_id, tipo_maquina, categoria, modelo, numero_serie, entregado, prueba, comentarios
)
SELECT
  (SELECT id FROM maquinas WHERE codigo = 'DUM2026-M' || printf('%02d', seq.n)),
  'CNC',
  CASE WHEN seq.n % 2 = 0 THEN 'Vertical' ELSE 'Horizontal' END,
  'VF-2SS',
  'RV-DUM-' || printf('%02d', seq.n),
  CASE WHEN seq.n % 3 = 0 THEN 'Sí' ELSE 'No' END,
  CASE WHEN seq.n % 2 = 0 THEN 'OK' ELSE 'En Proceso' END,
  'Revisión demo ' || seq.n
FROM seq;

-- ---------------------------------------------------------------------------
-- 17) TARIFAS extra (30 claves demo; las oficiales las rellena el servidor)
--     OR IGNORE: si ya existían, no revienta el COMMIT y no pierdes cotizaciones.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO tarifas (clave, valor, actualizado_en) VALUES
('dummy_tarifa_01','100',datetime('now','localtime')),
('dummy_tarifa_02','110',datetime('now','localtime')),
('dummy_tarifa_03','120',datetime('now','localtime')),
('dummy_tarifa_04','130',datetime('now','localtime')),
('dummy_tarifa_05','140',datetime('now','localtime')),
('dummy_tarifa_06','150',datetime('now','localtime')),
('dummy_tarifa_07','160',datetime('now','localtime')),
('dummy_tarifa_08','170',datetime('now','localtime')),
('dummy_tarifa_09','180',datetime('now','localtime')),
('dummy_tarifa_10','190',datetime('now','localtime')),
('dummy_tarifa_11','200',datetime('now','localtime')),
('dummy_tarifa_12','210',datetime('now','localtime')),
('dummy_tarifa_13','220',datetime('now','localtime')),
('dummy_tarifa_14','230',datetime('now','localtime')),
('dummy_tarifa_15','240',datetime('now','localtime')),
('dummy_tarifa_16','250',datetime('now','localtime')),
('dummy_tarifa_17','260',datetime('now','localtime')),
('dummy_tarifa_18','270',datetime('now','localtime')),
('dummy_tarifa_19','280',datetime('now','localtime')),
('dummy_tarifa_20','290',datetime('now','localtime')),
('dummy_tarifa_21','300',datetime('now','localtime')),
('dummy_tarifa_22','310',datetime('now','localtime')),
('dummy_tarifa_23','320',datetime('now','localtime')),
('dummy_tarifa_24','330',datetime('now','localtime')),
('dummy_tarifa_25','340',datetime('now','localtime')),
('dummy_tarifa_26','350',datetime('now','localtime')),
('dummy_tarifa_27','360',datetime('now','localtime')),
('dummy_tarifa_28','370',datetime('now','localtime')),
('dummy_tarifa_29','380',datetime('now','localtime')),
('dummy_tarifa_30','390',datetime('now','localtime'));

-- ---------------------------------------------------------------------------
-- 18) AUDITORÍA (30) — opcional para llenar pestaña
-- ---------------------------------------------------------------------------
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30
)
INSERT INTO audit_log (username, role, action, method, path, detail, ip)
SELECT
  'admin',
  'admin',
  'demo_seed',
  'GET',
  '/api/demo',
  'Registro dummy ' || seq.n,
  '127.0.0.' || printf('%d', (seq.n % 200) + 1)
FROM seq;

COMMIT;

-- Fin. Ventas: cotizaciones con estado "aplicada" (Q16–Q30). Sin cobertura: garantías 16–30 con activa=0.
