/**
 * Smoke test para Vercel/producción: valida endpoints críticos sin navegador.
 *
 * Uso:
 *   node scripts/smoke-vercel.cjs https://sistema-cotizacion-web.vercel.app
 *
 * Nota: si AUTH está activado, algunos endpoints pueden requerir token.
 */
const base = (process.argv[2] || '').trim().replace(/\/+$/, '');
if (!base) {
  console.error('Uso: node scripts/smoke-vercel.cjs <BASE_URL>');
  process.exit(2);
}

async function getText(path) {
  const url = base + path;
  const r = await fetch(url, { headers: { 'Accept': 'application/json,text/plain,*/*' } });
  const t = await r.text();
  return { url, status: r.status, ok: r.ok, text: t };
}

function tryJson(t) {
  try { return JSON.parse(t); } catch (_) { return null; }
}

function pass(name) {
  console.log(`PASS  ${name}`);
}
function fail(name, details) {
  console.log(`FAIL  ${name}${details ? ' — ' + details : ''}`);
}

async function main() {
  const checks = [];

  // 1) health
  checks.push((async () => {
    const r = await getText('/health');
    if (r.ok && (r.text || '').trim().toLowerCase() === 'ok') return pass('/health');
    fail('/health', `status=${r.status} body=${(r.text || '').slice(0, 200)}`);
  })());

  // 2) ping build
  checks.push((async () => {
    const r = await getText('/api/ping');
    const j = tryJson(r.text);
    if (r.ok && j && j.ok) return pass('/api/ping');
    fail('/api/ping', `status=${r.status} body=${(r.text || '').slice(0, 200)}`);
  })());

  // 3) config
  checks.push((async () => {
    const r = await getText('/api/config');
    const j = tryJson(r.text);
    if (r.ok && j && typeof j === 'object') return pass('/api/config');
    fail('/api/config', `status=${r.status} body=${(r.text || '').slice(0, 200)}`);
  })());

  // 4) storage-health (debe responder aun si no hay Turso)
  checks.push((async () => {
    const r = await getText('/api/storage-health');
    const j = tryJson(r.text);
    if (r.ok && j && typeof j === 'object' && j.mode) return pass('/api/storage-health');
    fail('/api/storage-health', `status=${r.status} body=${(r.text || '').slice(0, 200)}`);
  })());

  // 5) endpoint público de cotizaciones (puede 401/403 si auth y rol)
  checks.push((async () => {
    const r = await getText('/api/cotizaciones');
    if (r.ok) return pass('/api/cotizaciones (lista)');
    // En auth estricto, esto puede bloquear; lo tratamos como WARN en vez de FAIL duro.
    if (r.status === 401 || r.status === 403) return pass('/api/cotizaciones (protegido por rol/auth)');
    fail('/api/cotizaciones', `status=${r.status} body=${(r.text || '').slice(0, 200)}`);
  })());

  await Promise.all(checks);
  console.log('Smoke test terminado.');
}

main().catch((e) => {
  console.error('Error:', e && e.stack ? e.stack : String(e));
  process.exit(1);
});

