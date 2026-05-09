# Sistema Cotización v3

> Stack mínimo, sin frameworks complicados, sin Service Worker, sin antipatrones.
> **Express + better-sqlite3 + HTML/CSS/JS vanilla**.

## ¿Qué tiene?

- ✅ Login + JWT + roles (admin / usuario / consulta)
- ✅ Dashboard con KPIs
- ✅ CRUD de Clientes
- ✅ CRUD de Refacciones (con stock, precios USD/MXN)
- ✅ CRUD de Máquinas
- ✅ Cotizaciones completas (items dinámicos, cálculo automático de IVA, folio auto COT-2026-0001)
- ✅ Gestión de Usuarios (admin)
- ✅ DB SQLite local (`data/app.db`)

## Cómo correrlo

```bash
cd v3
npm install
node seed.js          # crea admin/admin123
npm start             # http://localhost:3000
```

Login: **`admin` / `admin123`**

## Variables de entorno (opcionales)

Crea un archivo `.env` o exporta antes de `npm start`:

```bash
PORT=3000
JWT_SECRET=$(openssl rand -hex 32)   # ¡cambia esto en producción!
NODE_ENV=production
ADMIN_USER=admin
ADMIN_PASS=mi_password_seguro
```

## Estructura

```
v3/
├── server.js          ← Express + todas las rutas API (un solo archivo)
├── db.js              ← SQLite + schema (una vez al cargar crea las tablas)
├── seed.js            ← Crea admin inicial
├── package.json       ← 5 dependencias totales
├── data/app.db        ← DB SQLite (se crea al arrancar)
└── public/
    ├── index.html     ← UNO solo
    ├── app.css        ← UNO solo
    └── app.js         ← UNO solo (todas las pantallas)
```

## Por qué este stack y no otro

- **Sin TypeScript**: menos cosas que pueden romperse, código directo
- **Sin Vite/bundler**: archivos sirvieron desde Express, sin build step
- **Sin Service Worker**: era el #1 culpable de freezes en v1
- **Sin Tailwind/React/Lit**: HTML+CSS+JS plano funciona perfecto y carga rápido
- **better-sqlite3 sincrono**: queries simples, sin async hell, sin ORM
- **JWT estándar**: no inventamos cosas raras
- **Un solo archivo por capa**: imposible perderse

## Deploy a Render

1. Crear Web Service apuntando al repo
2. Build: `cd v3 && npm install`
3. Start: `cd v3 && npm start`
4. Env vars en Render: `JWT_SECRET`, `NODE_ENV=production`
5. Después del primer deploy, abrir Render Shell y correr: `cd v3 && node seed.js`

⚠️ Render free hace cold start ~30s después de inactividad. Es normal.

## Agregar más módulos (Ventas, Garantías, Prospectos, etc.)

El v3 está hecho para extenderse fácilmente:

1. **Backend**: agrega tabla en `db.js`, llama `makeCrud({...})` en `server.js` para tablas simples.
2. **Frontend**: agrega ruta en `ROUTES` (en `app.js`) + config en `CRUD_CONFIGS` para tablas simples,
   o crea una función `renderXxxx()` para módulos custom (como `renderCotizaciones`).

Cada módulo nuevo son ~20 líneas en cada lado.
