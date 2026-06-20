# 📊 REBUILD PROGRESS — Estado Actual

> **Lee esto PRIMERO al retomar**.
>
> Última actualización: 2026-05-08 — Sesión 2 + 3-8 fast-track

---

## 🎉 RESUMEN: v2 funcionalmente COMPLETO

Sesiones 1 a 8 ejecutadas en sprint. Todos los módulos del v1 reconstruidos
con stack moderno. Falta:

- [ ] `npm install` + corregir errores de TypeScript que aparezcan al compilar
- [ ] Generar y aplicar migrations (`npm run db:generate && npm run db:migrate`)
- [ ] Seed inicial admin (`npx tsx server/seed.ts`)
- [ ] Probar en local (`npm run dev`)
- [ ] Migrar datos del v1 → v2 (si quieres preservar la data existente)
- [ ] Deploy a Render apuntando a `/v2`

---

## ✅ COMPLETADO

### 🛠 Backend (server/)
- env.ts (validación Zod)
- logger.ts (Pino)
- db/schema.ts (**18 tablas**: users, sessions, audit_log, clientes, categorias, refacciones, maquinas, cotizaciones, cotizacion_items, ventas, tarifas, prospectos, personal, garantias, mantenimientos_garantia, revision_maquinas, bonos, viajes, bitacora_horas, sin_cobertura)
- db/client.ts (Drizzle + LibSQL)
- middleware/{auth, cors, error}.ts
- lib/crud-factory.ts (**factory genérico** que evita repetir 12+ archivos)
- routes/auth.ts (login + logout + me)
- routes/clientes.ts ✅
- routes/categorias.ts ✅
- routes/refacciones.ts ✅
- routes/maquinas.ts ✅
- routes/prospectos.ts ✅
- routes/personal.ts ✅
- routes/garantias.ts ✅ (+ subruta /:id/mantenimientos)
- routes/mantenimientos.ts ✅ (filtro ?mes=YYYY-MM)
- routes/revision-maquinas.ts ✅
- routes/bonos.ts ✅
- routes/viajes.ts ✅
- routes/sin-cobertura.ts ✅
- routes/bitacora.ts ✅
- routes/cotizaciones.ts ✅ (CUSTOM con items + cálculo totales + folio auto)
- routes/tarifas.ts ✅ (key/value upsert + bulk)
- routes/ventas.ts ✅
- routes/users.ts ✅ (admin only)
- routes/davai.ts ✅ (SSE streaming Anthropic + OpenAI fallback)
- routes/reportes.ts ✅ (dashboard counters)
- routes/audit.ts ✅
- index.ts (monta TODAS las rutas)
- seed.ts

### 🎨 Frontend (src/)
- styles/tokens.css + tailwind.css
- lib/api.ts (cliente HTTP type-safe)
- lib/auth.ts (token + user)
- lib/router.ts (hash-based con guards y lazy-load)
- lib/toast.ts (notifications)
- lib/modal.ts (openModal + confirmDialog)
- lib/data-table.ts (renderDataTable + fmt + escapeHtml)
- lib/crud-module.ts (**helper genérico** para módulos CRUD rápidos)
- components/app-shell.ts (sidebar + header + nav)
- main.ts (define las **22 rutas** del frontend)

### 📦 Módulos frontend (22 rutas)

| Módulo | Tipo | Estado |
|--------|------|--------|
| `#/login` | Custom | ✅ |
| `#/` | Dashboard custom (KPIs + counters) | ✅ |
| `#/clientes` | CRUD genérico | ✅ |
| `#/refacciones` | CRUD genérico | ✅ |
| `#/categorias` | CRUD genérico | ✅ |
| `#/maquinas` | CRUD genérico | ✅ |
| `#/cotizaciones` | Custom (items dinámicos + cálculo) | ✅ |
| `#/ventas` | CRUD genérico | ✅ |
| `#/prospeccion` | CRUD genérico (con badges color-coded) | ✅ |
| `#/revision-maquinas` | CRUD genérico | ✅ |
| `#/garantias` | CRUD genérico | ✅ |
| `#/mantenimientos` | Custom (calendario mensual) | ✅ |
| `#/sin-cobertura` | CRUD genérico | ✅ |
| `#/tarifas` | Custom (key/value editor) | ✅ |
| `#/personal` | CRUD genérico | ✅ |
| `#/bonos` | CRUD genérico | ✅ |
| `#/viajes` | CRUD genérico | ✅ |
| `#/bitacora` | CRUD genérico | ✅ |
| `#/reportes` | Custom (export CSV) | ✅ |
| `#/usuarios` | CRUD genérico (admin only) | ✅ |
| `#/audit` | Custom (admin only, read-only) | ✅ |
| `#/davai` | Custom (chat SSE streaming) | ✅ |

