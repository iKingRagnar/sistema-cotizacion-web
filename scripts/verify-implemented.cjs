/**
 * Verificación de integración (sin navegador):
 * - vuelta + TC, recalc-lineas, FIFO al aplicar, reporte venta
 * - liquidación mensual (shape porTecnico + totales)
 * - rol usuario (AUTH_ENABLED=1): POST bonos/viajes permitido; rol consulta: POST bonos denegado
 *
 * Uso: node scripts/verify-implemented.cjs
 * Requiere Node 18+ (fetch). SQLite temporal.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dbPath = path.join(root, '_verify-implemented.sqlite');
const dbAuthPath = path.join(root, '_verify-auth-staff.sqlite');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function killProc(child) {
  if (!child) return;
  try {
    child.kill('SIGTERM');
  } catch (_) {}
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch (_) {}
  }
}

function startServer(port, dbFile, extraEnv) {
  try {
    fs.unlinkSync(dbFile);
  } catch (_) {}
  const env = {
    ...process.env,
    PORT: String(port),
    SQLITE_DB_PATH: dbFile,
    ...extraEnv,
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stderr.on('data', (d) => {
    bootLog += d.toString();
  });
  child.stdout.on('data', (d) => {
    bootLog += d.toString();
  });
  return { child, bootLog: () => bootLog };
}

async function waitHealth(port, getLog) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) return true;
    } catch (_) {}
    await sleep(250);
  }
  console.error(getLog().slice(-4000));
  throw new Error(`Servidor no respondió en /health (puerto ${port})`);
}

async function httpPort(port, method, urlPath, body, token) {
  const opts = { method };
  const headers = {};
  if (body != null) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (Object.keys(headers).length) opts.headers = headers;
  const r = await fetch(`http://127.0.0.1:${port}${urlPath}`, opts);
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    j = t;
  }
  if (!r.ok) throw new Error(`${method} ${urlPath} -> ${r.status}: ${t}`);
  return j;
}

async function httpExpectStatus(port, method, urlPath, body, token, expectStatus) {
  const opts = { method };
  const headers = {};
  if (body != null) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (Object.keys(headers).length) opts.headers = headers;
  const r = await fetch(`http://127.0.0.1:${port}${urlPath}`, opts);
  const t = await r.text();
  if (r.status !== expectStatus) {
    throw new Error(`esperado HTTP ${expectStatus}, fue ${r.status}: ${t}`);
  }
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

(async () => {
  const failures = [];
  let child = null;
  let child2 = null;

  try {
    // ---------- Fase 1: sin auth ----------
    const s1 = startServer(3765, dbPath, { AUTH_ENABLED: '0' });
    child = s1.child;
    await waitHealth(3765, s1.bootLog);
    const http = (method, urlPath, body) => httpPort(3765, method, urlPath, body, null);

    const c = await http('POST', '/api/clientes', { nombre: 'Cliente Verif', codigo: 'CV-V-1' });
    const cid = c.id;

    const cot = await http('POST', '/api/cotizaciones', {
      cliente_id: cid,
      tipo: 'refacciones',
      fecha: '2026-04-10',
      moneda: 'MXN',
      tipo_cambio: 18,
      maquinas_ids: [],
      descuento_pct: 0,
    });
    const cotId = cot.id;

    await http('POST', `/api/cotizaciones/${cotId}/lineas`, {
      tipo_linea: 'vuelta',
      cantidad: 1,
      precio_unitario: 0,
      es_ida: true,
      horas_trabajo: 2,
      horas_traslado: 1,
    });

    let lineas = await http('GET', `/api/cotizaciones/${cotId}/lineas`);
    let v = lineas.find((l) => l.tipo_linea === 'vuelta');
    const baseMxn = 650 + 2 * 450 + 1 * 450;
    if (!v || Math.abs(Number(v.precio_unitario) - baseMxn) > 0.05) {
      failures.push(`vuelta MXN: esperado p.u.≈${baseMxn}, fue ${v && v.precio_unitario}`);
    }

    await http('PUT', `/api/cotizaciones/${cotId}`, {
      cliente_id: cid,
      tipo: 'refacciones',
      fecha: '2026-04-10',
      moneda: 'USD',
      tipo_cambio: 20,
      maquinas_ids: [],
    });
    lineas = await http('GET', `/api/cotizaciones/${cotId}/lineas`);
    v = lineas.find((l) => l.tipo_linea === 'vuelta');
    const expectUsd = Math.round((baseMxn / 20) * 100) / 100;
    if (!v || Math.abs(Number(v.precio_unitario) - expectUsd) > 0.03) {
      failures.push(`vuelta USD tras PUT: esperado≈${expectUsd}, fue ${v && v.precio_unitario}`);
    }

    await http('POST', `/api/cotizaciones/${cotId}/recalc-lineas`, {});
    lineas = await http('GET', `/api/cotizaciones/${cotId}/lineas`);
    v = lineas.find((l) => l.tipo_linea === 'vuelta');
    if (!v || Math.abs(Number(v.precio_unitario) - expectUsd) > 0.03) {
      failures.push(`recalc-lineas: esperado≈${expectUsd}, fue ${v && v.precio_unitario}`);
    }

    const cotFull = await http('GET', `/api/cotizaciones/${cotId}`);
    if (!cotFull.lineas || !Array.isArray(cotFull.lineas)) {
      failures.push('GET cotización: falta array lineas (PDF/API)');
    } else {
      const vl = cotFull.lineas.find((l) => l.tipo_linea === 'vuelta');
      if (vl && !String(vl.descripcion || '').trim()) {
        const okDesc = Number(vl.es_ida) === 1 && (Number(vl.horas_trabajo) || 0) === 2;
        if (!okDesc) failures.push('línea vuelta: flags ida/horas inesperados para PDF');
      }
    }

    const ref = await http('POST', '/api/refacciones', {
      codigo: 'RF-VERIFY-1',
      descripcion: 'Pieza test FIFO',
      stock: 0,
      precio_unitario: 100,
      precio_usd: 5,
    });
    await http('POST', `/api/refacciones/${ref.id}/ajuste-stock`, {
      tipo: 'entrada',
      cantidad: 3,
      costo_unitario: 10,
      referencia: 'capa-a',
    });
    await http('POST', `/api/refacciones/${ref.id}/ajuste-stock`, {
      tipo: 'entrada',
      cantidad: 2,
      costo_unitario: 20,
      referencia: 'capa-b',
    });

    const cot2 = await http('POST', '/api/cotizaciones', {
      cliente_id: cid,
      tipo: 'refacciones',
      fecha: '2026-04-10',
      moneda: 'MXN',
      tipo_cambio: 18,
      maquinas_ids: [],
    });
    await http('POST', `/api/cotizaciones/${cot2.id}/lineas`, {
      tipo_linea: 'refaccion',
      refaccion_id: ref.id,
      cantidad: 4,
      precio_unitario: 0,
    });
    await http('POST', `/api/cotizaciones/${cot2.id}/aplicar`, {});

    const movs = await http('GET', `/api/refacciones/${ref.id}/movimientos`);
    const salidasCot = (movs || []).filter((m) => m.tipo === 'salida' && String(m.referencia || '').includes('Cot:'));
    if (salidasCot.length < 2) {
      failures.push(`FIFO: esperaba ≥2 filas de salida por cotización, hay ${salidasCot.length}`);
    }
    const refUp = await http('GET', `/api/refacciones/${ref.id}`);
    if (Math.abs(Number(refUp.stock) - 1) > 0.01) {
      failures.push(`stock tras aplicar 4 sobre 5: esperado 1, fue ${refUp.stock}`);
    }

    const rep = await http('POST', '/api/reportes', {
      cliente_id: cid,
      tipo_reporte: 'venta',
      subtipo: 'instalacion',
      descripcion: 'verif',
      fecha: '2026-04-10',
      estatus: 'abierto',
    });
    if (rep.tipo_reporte !== 'venta' || String(rep.subtipo) !== 'instalacion') {
      failures.push(`reporte: tipo/subtipo inesperado ${JSON.stringify({ tipo_reporte: rep.tipo_reporte, subtipo: rep.subtipo })}`);
    }

    const MES_LIQ = '2026-08';
    const TEC = 'Técnico Liq Verif';
    const vj = await http('POST', '/api/viajes', {
      tecnico: TEC,
      cliente_id: cid,
      razon_social: 'Cliente Verif',
      fecha_inicio: `${MES_LIQ}-05`,
      fecha_fin: `${MES_LIQ}-07`,
      descripcion: 'verif liq',
    });
    if (Number(vj.dias) !== 3) {
      failures.push(`viaje días: esperado 3, fue ${vj.dias}`);
    }
    if (Math.abs(Number(vj.monto_viaticos) - 3000) > 0.01) {
      failures.push(`viaje viáticos: esperado 3000, fue ${vj.monto_viaticos}`);
    }

    const bo = await http('POST', '/api/bonos', {
      tecnico: TEC,
      tipo_capacitacion: 'Operación básica',
      fecha: `${MES_LIQ}-12`,
      monto_bono: 250,
      dias: 1,
    });

    const liq = await http('GET', `/api/liquidacion-mensual?mes=${encodeURIComponent(MES_LIQ)}`);
    if (!liq || liq.mes !== MES_LIQ) {
      failures.push(`liquidación: mes en respuesta inesperado ${JSON.stringify(liq && liq.mes)}`);
    }
    if (!liq.porTecnico || typeof liq.porTecnico !== 'object') {
      failures.push('liquidación: falta objeto porTecnico');
    } else {
      const block = liq.porTecnico[TEC];
      if (!block) {
        failures.push(`liquidación: no aparece técnico "${TEC}"`);
      } else {
        if (Math.abs(Number(block.total_viaticos) - 3000) > 0.01) {
          failures.push(`liquidación total_viaticos: esperado 3000, fue ${block.total_viaticos}`);
        }
        if (Math.abs(Number(block.total_bonos) - 250) > 0.01) {
          failures.push(`liquidación total_bonos: esperado 250, fue ${block.total_bonos}`);
        }
        const sumDias = (block.viajes || []).reduce((s, x) => s + (Number(x.dias) || 0), 0);
        if (sumDias !== 3) {
          failures.push(`liquidación suma días viajes: esperado 3, fue ${sumDias}`);
        }
      }
    }

    await http('PUT', `/api/bonos/${bo.id}`, {
      reporte_id: bo.reporte_id,
      tecnico: TEC,
      tipo_capacitacion: 'Operación básica',
      fecha: `${MES_LIQ}-12`,
      monto_bono: 275,
      dias: 1,
      pagado: 0,
      notas: null,
    });

    killProc(child);
    child = null;
    await sleep(400);
    try {
      fs.unlinkSync(dbPath);
    } catch (_) {}

    // ---------- Fase 2: auth + staff (bonos/viajes) ----------
    const s2 = startServer(3766, dbAuthPath, {
      AUTH_ENABLED: '1',
      AUTH_SECRET: 'verify_hmac_secret_key_must_be_long_enough_32chars',
      AUTH_SEED_DEMO_USERS: '1',
      USUARIO1_INITIAL_PASSWORD: 'VerifyUsr1_',
    });
    child2 = s2.child;
    await waitHealth(3766, s2.bootLog);

    const loginU1 = await httpPort(3766, 'POST', '/api/auth/login', {
      username: 'usuario1',
      password: 'VerifyUsr1_',
    });
    const tokU1 = loginU1.token;
    if (!tokU1) failures.push('login usuario1: sin token');

    await httpPort(
      3766,
      'POST',
      '/api/bonos',
      { tecnico: 'Staff Tech', tipo_capacitacion: 'Otra', fecha: '2026-09-01', monto_bono: 99, dias: 1 },
      tokU1
    );
    const vStaff = await httpPort(
      3766,
      'POST',
      '/api/viajes',
      {
        tecnico: 'Staff Tech',
        razon_social: 'ACME',
        fecha_inicio: '2026-09-10',
        fecha_fin: '2026-09-11',
      },
      tokU1
    );
    if (Number(vStaff.dias) !== 2) {
      failures.push(`auth staff viaje: esperaba 2 días, fue ${vStaff.dias}`);
    }

    const loginConsulta = await httpPort(3766, 'POST', '/api/auth/login', {
      username: 'consulta',
      password: 'Consulta2025',
    });
    await httpExpectStatus(
      3766,
      'POST',
      '/api/bonos',
      { tecnico: 'No', tipo_capacitacion: 'Otra', fecha: '2026-09-02', monto_bono: 1, dias: 1 },
      loginConsulta.token,
      403
    );
  } catch (e) {
    failures.push(String(e.message || e));
  } finally {
    killProc(child);
    killProc(child2);
    await sleep(400);
    try {
      fs.unlinkSync(dbPath);
    } catch (_) {}
    try {
      fs.unlinkSync(dbAuthPath);
    } catch (_) {}
  }

  const ok = failures.length === 0;
  if (ok) {
    console.log(
      'OK: API — vuelta/TC/recalc/FIFO/reporte; liquidación mensual; GET cotización+lineas; auth staff POST bonos/viajes; consulta sin POST.'
    );
    process.exit(0);
  }
  console.error('FALLOS:\n', failures.join('\n'));
  process.exit(1);
})();
