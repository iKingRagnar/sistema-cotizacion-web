/**
 * ============================================================================
 * MIGRACIÓN DE DATOS: Turso (SQLite) → Supabase (Postgres)
 * ----------------------------------------------------------------------------
 * Lee TODAS las tablas de Turso y las inserta en Supabase respetando el orden
 * de las FK. Al final, ajusta los sequences de BIGSERIAL para que el próximo
 * INSERT no choque con IDs ya migrados.
 *
 * ============================================================================
 * USO
 * ============================================================================
 *  1. Instalar dependencia faltante:
 *       npm install pg
 *
 *  2. Crear archivo .env.migration en la raíz del proyecto con:
 *       TURSO_DATABASE_URL=libsql://...
 *       TURSO_AUTH_TOKEN=eyJh...
 *       SUPABASE_POSTGRES_URL=postgresql://postgres:TU_PASSWORD@db.uupylfzbnovpckjiyrfn.supabase.co:5432/postgres
 *
 *     Las dos primeras se sacan de Render → Environment Variables del servicio.
 *     La tercera es la connection string de Supabase con la password REAL.
 *
 *  3. Ejecutar:
 *       node --env-file=.env.migration migrations/migrate-turso-to-supabase.js
 *
 *  4. Esperar el reporte final con totales por tabla.
 *
 * ============================================================================
 * SEGURIDAD
 * ============================================================================
 *  - El script SOLO inserta. Nunca borra ni hace UPDATE.
 *  - Si una tabla ya tiene datos en Supabase, salta esa tabla (para evitar
 *    duplicados al re-ejecutar). Pásale --force para sobreescribir.
 *  - Usa transacciones por tabla.
 *
 * ============================================================================
 */

const { createClient } = require('@libsql/client');
const { Client } = require('pg');

const FORCE = process.argv.includes('--force');

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
const PG_URL = process.env.SUPABASE_POSTGRES_URL;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('[ERROR] Falta TURSO_DATABASE_URL o TURSO_AUTH_TOKEN');
  process.exit(1);
}
if (!PG_URL) {
  console.error('[ERROR] Falta SUPABASE_POSTGRES_URL');
  process.exit(1);
}

const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
const pg = new Client({
  connectionString: PG_URL,
  ssl: { rejectUnauthorized: false }, // Supabase requiere SSL
});

/* Orden estricto respetando FK (padres antes que hijos) */
const TABLES_IN_ORDER = [
  'clientes',
  'refacciones',
  'tecnicos',
  'maquinas',
  'app_users',
  'cotizaciones',
  'cotizacion_lineas',
  'incidentes',
  'bitacoras',
  'mantenimientos',
  'reportes',
  'garantias',
  'mantenimientos_garantia',
  'bonos',
  'viajes',
  'movimientos_stock',
  'revision_maquinas',
  'tarifas',
  'prospectos',
  'catalogos',
  'catalogo_categorias',
  'catalogo_subcategorias',
  'embarques',
  'bonos_movimientos',
  'config_correos_reportes',
  'cron_jobs_log',
  'audit_log',
  'app_users_deleted',
  'attachments',
  'webhooks',
];

/* Tablas SIN columna 'id' (PK distinta o sin sequence) */
const TABLES_WITHOUT_ID = new Set(['tarifas', 'cron_jobs_log']);

const BATCH_SIZE = 200;

