/**
 * Sistema de Cotización - API y sitio web. Ver todo en línea.
 * Base de datos: Turso (nube) o SQLite local. 100% gratuito.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
// En la nube (Render, etc.) usan process.env.PORT. Local: 3456 para evitar conflicto con otros servicios en 3000
const PORT = process.env.PORT || 3456;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- API Catálogos ---
app.get('/api/clientes', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    let sql = 'SELECT * FROM clientes ORDER BY nombre';
    let params = [];
    if (q) {
      sql = 'SELECT * FROM clientes WHERE nombre LIKE ? OR codigo LIKE ? OR rfc LIKE ? ORDER BY nombre LIMIT 100';
      const p = `%${q}%`;
      params = [p, p, p];
    }
    const rows = await db.getAll(sql, params);
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
    const { cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, tecnico_responsable, estatus } = req.body || {};
    if (!cliente_id) return res.status(400).json({ error: 'cliente_id requerido' });
    if (!descripcion || !descripcion.trim()) return res.status(400).json({ error: 'descripcion requerida' });
    const folio = generarFolioIncidente();
    await db.runQuery(
      `INSERT INTO incidentes (folio, cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, tecnico_responsable, estatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [folio, cliente_id, maquina_id || null, descripcion.trim(), prioridad || 'media', fecha_reporte || new Date().toISOString().slice(0, 10), tecnico_responsable || null, estatus || 'abierto']
    );
    const r = await db.getOne('SELECT i.*, c.nombre as cliente_nombre, m.nombre as maquina_nombre FROM incidentes i JOIN clientes c ON c.id = i.cliente_id LEFT JOIN maquinas m ON m.id = i.maquina_id ORDER BY i.id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/incidentes/:id', async (req, res) => {
  try {
    const { cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, tecnico_responsable, estatus } = req.body || {};
    await db.runQuery(
      `UPDATE incidentes SET cliente_id=?, maquina_id=?, descripcion=?, prioridad=?, fecha_reporte=?, tecnico_responsable=?, estatus=? WHERE id=?`,
      [cliente_id || null, maquina_id || null, descripcion || '', prioridad || 'media', fecha_reporte || null, tecnico_responsable || null, estatus || 'abierto', req.params.id]
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

// --- Cargar datos demo (desde seed-demo.json) ---
function norm(s) {
  if (!s || typeof s !== 'string') return '';
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
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
        `INSERT INTO incidentes (folio, cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, tecnico_responsable, estatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [inc.folio || null, clienteId, maquinaId, inc.descripcion || '-', inc.prioridad || 'media', inc.fecha_reporte || new Date().toISOString().slice(0, 10), inc.tecnico_responsable || null, inc.estatus || 'abierto']
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
        `INSERT INTO incidentes (folio, cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, tecnico_responsable, estatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [inc.folio || null, clienteId, maquinaId, inc.descripcion || '-', inc.prioridad || 'media', inc.fecha_reporte || new Date().toISOString().slice(0, 10), inc.tecnico_responsable || null, inc.estatus || 'abierto']
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

// --- Asistente IA (OpenAI-compatible). Configura OPENAI_API_KEY en Render → Environment.
app.post('/api/ai/chat', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'API de IA no configurada',
      hint: 'Añade OPENAI_API_KEY en Render → tu servicio → Environment (o AI_API_KEY). Ver CONFIG_IA.md.',
    });
  }
  try {
    const { message } = req.body || {};
    const text = (message || '').trim();
    if (!text) return res.status(400).json({ error: 'Falta el mensaje (message)' });

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
        messages: [{ role: 'user', content: text }],
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
