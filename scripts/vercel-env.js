#!/usr/bin/env node
/**
 * Genera valores listos para pegar en Vercel → Settings → Environment Variables.
 * Turso: créalo en https://app.turso.tech (gratis) → Database → Connect (URL + token).
 */
'use strict';
const crypto = require('crypto');

const authSecret = crypto.randomBytes(32).toString('hex');

console.log(`
================================================================================
COPIA ESTO EN VERCEL → Tu proyecto → Settings → Environment Variables → Production
( marca "Sensitive" en secretos )
================================================================================

AUTH_SECRET
${authSecret}

TURSO_DATABASE_URL
(pega aquí la URL tipo libsql://nombre-xxxxx.turso.io de Turso → Connect)

TURSO_AUTH_TOKEN
(pega aquí el token de Turso → Connect)

================================================================================
Opcional (recomendado si usas login en la app): ya pusiste AUTH_SECRET arriba.
Opcional (tipo de cambio): BANXICO_TOKEN y/o EXCHANGE_RATE_API_KEY — ver .env.example
================================================================================
Turso (2 min): https://app.turso.tech → Create database → Connect → copia URL y token.
Después: Deployments → Redeploy el último deploy.
================================================================================
`);
