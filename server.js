/**
 * Sistema de Cotización - API y sitio web. Ver todo en línea.
 * Base de datos: Turso (nube) o SQLite local. 100% gratuito.
 */
try { require('dotenv').config(); } catch (_) { /* dotenv opcional: en producción usamos variables del entorno */ }
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');

const app = express();
// En la nube (Render, etc.) usan process.env.PORT. Local: 3456 para evitar conflicto con otros servicios en 3000
const PORT = process.env.PORT || 3456;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/** Normaliza para búsqueda: minúsculas y sin acentos (manómetro === manometro). */
function normalizeForSearch(str) {
  if (str == null || str === '') return '';
  return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// --- API Catálogos ---
app.get('/api/clientes', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    let rows = await db.getAll('SELECT * FROM clientes ORDER BY nombre LIMIT 500', []);
    if (q) {
      const normQ = normalizeForSearch(q);
      rows = rows.filter(c => normalizeForSearch(c.nombre).includes(normQ) || normalizeForSearch(c.codigo).includes(normQ) || normalizeForSearch(c.rfc).includes(normQ));
      rows = rows.slice(0, 100);
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/clientes/:id', async (req, res) => {
  try {
    const row = await db.getOne('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/clientes', async (req, res) => {
  try {
    const { codigo, nombre, rfc, contacto, direccion, telefono, email, ciudad } = req.body || {};
    await db.runQuery(
      `INSERT INTO clientes (codigo, nombre, rfc, contacto, direccion, telefono, email, ciudad)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [codigo || null, nombre || '', rfc || null, contacto || null, direccion || null, telefono || null, email || null, ciudad || null]
    );
    const r = await db.getOne('SELECT * FROM clientes ORDER BY id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/clientes/:id', async (req, res) => {
  try {
    const { codigo, nombre, rfc, contacto, direccion, telefono, email, ciudad } = req.body || {};
    await db.runQuery(
      `UPDATE clientes SET codigo=?, nombre=?, rfc=?, contacto=?, direccion=?, telefono=?, email=?, ciudad=? WHERE id=?`,
      [codigo || null, nombre || '', rfc || null, contacto || null, direccion || null, telefono || null, email || null, ciudad || null, req.params.id]
    );
    const r = await db.getOne('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
    res.json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/clientes/:id', async (req, res) => {
  try {
    await db.runQuery('DELETE FROM clientes WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Refacciones ---
app.get('/api/refacciones', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    let sql = 'SELECT * FROM refacciones WHERE activo = 1 ORDER BY codigo';
    let params = [];
    if (q) {
      sql = 'SELECT * FROM refacciones WHERE activo = 1 AND (codigo LIKE ? OR descripcion LIKE ?) ORDER BY codigo LIMIT 100';
      const p = `%${q}%`;
      params = [p, p];
    }
    const rows = await db.getAll(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/refacciones/:id', async (req, res) => {
  try {
    const row = await db.getOne('SELECT * FROM refacciones WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/refacciones', async (req, res) => {
  try {
    const { codigo, descripcion, marca, origen, precio_unitario, unidad } = req.body || {};
    await db.runQuery(
      `INSERT INTO refacciones (codigo, descripcion, marca, origen, precio_unitario, unidad) VALUES (?, ?, ?, ?, ?, ?)`,
      [codigo || '', descripcion || '', marca || null, origen || null, Number(precio_unitario) || 0, unidad || 'PZA']
    );
    const r = await db.getOne('SELECT * FROM refacciones ORDER BY id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/refacciones/:id', async (req, res) => {
  try {
    const { codigo, descripcion, marca, origen, precio_unitario, unidad } = req.body || {};
    await db.runQuery(
      `UPDATE refacciones SET codigo=?, descripcion=?, marca=?, origen=?, precio_unitario=?, unidad=? WHERE id=?`,
      [codigo || '', descripcion || '', marca || null, origen || null, Number(precio_unitario) || 0, unidad || 'PZA', req.params.id]
    );
    const r = await db.getOne('SELECT * FROM refacciones WHERE id = ?', [req.params.id]);
    res.json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/refacciones/:id', async (req, res) => {
  try {
    await db.runQuery('UPDATE refacciones SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Máquinas ---
app.get('/api/maquinas', async (req, res) => {
  try {
    const clienteId = req.query.cliente_id;
    let sql = 'SELECT m.*, c.nombre as cliente_nombre FROM maquinas m LEFT JOIN clientes c ON c.id = m.cliente_id WHERE m.activo = 1 ORDER BY m.nombre';
    let params = [];
    if (clienteId) {
      sql = 'SELECT m.*, c.nombre as cliente_nombre FROM maquinas m LEFT JOIN clientes c ON c.id = m.cliente_id WHERE m.activo = 1 AND m.cliente_id = ? ORDER BY m.nombre';
      params = [clienteId];
    }
    const rows = await db.getAll(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/maquinas/:id', async (req, res) => {
  try {
    const row = await db.getOne('SELECT m.*, c.nombre as cliente_nombre FROM maquinas m LEFT JOIN clientes c ON c.id = m.cliente_id WHERE m.id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/maquinas', async (req, res) => {
  try {
    const { cliente_id, codigo, nombre, marca, modelo, numero_serie, ubicacion } = req.body || {};
    if (!cliente_id) return res.status(400).json({ error: 'cliente_id requerido' });
    await db.runQuery(
      `INSERT INTO maquinas (cliente_id, codigo, nombre, marca, modelo, numero_serie, ubicacion) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [cliente_id, codigo || null, nombre || '', marca || null, modelo || null, numero_serie || null, ubicacion || null]
    );
    const r = await db.getOne('SELECT * FROM maquinas ORDER BY id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/maquinas/:id', async (req, res) => {
  try {
    const { cliente_id, codigo, nombre, marca, modelo, numero_serie, ubicacion } = req.body || {};
    await db.runQuery(
      `UPDATE maquinas SET cliente_id=?, codigo=?, nombre=?, marca=?, modelo=?, numero_serie=?, ubicacion=? WHERE id=?`,
      [cliente_id || null, codigo || null, nombre || '', marca || null, modelo || null, numero_serie || null, ubicacion || null, req.params.id]
    );
    const r = await db.getOne('SELECT * FROM maquinas WHERE id = ?', [req.params.id]);
    res.json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/maquinas/:id', async (req, res) => {
  try {
    await db.runQuery('UPDATE maquinas SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Cotizaciones ---
app.get('/api/cotizaciones', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT co.*, c.nombre as cliente_nombre FROM cotizaciones co JOIN clientes c ON c.id = co.cliente_id ORDER BY co.fecha DESC, co.id DESC LIMIT 200`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/cotizaciones/:id', async (req, res) => {
  try {
    const row = await db.getOne(
      'SELECT co.*, c.nombre as cliente_nombre FROM cotizaciones co JOIN clientes c ON c.id = co.cliente_id WHERE co.id = ?',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

function generarFolio(prefijo) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${prefijo}-${y}${m}${day}-${Math.floor(Math.random() * 9000) + 1000}`;
}

app.post('/api/cotizaciones', async (req, res) => {
  try {
    const { cliente_id, tipo, fecha, subtotal, iva, total, folio } = req.body || {};
    if (!cliente_id) return res.status(400).json({ error: 'cliente_id requerido' });
    const f = folio || generarFolio(tipo === 'mano_obra' ? 'COT-MO' : 'COT-REF');
    const st = Number(subtotal) || 0;
    const iv = Number(iva) || 0;
    const tot = Number(total) != null ? Number(total) : st + iv;
    await db.runQuery(
      `INSERT INTO cotizaciones (folio, cliente_id, tipo, fecha, subtotal, iva, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [f, cliente_id, tipo || 'refacciones', fecha || new Date().toISOString().slice(0, 10), st, iv, tot]
    );
    const r = await db.getOne('SELECT co.*, c.nombre as cliente_nombre FROM cotizaciones co JOIN clientes c ON c.id = co.cliente_id ORDER BY co.id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/cotizaciones/:id', async (req, res) => {
  try {
    const { folio, cliente_id, tipo, fecha, subtotal, iva, total } = req.body || {};
    await db.runQuery(
      `UPDATE cotizaciones SET folio=?, cliente_id=?, tipo=?, fecha=?, subtotal=?, iva=?, total=? WHERE id=?`,
      [folio || null, cliente_id || null, tipo || 'refacciones', fecha || null, Number(subtotal) || 0, Number(iva) || 0, Number(total) || 0, req.params.id]
    );
    const r = await db.getOne('SELECT co.*, c.nombre as cliente_nombre FROM cotizaciones co JOIN clientes c ON c.id = co.cliente_id WHERE co.id = ?', [req.params.id]);
    res.json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/cotizaciones/:id', async (req, res) => {
  try {
    await db.runQuery('DELETE FROM cotizacion_lineas WHERE cotizacion_id = ?', [req.params.id]);
    await db.runQuery('DELETE FROM cotizaciones WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Incidentes ---
app.get('/api/incidentes', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT i.*, c.nombre as cliente_nombre, m.nombre as maquina_nombre FROM incidentes i JOIN clientes c ON c.id = i.cliente_id LEFT JOIN maquinas m ON m.id = i.maquina_id ORDER BY i.fecha_reporte DESC LIMIT 200`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/incidentes/:id', async (req, res) => {
  try {
    const row = await db.getOne(
      `SELECT i.*, c.nombre as cliente_nombre, m.nombre as maquina_nombre FROM incidentes i JOIN clientes c ON c.id = i.cliente_id LEFT JOIN maquinas m ON m.id = i.maquina_id WHERE i.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

function generarFolioIncidente() {
  const d = new Date();
  return `INC-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 9000) + 1000}`;
}

app.post('/api/incidentes', async (req, res) => {
  try {
    const { cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, fecha_cerrado, tecnico_responsable, estatus } = req.body || {};
    if (!cliente_id) return res.status(400).json({ error: 'cliente_id requerido' });
    if (!descripcion || !descripcion.trim()) return res.status(400).json({ error: 'descripcion requerida' });
    const folio = generarFolioIncidente();
    const est = estatus || 'abierto';
    const fCerr = fecha_cerrado || (est === 'cerrado' ? new Date().toISOString().slice(0, 10) : null);
    await db.runQuery(
      `INSERT INTO incidentes (folio, cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, fecha_cerrado, tecnico_responsable, estatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [folio, cliente_id, maquina_id || null, descripcion.trim(), prioridad || 'media', fecha_reporte || new Date().toISOString().slice(0, 10), fCerr, tecnico_responsable || null, est]
    );
    const r = await db.getOne('SELECT i.*, c.nombre as cliente_nombre, m.nombre as maquina_nombre FROM incidentes i JOIN clientes c ON c.id = i.cliente_id LEFT JOIN maquinas m ON m.id = i.maquina_id ORDER BY i.id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/incidentes/:id', async (req, res) => {
  try {
    const { cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, fecha_cerrado, tecnico_responsable, estatus } = req.body || {};
    const est = estatus || 'abierto';
    let fCerr = fecha_cerrado;
    if (est === 'cerrado' && !fCerr) fCerr = new Date().toISOString().slice(0, 10);
    else if (est !== 'cerrado') fCerr = null;
    await db.runQuery(
      `UPDATE incidentes SET cliente_id=?, maquina_id=?, descripcion=?, prioridad=?, fecha_reporte=?, fecha_cerrado=?, tecnico_responsable=?, estatus=? WHERE id=?`,
      [cliente_id || null, maquina_id || null, descripcion || '', prioridad || 'media', fecha_reporte || null, fCerr, tecnico_responsable || null, est, req.params.id]
    );
    const r = await db.getOne('SELECT i.*, c.nombre as cliente_nombre, m.nombre as maquina_nombre FROM incidentes i JOIN clientes c ON c.id = i.cliente_id LEFT JOIN maquinas m ON m.id = i.maquina_id WHERE i.id = ?', [req.params.id]);
    res.json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/incidentes/:id', async (req, res) => {
  try {
    await db.runQuery('DELETE FROM incidentes WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Bitácoras (horas / servicio realizado) ---
app.get('/api/bitacoras', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT b.*, i.folio as incidente_folio, co.folio as cotizacion_folio
       FROM bitacoras b
       LEFT JOIN incidentes i ON i.id = b.incidente_id
       LEFT JOIN cotizaciones co ON co.id = b.cotizacion_id
       ORDER BY b.fecha DESC, b.id DESC LIMIT 200`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/bitacoras/:id', async (req, res) => {
  try {
    const row = await db.getOne(
      `SELECT b.*, i.folio as incidente_folio, co.folio as cotizacion_folio FROM bitacoras b
       LEFT JOIN incidentes i ON i.id = b.incidente_id LEFT JOIN cotizaciones co ON co.id = b.cotizacion_id WHERE b.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/bitacoras', async (req, res) => {
  try {
    const { incidente_id, cotizacion_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados } = req.body || {};
    if (!incidente_id && !cotizacion_id) return res.status(400).json({ error: 'Indica incidente_id o cotizacion_id' });
    await db.runQuery(
      `INSERT INTO bitacoras (incidente_id, cotizacion_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [incidente_id || null, cotizacion_id || null, fecha || new Date().toISOString().slice(0, 10), tecnico || null, actividades || null, Number(tiempo_horas) || 0, materiales_usados || null]
    );
    const r = await db.getOne('SELECT * FROM bitacoras ORDER BY id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/bitacoras/:id', async (req, res) => {
  try {
    const { incidente_id, cotizacion_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados } = req.body || {};
    await db.runQuery(
      `UPDATE bitacoras SET incidente_id=?, cotizacion_id=?, fecha=?, tecnico=?, actividades=?, tiempo_horas=?, materiales_usados=? WHERE id=?`,
      [incidente_id || null, cotizacion_id || null, fecha || null, tecnico || null, actividades || null, Number(tiempo_horas) || 0, materiales_usados || null, req.params.id]
    );
    const r = await db.getOne('SELECT * FROM bitacoras WHERE id = ?', [req.params.id]);
    res.json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/bitacoras/:id', async (req, res) => {
  try {
    await db.runQuery('DELETE FROM bitacoras WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Dashboard estadísticas avanzadas: periodos y pronósticos ---
function toYMD(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function addYears(d, n) { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return x; }
function startOfWeekMonday(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}
function startOfMonth(d) { const x = new Date(d); x.setDate(1); return x; }
function startOfYear(d) { const x = new Date(d); x.setMonth(0); x.setDate(1); return x; }
function endOfMonth(d) { return addDays(addMonths(startOfMonth(d), 1), -1); }
function endOfYear(d) { const x = new Date(d); x.setMonth(11); x.setDate(31); return x; }

app.get('/api/dashboard-stats', async (req, res) => {
  try {
    const today = new Date();
    const todayStr = toYMD(today);

    // Semana actual (lunes a hoy) y semana anterior (lunes a domingo)
    const weekStart = startOfWeekMonday(today);
    const weekEnd = addDays(weekStart, 6);
    const prevWeekStart = addDays(weekStart, -7);
    const prevWeekEnd = addDays(weekStart, -1);

    const ranges = {
      semana_actual: { inicio: toYMD(weekStart), fin: todayStr },
      semana_anterior: { inicio: toYMD(prevWeekStart), fin: toYMD(prevWeekEnd) },
      mes_actual: { inicio: toYMD(startOfMonth(today)), fin: todayStr },
      mes_anterior: { inicio: toYMD(startOfMonth(addMonths(today, -1))), fin: toYMD(endOfMonth(addMonths(today, -1))) },
      año_actual: { inicio: toYMD(startOfYear(today)), fin: todayStr },
      año_anterior: { inicio: toYMD(startOfYear(addYears(today, -1))), fin: toYMD(endOfYear(addYears(today, -1))) },
    };

    async function queryCotizaciones(inicio, fin) {
      const rows = await db.getAll(
        `SELECT COUNT(*) as n, COALESCE(SUM(CAST(total AS REAL)), 0) as monto FROM cotizaciones WHERE fecha >= ? AND fecha <= ?`,
        [inicio, fin]
      );
      return { count: (rows[0] && rows[0].n) || 0, monto: Number(rows[0] && rows[0].monto) || 0 };
    }
    async function queryIncidentes(inicio, fin) {
      const rows = await db.getAll(
        `SELECT COUNT(*) as n FROM incidentes WHERE fecha_reporte >= ? AND fecha_reporte <= ?`,
        [inicio, fin]
      );
      return { count: (rows[0] && rows[0].n) || 0 };
    }
    async function queryBitacoras(inicio, fin) {
      const rows = await db.getAll(
        `SELECT COUNT(*) as n, COALESCE(SUM(CAST(tiempo_horas AS REAL)), 0) as horas FROM bitacoras WHERE fecha >= ? AND fecha <= ?`,
        [inicio, fin]
      );
      return { count: (rows[0] && rows[0].n) || 0, horas: Number(rows[0] && rows[0].horas) || 0 };
    }

    const [cot_sem, cot_semAnt, cot_mes, cot_mesAnt, cot_año, cot_añoAnt] = await Promise.all([
      queryCotizaciones(ranges.semana_actual.inicio, ranges.semana_actual.fin),
      queryCotizaciones(ranges.semana_anterior.inicio, ranges.semana_anterior.fin),
      queryCotizaciones(ranges.mes_actual.inicio, ranges.mes_actual.fin),
      queryCotizaciones(ranges.mes_anterior.inicio, ranges.mes_anterior.fin),
      queryCotizaciones(ranges.año_actual.inicio, ranges.año_actual.fin),
      queryCotizaciones(ranges.año_anterior.inicio, ranges.año_anterior.fin),
    ]);
    const [inc_sem, inc_semAnt, inc_mes, inc_mesAnt, inc_año, inc_añoAnt] = await Promise.all([
      queryIncidentes(ranges.semana_actual.inicio, ranges.semana_actual.fin),
      queryIncidentes(ranges.semana_anterior.inicio, ranges.semana_anterior.fin),
      queryIncidentes(ranges.mes_actual.inicio, ranges.mes_actual.fin),
      queryIncidentes(ranges.mes_anterior.inicio, ranges.mes_anterior.fin),
      queryIncidentes(ranges.año_actual.inicio, ranges.año_actual.fin),
      queryIncidentes(ranges.año_anterior.inicio, ranges.año_anterior.fin),
    ]);
    const [bit_sem, bit_semAnt, bit_mes, bit_mesAnt, bit_año, bit_añoAnt] = await Promise.all([
      queryBitacoras(ranges.semana_actual.inicio, ranges.semana_actual.fin),
      queryBitacoras(ranges.semana_anterior.inicio, ranges.semana_anterior.fin),
      queryBitacoras(ranges.mes_actual.inicio, ranges.mes_actual.fin),
      queryBitacoras(ranges.mes_anterior.inicio, ranges.mes_anterior.fin),
      queryBitacoras(ranges.año_actual.inicio, ranges.año_actual.fin),
      queryBitacoras(ranges.año_anterior.inicio, ranges.año_anterior.fin),
    ]);

    const periodos = {
      semana_actual: { cotizaciones: cot_sem, incidentes: inc_sem, bitacoras: bit_sem, etiqueta: 'Semana actual' },
      semana_anterior: { cotizaciones: cot_semAnt, incidentes: inc_semAnt, bitacoras: bit_semAnt, etiqueta: 'Semana anterior' },
      mes_actual: { cotizaciones: cot_mes, incidentes: inc_mes, bitacoras: bit_mes, etiqueta: 'Mes actual' },
      mes_anterior: { cotizaciones: cot_mesAnt, incidentes: inc_mesAnt, bitacoras: bit_mesAnt, etiqueta: 'Mes anterior' },
      año_actual: { cotizaciones: cot_año, incidentes: inc_año, bitacoras: bit_año, etiqueta: 'Año actual' },
      año_anterior: { cotizaciones: cot_añoAnt, incidentes: inc_añoAnt, bitacoras: bit_añoAnt, etiqueta: 'Año anterior' },
    };

    // Pronósticos: promedio del periodo actual y anterior (siguiente semana/mes/año)
    const pronostico_semana = {
      cotizaciones_count: Math.round((cot_semAnt.count + cot_sem.count) / 2) || cot_sem.count,
      cotizaciones_monto: Math.round(((cot_semAnt.monto + cot_sem.monto) / 2) * 100) / 100,
      incidentes_count: Math.round((inc_semAnt.count + inc_sem.count) / 2) || inc_sem.count,
      bitacoras_count: Math.round((bit_semAnt.count + bit_sem.count) / 2) || bit_sem.count,
      bitacoras_horas: Math.round(((bit_semAnt.horas + bit_sem.horas) / 2) * 10) / 10 || bit_sem.horas,
    };
    const pronostico_mes = {
      cotizaciones_count: Math.round((cot_mesAnt.count + cot_mes.count) / 2) || cot_mes.count,
      cotizaciones_monto: Math.round(((cot_mesAnt.monto + cot_mes.monto) / 2) * 100) / 100,
      incidentes_count: Math.round((inc_mesAnt.count + inc_mes.count) / 2) || inc_mes.count,
      bitacoras_count: Math.round((bit_mesAnt.count + bit_mes.count) / 2) || bit_mes.count,
      bitacoras_horas: Math.round(((bit_mesAnt.horas + bit_mes.horas) / 2) * 10) / 10 || bit_mes.horas,
    };
    const pronostico_año = {
      cotizaciones_count: cot_añoAnt.count || cot_año.count,
      cotizaciones_monto: Math.round((cot_añoAnt.monto || cot_año.monto) * 100) / 100,
      incidentes_count: inc_añoAnt.count || inc_año.count,
      bitacoras_count: bit_añoAnt.count || bit_año.count,
      bitacoras_horas: Math.round((bit_añoAnt.horas || bit_año.horas) * 10) / 10 || bit_año.horas,
    };

    res.json({
      periodos,
      pronosticos: {
        proxima_semana: pronostico_semana,
        proximo_mes: pronostico_mes,
        proximo_año: pronostico_año,
      },
      rangos: ranges,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Cargar datos demo (desde seed-demo.json) ---
// Normaliza para matching: quita acentos, minúsculas, espacios colapsados
function norm(s) {
  if (!s || typeof s !== 'string') return '';
  const sinAcentos = String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return sinAcentos.toLowerCase().replace(/\s+/g, ' ').trim();
}
app.post('/api/seed-demo', async (req, res) => {
  try {
    const [cCount] = await db.getAll('SELECT COUNT(*) as n FROM clientes');
    if (cCount && cCount.n > 0) {
      return res.status(400).json({ error: 'Ya hay datos cargados. El demo solo se puede cargar cuando no hay clientes. Si quieres volver a cargar, elimina primero los clientes desde la pestaña Clientes.' });
    }
    const seedPath = path.join(__dirname, 'seed-demo.json');
    if (!fs.existsSync(seedPath)) return res.status(404).json({ error: 'No existe seed-demo.json. Ejecuta: python exportar_demo.py' });
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

    const clientes = seed.clientes || [];
    const refacciones = seed.refacciones || [];
    const maquinas = seed.maquinas || [];
    const incidentes = seed.incidentes || [];
    const bitacoras = seed.bitacoras || [];

    const idMap = {};
    for (const c of clientes) {
      await db.runQuery(
        `INSERT INTO clientes (codigo, nombre, rfc, contacto, direccion, telefono, email, ciudad) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [c.codigo, c.nombre, c.rfc || null, c.contacto || null, c.direccion || null, c.telefono || null, c.email || null, c.ciudad || null]
      );
      const r = await db.getOne('SELECT id FROM clientes ORDER BY id DESC LIMIT 1');
      if (r) idMap[clientes.indexOf(c) + 1] = r.id;
    }
    for (const r of refacciones) {
      await db.runQuery(
        `INSERT INTO refacciones (codigo, descripcion, marca, origen, precio_unitario, unidad) VALUES (?, ?, ?, ?, ?, ?)`,
        [r.codigo, r.descripcion, r.marca || null, r.origen || null, r.precio_unitario != null ? r.precio_unitario : 0, r.unidad || 'PZA']
      );
    }
    for (const m of maquinas) {
      const cid = m.cliente_id != null ? (idMap[m.cliente_id] || m.cliente_id) : null;
      if (!cid) continue;
      await db.runQuery(
        `INSERT INTO maquinas (cliente_id, nombre, marca, modelo, numero_serie, ubicacion) VALUES (?, ?, ?, ?, ?, ?)`,
        [cid, m.nombre, m.marca || null, m.modelo || null, m.numero_serie || null, m.ubicacion || null]
      );
    }

    const clientesDb = await db.getAll('SELECT id, nombre FROM clientes');
    const maquinasDb = await db.getAll('SELECT id, cliente_id, nombre FROM maquinas');
    const clienteByNombre = {};
    clientesDb.forEach(c => { clienteByNombre[norm(c.nombre)] = c.id; });
    const maquinaByClienteYNombre = {};
    maquinasDb.forEach(m => { maquinaByClienteYNombre[m.cliente_id + '|' + norm(m.nombre)] = m.id; });

    let incidentesCount = 0;
    const incidenteByFolio = {};
    for (const inc of incidentes) {
      const clienteId = clienteByNombre[norm(inc.cliente_nombre)];
      if (!clienteId) continue;
      let maquinaId = null;
      if (inc.maquina_nombre) {
        maquinaId = maquinaByClienteYNombre[clienteId + '|' + norm(inc.maquina_nombre)];
      }
      await db.runQuery(
        `INSERT INTO incidentes (folio, cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, fecha_cerrado, tecnico_responsable, estatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [inc.folio || null, clienteId, maquinaId, inc.descripcion || '-', inc.prioridad || 'media', inc.fecha_reporte || new Date().toISOString().slice(0, 10), inc.estatus === 'cerrado' ? (inc.fecha_cerrado || new Date().toISOString().slice(0, 10)) : null, inc.tecnico_responsable || null, inc.estatus || 'abierto']
      );
      const r = await db.getOne('SELECT id FROM incidentes ORDER BY id DESC LIMIT 1');
      if (r) { incidenteByFolio[(inc.folio || '').toUpperCase()] = r.id; incidentesCount++; }
    }

    let bitacorasCount = 0;
    for (const bit of bitacoras) {
      const incidenteId = incidenteByFolio[(bit.folio_incidente || '').toUpperCase()];
      if (!incidenteId) continue;
      await db.runQuery(
        `INSERT INTO bitacoras (incidente_id, cotizacion_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [incidenteId, null, bit.fecha || new Date().toISOString().slice(0, 10), bit.tecnico || null, bit.actividades || null, Number(bit.tiempo_horas) || 0, bit.materiales_usados || null]
      );
      bitacorasCount++;
    }

    let cotizacionesCount = 0;
    const tipos = ['refacciones', 'mano_obra'];
    for (let i = 0; i < Math.min(5, clientesDb.length); i++) {
      const clienteId = clientesDb[i].id;
      const tipo = tipos[i % 2];
      const subtotal = 5000 + (i * 1500);
      const iva = Math.round(subtotal * 0.16);
      const total = subtotal + iva;
      const folio = (tipo === 'mano_obra' ? 'COT-MO' : 'COT-REF') + '-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + String(1001 + i);
      await db.runQuery(
        `INSERT INTO cotizaciones (folio, cliente_id, tipo, fecha, subtotal, iva, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [folio, clienteId, tipo, new Date().toISOString().slice(0, 10), subtotal, iva, total]
      );
      cotizacionesCount++;
    }

    res.json({
      ok: true,
      clientes: clientes.length,
      refacciones: refacciones.length,
      maquinas: maquinas.length,
      incidentes: incidentesCount,
      bitacoras: bitacorasCount,
      cotizaciones: cotizacionesCount,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Cargar solo incidentes, bitácoras y cotizaciones demo (cuando ya tienes clientes/máquinas)
app.post('/api/seed-demo-extra', async (req, res) => {
  try {
    const seedPath = path.join(__dirname, 'seed-demo.json');
    if (!fs.existsSync(seedPath)) return res.status(404).json({ error: 'No existe seed-demo.json' });
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const incidentes = seed.incidentes || [];
    const bitacoras = seed.bitacoras || [];
    const clientesDb = await db.getAll('SELECT id, nombre FROM clientes');
    const maquinasDb = await db.getAll('SELECT id, cliente_id, nombre FROM maquinas');
    const clienteByNombre = {};
    clientesDb.forEach(c => { clienteByNombre[norm(c.nombre)] = c.id; });
    const maquinaByClienteYNombre = {};
    maquinasDb.forEach(m => { maquinaByClienteYNombre[m.cliente_id + '|' + norm(m.nombre)] = m.id; });
    let incidentesCount = 0;
    const incidenteByFolio = {};
    for (const inc of incidentes) {
      const clienteId = clienteByNombre[norm(inc.cliente_nombre)];
      if (!clienteId) continue;
      let maquinaId = null;
      if (inc.maquina_nombre) maquinaId = maquinaByClienteYNombre[clienteId + '|' + norm(inc.maquina_nombre)];
      await db.runQuery(
        `INSERT INTO incidentes (folio, cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, fecha_cerrado, tecnico_responsable, estatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [inc.folio || null, clienteId, maquinaId, inc.descripcion || '-', inc.prioridad || 'media', inc.fecha_reporte || new Date().toISOString().slice(0, 10), inc.estatus === 'cerrado' ? (inc.fecha_cerrado || new Date().toISOString().slice(0, 10)) : null, inc.tecnico_responsable || null, inc.estatus || 'abierto']
      );
      const r = await db.getOne('SELECT id FROM incidentes ORDER BY id DESC LIMIT 1');
      if (r) { incidenteByFolio[(inc.folio || '').toUpperCase()] = r.id; incidentesCount++; }
    }
    let bitacorasCount = 0;
    for (const bit of bitacoras) {
      const incidenteId = incidenteByFolio[(bit.folio_incidente || '').toUpperCase()];
      if (!incidenteId) continue;
      await db.runQuery(
        `INSERT INTO bitacoras (incidente_id, cotizacion_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [incidenteId, null, bit.fecha || new Date().toISOString().slice(0, 10), bit.tecnico || null, bit.actividades || null, Number(bit.tiempo_horas) || 0, bit.materiales_usados || null]
      );
      bitacorasCount++;
    }
    let cotizacionesCount = 0;
    const tipos = ['refacciones', 'mano_obra'];
    for (let i = 0; i < Math.min(5, clientesDb.length); i++) {
      const clienteId = clientesDb[i].id;
      const tipo = tipos[i % 2];
      const subtotal = 5000 + (i * 1500);
      const iva = Math.round(subtotal * 0.16);
      const total = subtotal + iva;
      const folio = (tipo === 'mano_obra' ? 'COT-MO' : 'COT-REF') + '-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + String(2000 + i);
      await db.runQuery(
        `INSERT INTO cotizaciones (folio, cliente_id, tipo, fecha, subtotal, iva, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [folio, clienteId, tipo, new Date().toISOString().slice(0, 10), subtotal, iva, total]
      );
      cotizacionesCount++;
    }
    res.json({ ok: true, incidentes: incidentesCount, bitacoras: bitacorasCount, cotizaciones: cotizacionesCount });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/seed-status', async (req, res) => {
  try {
    const [c] = await db.getAll('SELECT COUNT(*) as n FROM clientes');
    const [r] = await db.getAll('SELECT COUNT(*) as n FROM refacciones');
    const [m] = await db.getAll('SELECT COUNT(*) as n FROM maquinas');
    const [i] = await db.getAll('SELECT COUNT(*) as n FROM incidentes');
    const [b] = await db.getAll('SELECT COUNT(*) as n FROM bitacoras');
    const [co] = await db.getAll('SELECT COUNT(*) as n FROM cotizaciones');
    res.json({ clientes: c.n, refacciones: r.n, maquinas: m.n, incidentes: i.n, bitacoras: b.n, cotizaciones: co.n });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Asistente IA: solo OpenAI-compatible (Bearer). La key de Cursor (crsr_) es para el app Cursor, no para este chat.
const AI_SYSTEM_BASE = `Eres el Agente de Soporte del Sistema de Cotización y Gestión.

REGLAS ESTRICTAS:
- Responde SIEMPRE en español. Sé amable pero directo.
- NO repitas saludos genéricos ("¡Hola!", "¿En qué puedo ayudarte?") en cada respuesta. Usa el CONTEXTO de la conversación: si el usuario ya te dio una fecha o un dato, ÚSALO para responder.
- Si el usuario pide "cotizaciones de hoy" o da una fecha (ej. 18 de marzo de 2026), usa los datos que te proporcione el sistema en este mensaje para listar o resumir las cotizaciones. No pidas de nuevo el dato que ya te dieron.
- Si tienes datos actuales del sistema (cotizaciones, clientes, etc.) en el contexto, responde con esa información de forma clara. Si no hay datos, dilo en una frase.
- No inventes datos. Si no tienes información, indica que puede revisar la pestaña correspondiente en el sistema.
- Respuestas concisas y útiles. Sin relleno ni redundancia.`;
const AI_WELCOME = `¡Hola! 👋 Soy tu Agente de Soporte.

Puedo ayudarte a consultar **cotizaciones** (por fecha, cliente), **clientes**, **refacciones**, **máquinas**, **incidentes** y **bitácora**. También puedo explicarte cómo usar el sistema.

Pregunta lo que necesites, por ejemplo: "¿Cuántas cotizaciones hay de hoy?" o "Dame las cotizaciones del 18 de marzo."`;

app.get('/api/ai/welcome', (req, res) => {
  res.json({ message: AI_WELCOME });
});

app.post('/api/ai/chat', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
  if (process.env.CURSOR_API_KEY && !apiKey) {
    return res.status(400).json({
      error: 'La API key de Cursor (crsr_...) es para el editor Cursor, no para este chat.',
      hint: 'Para el asistente de esta página usa una API compatible con OpenAI. En Render → Environment añade OPENAI_API_KEY con una key de OpenAI (crea una en https://platform.openai.com/api-keys).',
    });
  }
  if (!apiKey) {
    return res.status(503).json({
      error: 'API de IA no configurada',
      hint: 'En Render → tu servicio → Environment añade OPENAI_API_KEY (key de OpenAI). Ver CONFIG_IA.md.',
    });
  }
  if (String(apiKey).startsWith('crsr_')) {
    return res.status(400).json({
      error: 'La key que configuraste es de Cursor (crsr_...). Para este chat se necesita una key de OpenAI.',
      hint: 'Crea una en https://platform.openai.com/api-keys y añádela en Render como OPENAI_API_KEY.',
    });
  }
  try {
    const { message, messages: history } = req.body || {};
    const text = (message || '').trim();
    if (!text) return res.status(400).json({ error: 'Falta el mensaje (message)' });

    let systemContent = AI_SYSTEM_BASE;
    const lower = text.toLowerCase();
    const historyText = (Array.isArray(history) ? history : []).map(m => (m && m.content) || '').join(' ');
    const wantsCotizaciones = /\b(cotizaciones?|cotización)\b/i.test(text + ' ' + historyText) || (/\bhoy\b|fecha|\d{1,2}\s+de\s+\w+/i.test(text) && !/\bincidentes?\b/i.test(text));
    if (wantsCotizaciones) {
      try {
        const rows = await db.getAll(
          `SELECT co.id, co.folio, co.fecha, co.tipo, co.subtotal, co.iva, co.total, c.nombre as cliente_nombre
           FROM cotizaciones co JOIN clientes c ON c.id = co.cliente_id
           ORDER BY co.fecha DESC, co.id DESC LIMIT 80`
        );
        const hoy = new Date().toISOString().slice(0, 10);
        const paraHoy = rows.filter(r => r.fecha === hoy);
        systemContent += `\n\nDatos actuales del sistema (usa esto para responder):\n- Cotizaciones de HOY (${hoy}): ${paraHoy.length}. ${paraHoy.length ? paraHoy.map(c => `Folio ${c.folio}, ${c.cliente_nombre}, $${(c.total || 0).toFixed(2)}`).join('; ') : 'Ninguna.'}\n- Últimas cotizaciones (total ${rows.length}): ${rows.slice(0, 15).map(c => `${c.folio} (${c.fecha}) ${c.cliente_nombre} $${(c.total || 0).toFixed(2)}`).join('; ')}`;
      } catch (_) {}
    }
    const wantsIncidentes = /\bincidentes?\b/i.test(text + ' ' + historyText) || /\bcuántos\s+incidentes?\b|\bincidentes\s+de\s+hoy\b|\bincidentes\s+hoy\b/i.test(text);
    if (wantsIncidentes) {
      try {
        const rows = await db.getAll(
          `SELECT i.id, i.folio, i.fecha_reporte, i.fecha_cerrado, i.descripcion, i.prioridad, i.estatus, c.nombre as cliente_nombre
           FROM incidentes i JOIN clientes c ON c.id = i.cliente_id
           ORDER BY i.fecha_reporte DESC, i.id DESC LIMIT 80`
        );
        const hoy = new Date().toISOString().slice(0, 10);
        const paraHoy = rows.filter(r => (r.fecha_reporte || '').toString().slice(0, 10) === hoy);
        systemContent += `\n\nDatos actuales de incidentes (usa esto para responder):\n- Incidentes reportados HOY (${hoy}): ${paraHoy.length}. ${paraHoy.length ? paraHoy.map(inc => `${inc.folio} ${inc.cliente_nombre} ${(inc.descripcion || '').slice(0, 40)} (${inc.estatus})`).join('; ') : 'Ninguno.'}\n- Últimos incidentes (total ${rows.length}): ${rows.slice(0, 15).map(inc => `${inc.folio} (${(inc.fecha_reporte || '').slice(0, 10)}) ${inc.cliente_nombre} ${inc.estatus}`).join('; ')}`;
      } catch (_) {}
    }

    const apiMessages = [{ role: 'system', content: systemContent }];
    if (Array.isArray(history) && history.length) {
      history.forEach(m => {
        if (m && m.role && m.content) apiMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 2000) });
      });
    }
    apiMessages.push({ role: 'user', content: text });

    const apiUrl = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        max_tokens: 500,
      }),
    });
    const data = await response.json();
    if (data.error) {
      return res.status(response.ok ? 500 : response.status).json({ error: data.error.message || 'Error de la API de IA' });
    }
    const reply = data.choices?.[0]?.message?.content || 'Sin respuesta';
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Extraer datos fiscales de imagen (constancia / datos fiscales) para alta de cliente
app.post('/api/ai/extract-client', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
  if (!apiKey || String(apiKey).startsWith('crsr_')) {
    return res.status(503).json({
      error: 'Para extraer datos de imagen se necesita OPENAI_API_KEY (OpenAI) en Render.',
      hint: 'La key de Cursor no sirve para esta función. Usa una key de https://platform.openai.com/api-keys',
    });
  }
  try {
    const { fileBase64, mimeType } = req.body || {};
    if (!fileBase64) return res.status(400).json({ error: 'Falta fileBase64' });
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const mime = (mimeType || 'image/jpeg').toLowerCase();
    if (!allowed.includes(mime)) {
      return res.status(400).json({
        error: 'Por ahora solo se aceptan imágenes (JPG, PNG, GIF, WebP). PDF y Excel en una próxima versión.',
      });
    }
    const dataUrl = `data:${mime};base64,${fileBase64.replace(/^data:[^;]+;base64,/, '')}`;
    const apiUrl = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const extractPrompt = `Extrae de esta imagen (constancia fiscal, datos fiscales o documento similar) los datos del cliente. Responde ÚNICAMENTE un JSON válido, sin markdown, con estas claves (usa null si no aparece): nombre, rfc, direccion, ciudad, codigoPostal, regimenFiscal, email, telefono. Ejemplo: {"nombre":"RAZÓN SOCIAL S.A.","rfc":"ABC123456789","direccion":"Calle 1","ciudad":"Ciudad","codigoPostal":"12345","regimenFiscal":"601","email":null,"telefono":null}`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model.includes('gpt-4') ? model : 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Eres un asistente que extrae datos fiscales de imágenes. Responde solo JSON válido.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: extractPrompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 400,
      }),
    });
    const data = await response.json();
    if (data.error) {
      return res.status(response.ok ? 500 : response.status).json({ error: data.error.message || 'Error al analizar la imagen' });
    }
    const raw = data.choices?.[0]?.message?.content || '{}';
    let parsed = {};
    try {
      const cleaned = raw.replace(/```json?\s*|\s*```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (_) {
      parsed = { nombre: raw.slice(0, 200) || null };
    }
    const fields = ['nombre', 'rfc', 'direccion', 'ciudad', 'codigoPostal', 'regimenFiscal', 'email', 'telefono'];
    const result = {};
    fields.forEach(f => { result[f] = parsed[f] != null && String(parsed[f]).trim() !== '' ? String(parsed[f]).trim() : null; });
    const missing = fields.filter(f => !result[f]);
    res.json({ data: result, missing });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Extraer texto de PDF, Excel o Word para el chat; opcionalmente devolver acción "open_cotizacion" ---
const DOCUMENT_MIMES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
};
app.post('/api/ai/extract-document', async (req, res) => {
  try {
    const { fileBase64, mimeType, message: userMessage } = req.body || {};
    if (!fileBase64) return res.status(400).json({ error: 'Falta fileBase64' });
    const mime = (mimeType || '').toLowerCase();
    const docType = DOCUMENT_MIMES[mime];
    if (!docType) {
      return res.status(400).json({
        error: 'Tipo de archivo no soportado. Usa PDF, Excel (.xls, .xlsx) o Word (.docx).',
      });
    }
    const raw = fileBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    let extractedText = '';
    if (docType === 'pdf') {
      const data = await pdfParse(buffer);
      extractedText = (data && data.text) ? data.text.trim() : '';
    } else if (docType === 'docx' || docType === 'doc') {
      try {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = (result && result.value) ? result.value.trim() : '';
      } catch (err) {
        if (docType === 'doc') {
          return res.status(400).json({
            error: 'El formato Word antiguo (.doc) no está soportado. Guarda el archivo como .docx e inténtalo de nuevo.',
          });
        }
        throw err;
      }
    } else {
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const firstSheet = wb.SheetNames[0];
      if (firstSheet && wb.Sheets[firstSheet]) {
        const csv = XLSX.utils.sheet_to_txt(wb.Sheets[firstSheet], { FS: '\t', RS: '\n' });
        extractedText = csv.trim().slice(0, 50000);
      }
    }
    if (!extractedText) extractedText = '(Sin texto extraíble)';
    const wantsCotizacion = userMessage && /(nueva\s+)?cotizaci[oó]n|pon(er)?\s+(esto|lo|el\s+documento)/i.test(userMessage);
    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
    if (wantsCotizacion && apiKey && !String(apiKey).startsWith('crsr_')) {
      try {
        const clientes = await db.getAll('SELECT id, nombre FROM clientes ORDER BY nombre LIMIT 200', []);
        const clientesList = clientes.map(c => `id ${c.id}: ${c.nombre}`).join('\n');
        const prompt = `Del siguiente contenido de un documento (PDF, Excel o Word), extrae datos para una cotización. Responde ÚNICAMENTE un JSON válido, sin markdown, con estas claves: cliente_id (id del cliente que mejor coincida, o null), subtotal (número, 0 si no hay), tipo ("refacciones" o "mano_obra"). Usa esta lista de clientes para elegir cliente_id por nombre:\n${clientesList}\n\nContenido del documento:\n${extractedText.slice(0, 6000)}`;
        const apiUrl = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1/chat/completions';
        const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'Eres un asistente que extrae datos para cotizaciones. Responde solo JSON válido con las claves indicadas.' },
              { role: 'user', content: prompt },
            ],
            max_tokens: 200,
          }),
        });
        const data = await response.json();
        const rawReply = data.choices?.[0]?.message?.content || '{}';
        let cotizacion = {};
        try {
          const cleaned = rawReply.replace(/```json?\s*|\s*```/g, '').trim();
          cotizacion = JSON.parse(cleaned);
        } catch (_) {}
        const cliente_id = cotizacion.cliente_id != null ? parseInt(cotizacion.cliente_id, 10) : null;
        const subtotal = typeof cotizacion.subtotal === 'number' ? cotizacion.subtotal : (parseFloat(cotizacion.subtotal) || 0);
        return res.json({
          text: extractedText.slice(0, 3000),
          reply: 'Listo. Encontré datos en el documento. Abre el formulario de cotización para que revises y completes.',
          action: 'open_cotizacion',
          cotizacion: { cliente_id: isNaN(cliente_id) ? null : cliente_id, subtotal, tipo: cotizacion.tipo === 'mano_obra' ? 'mano_obra' : 'refacciones' },
        });
      } catch (_) { /* si falla IA, seguimos solo con texto */ }
    }
    const reply = extractedText.length > 800
      ? `Extraje el documento (${extractedText.length} caracteres). Puedes pedirme que lo pase a una nueva cotización o que resuma algo en concreto.`
      : `Contenido del documento:\n\n${extractedText}`;
    res.json({ text: extractedText.slice(0, 3000), reply });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// SPA: todas las rutas no-API sirven index.html (sin caché para que siempre cargue la última versión)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).end();
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  await db.init();
  app.listen(PORT, () => {
    console.log('Sistema de Cotización - En línea');
    console.log('Abre en el navegador: http://localhost:' + PORT);
    if (db.useTurso) console.log('Base de datos: Turso (nube)');
    else console.log('Base de datos: SQLite local (carpeta data/)');
  });
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