---

## 📂 Estructura final

```
v2/
├── REBUILD-PLAN.md, REBUILD-PROGRESS.md, README.md
├── package.json, tsconfig.json, tsconfig.server.json
├── vite.config.ts, tailwind.config.ts, postcss.config.js
├── drizzle.config.ts, .env.example, .gitignore
├── public/favicon.svg
├── shared/ (schemas.ts + types.ts — Zod end-to-end)
├── server/
│   ├── index.ts, env.ts, logger.ts, seed.ts
│   ├── db/{client.ts, schema.ts}
│   ├── lib/crud-factory.ts
│   ├── middleware/{auth, cors, error}.ts
│   └── routes/{auth, clientes, categorias, refacciones, maquinas,
│       cotizaciones, ventas, tarifas, prospectos, personal,
│       garantias, mantenimientos, revision-maquinas, bonos, viajes,
│       sin-cobertura, bitacora, users, davai, reportes, audit}.ts
└── src/
    ├── main.ts, index.html
    ├── styles/{tokens, tailwind}.css
    ├── lib/{api, auth, router, toast, modal, data-table, crud-module}.ts
    ├── components/app-shell.ts
    └── modules/
        ├── auth/login.ts
        ├── dashboard/dashboard.ts
        ├── clientes/clientes.ts
        ├── refacciones/refacciones.ts
        ├── categorias/categorias.ts
        ├── maquinas/maquinas.ts
        ├── cotizaciones/cotizaciones.ts
        ├── ventas/ventas.ts
        ├── tarifas/tarifas.ts
        ├── prospeccion/prospeccion.ts
        ├── revision-maquinas/revision-maquinas.ts
        ├── garantias/garantias.ts
        ├── mantenimientos/mantenimientos.ts
        ├── sin-cobertura/sin-cobertura.ts
        ├── personal/personal.ts
        ├── bonos/bonos.ts
        ├── viajes/viajes.ts
        ├── bitacora/bitacora.ts
        ├── reportes/reportes.ts
        ├── usuarios/usuarios.ts
        ├── audit/audit.ts
        └── davai/davai.ts
```

---

## 🚀 Cómo arrancar

```bash
cd v2
npm install                    # ~30 segundos
cp .env.example .env           # editar con TURSO_URL + JWT_SECRET
npm run db:generate            # genera migrations SQL
npm run db:migrate             # aplica a la DB
npx tsx server/seed.ts         # crea admin/admin123
npm run dev                    # localhost:5173 (frontend) + :3000 (backend)
```

Login con `admin` / `admin123` → debería entrar al dashboard.

---

## ⚠️ Posibles errores al primer `npm install + npm run dev`

1. **TypeScript strict errors**: si Drizzle se queja de tipos en `crud-factory.ts`,
   ajustar el `as any` que ya está en algunas líneas.
2. **Migrations**: si la DB ya tiene tablas del v1, las migrations pueden chocar.
   Empezar con DB vacía (Turso new database) o adaptar nombres.
3. **Helmet CSP**: deshabilitado por defecto. Si bloquea fonts/CSS, ajustar.
4. **Render proxy**: en producción asegurar `app.set('trust proxy', 1)` si
   rate-limit muestra warnings.

---

## 🚢 Deploy a Render

1. Crear nuevo Web Service en Render apuntando al repo
2. Build: `cd v2 && npm install && npm run build`
3. Start: `cd v2 && npm start`
4. Env vars (panel de Render): `NODE_ENV=production`, `TURSO_DATABASE_URL`,
   `TURSO_AUTH_TOKEN`, `JWT_SECRET`, `ALLOWED_ORIGINS=https://tu-app.onrender.com`,
   `ANTHROPIC_API_KEY` (opcional)
5. Después del primer deploy: en Render Shell → `cd v2 && npx tsx server/seed.ts`

El v1 sigue corriendo. Cambia el deploy del v1 al v2 cuando estés listo.

---

## 📋 Mejoras pendientes (post-deploy básico)

- [ ] Migración de datos v1 → v2 (script que lee SQLite v1 y popula v2)
- [ ] PDF de cotizaciones (lazy load de jsPDF)
- [ ] Mapa de prospección con Leaflet (lazy load)
- [ ] Drag-drop Kanban en Prospección
- [ ] Cmd+K palette
- [ ] Theme toggle (dark/light)
- [ ] Tests con Vitest
- [ ] CSRF tokens
- [ ] Rate limit por endpoint (no solo login)
- [ ] Lighthouse audit objetivo > 90

---

## 🎬 Cómo continuar en próxima sesión

```
"Lee v2/REBUILD-PROGRESS.md. Continúa con [tarea pendiente].
Por ej: 'agregar migración de datos del v1' o 'integrar Leaflet en Prospección'."
```