async function tableExistsInTurso(name) {
  try {
    const r = await turso.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`);
    return r.rows && r.rows.length > 0;
  } catch (_) { return false; }
}

async function countInPg(name) {
  try {
    const r = await pg.query(`SELECT COUNT(*) AS n FROM "${name}"`);
    return Number(r.rows[0].n) || 0;
  } catch (_) { return 0; }
}

async function getColumns(name) {
  // Lee columnas de Turso (orden importa)
  const r = await turso.execute(`PRAGMA table_info(${name})`);
  return r.rows.map((row) => row.name);
}

async function migrateTable(name) {
  console.log(`\n━━━━━━━━━━ Tabla: ${name} ━━━━━━━━━━`);

  if (!(await tableExistsInTurso(name))) {
    console.log('  [skip] No existe en Turso.');
    return { migrated: 0, skipped: true };
  }

  const existingCount = await countInPg(name);
  if (existingCount > 0 && !FORCE) {
    console.log(`  [skip] Ya tiene ${existingCount} filas en Supabase. Usa --force para sobreescribir.`);
    return { migrated: 0, skipped: true, alreadyHas: existingCount };
  }

  if (existingCount > 0 && FORCE) {
    console.log(`  [force] Limpiando ${existingCount} filas existentes en Supabase…`);
    await pg.query(`DELETE FROM "${name}"`);
  }

  const cols = await getColumns(name);
  if (!cols.length) {
    console.log('  [skip] Sin columnas detectadas.');
    return { migrated: 0, skipped: true };
  }

  // Lee TODAS las filas de Turso
  const r = await turso.execute(`SELECT * FROM ${name}`);
  const rows = r.rows || [];
  const total = rows.length;

  if (total === 0) {
    console.log('  [ok] 0 filas.');
    return { migrated: 0 };
  }

  console.log(`  → ${total} filas a migrar (batch=${BATCH_SIZE})…`);

  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    // Construir VALUES placeholders ($1, $2, ...) para cada fila
    const placeholders = [];
    const values = [];
    let p = 1;
    for (const row of batch) {
      const rowPlaceholders = cols.map(() => `$${p++}`);
      placeholders.push(`(${rowPlaceholders.join(',')})`);
      for (const c of cols) {
        let v = row[c];
        // libsql devuelve BigInt para INTEGER grandes, convertir a Number/String
        if (typeof v === 'bigint') v = Number(v);
        values.push(v);
      }
    }
    const colList = cols.map((c) => `"${c}"`).join(',');
    const sql = `INSERT INTO "${name}" (${colList}) VALUES ${placeholders.join(',')}`;

    try {
      await pg.query(sql, values);
      inserted += batch.length;
      process.stdout.write(`  ✓ ${inserted}/${total}\r`);
    } catch (e) {
      console.error(`\n  [batch-error] desde fila ${i}: ${e.message}`);
      // Si falla todo el batch, intentar fila por fila para identificar la mala
      for (const row of batch) {
        const rowVals = cols.map((c) => {
          let v = row[c];
          if (typeof v === 'bigint') v = Number(v);
          return v;
        });
        const ph = cols.map((_, idx) => `$${idx + 1}`).join(',');
        const singleSql = `INSERT INTO "${name}" (${colList}) VALUES (${ph})`;
        try {
          await pg.query(singleSql, rowVals);
          inserted++;
        } catch (e2) {
          failed++;
          console.error(`  [row-error] id=${row.id || '?'}: ${e2.message}`);
        }
      }
    }
  }

  console.log(`\n  ✓ Migradas: ${inserted}/${total}` + (failed > 0 ? ` · Fallidas: ${failed}` : ''));
  return { migrated: inserted, failed };
}

async function fixSequence(table) {
  if (TABLES_WITHOUT_ID.has(table)) return;
  try {
    // Postgres: alinear la sequence al MAX(id) actual + 1
    const r = await pg.query(`SELECT COALESCE(MAX(id), 0) AS maxid FROM "${table}"`);
    const maxId = Number(r.rows[0].maxid) || 0;
    if (maxId > 0) {
      const seqName = `${table}_id_seq`;
      await pg.query(`SELECT setval('"${seqName}"', $1, true)`, [maxId]);
      console.log(`  ↻ sequence ${seqName} → ${maxId}`);
    }
  } catch (e) {
    console.warn(`  [warn] no se pudo ajustar sequence de ${table}: ${e.message}`);
  }
}

async function main() {
  console.log('====================================');
  console.log('  MIGRACIÓN TURSO → SUPABASE');
  console.log('====================================');
  console.log('  Modo:', FORCE ? 'FORCE (sobreescribe)' : 'SAFE (skip si tiene datos)');
  console.log('  Tablas:', TABLES_IN_ORDER.length);

  await pg.connect();
  console.log('  ✓ Conectado a Supabase');

  const report = {};
  for (const t of TABLES_IN_ORDER) {
    try {
      report[t] = await migrateTable(t);
    } catch (e) {
      console.error(`  [fatal] tabla ${t}: ${e.message}`);
      report[t] = { error: e.message };
    }
  }

  console.log('\n━━━━━━━━━━ Ajustando sequences ━━━━━━━━━━');
  for (const t of TABLES_IN_ORDER) {
    await fixSequence(t);
  }

  console.log('\n══════════════ RESUMEN ══════════════');
  let totalMigrated = 0;
  for (const t of TABLES_IN_ORDER) {
    const r = report[t] || {};
    const status = r.error
      ? `❌ error: ${r.error}`
      : r.skipped
        ? `⊝ skip${r.alreadyHas ? ` (ya tenía ${r.alreadyHas})` : ''}`
        : `✓ ${r.migrated}` + (r.failed ? ` (${r.failed} fallidas)` : '');
    console.log(`  ${t.padEnd(28)} ${status}`);
    totalMigrated += Number(r.migrated) || 0;
  }
  console.log('  ─────────────────────────────────');
  console.log(`  TOTAL filas migradas: ${totalMigrated}`);
  console.log('═════════════════════════════════════');

  await pg.end();
  await turso.close();
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
