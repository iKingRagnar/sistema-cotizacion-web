# Sistema Cotización Web — v2

> **Rebuild from zero** del Sistema de Cotización Web. Stack moderno, sin freezes, sin cache hell.
>
> El v1 sigue corriendo en `/public` y deployed en Render. El v2 vive aquí en paralelo
> hasta que esté completo y se haga el switch.

---

## 🎯 Qué cambió vs v1

| | v1 | v2 |
|---|----|----|
| Frontend | Vanilla JS monolito 15K líneas | Vite + TypeScript + Lit |
| CSS | 22+ archivos legacy | Tailwind + 1 tokens.css |
| Backend | Express + JS suelto | Express + TypeScript + Drizzle |
| DB | SQLite directo | Drizzle ORM + LibSQL/Turso |
| Auth | Token en localStorage | JWT en cookie httpOnly + LS backup |
| Validación | Manual / inconsistente | Zod end-to-end (shared schemas) |
| Service Worker | Sí, causaba freezes | **NO** (decisión firme) |
| backdrop-filter | 549 elementos | **0** (no usar) |
| Animations infinitas | 10+ | Solo spinners |
| Bundle | ~300KB+ | < 100KB gzip target |

---

## 🚀 Cómo correr local

### 1. Instalar dependencias

```bash
cd v2
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y configura:
- `TURSO_DATABASE_URL` — para dev local: `file:./local.db`
- `TURSO_AUTH_TOKEN` — vacío si usas file local
- `JWT_SECRET` — genera con `openssl rand -hex 32` (mínimo 32 chars)

### 3. Crear DB + migrations

```bash
npm run db:generate     # genera SQL de migrations desde schema.ts
npm run db:migrate      # aplica migrations a la DB
```

### 4. Crear usuario admin inicial

```bash
npx tsx server/seed.ts
# Por defecto: admin / admin123
# Cambia con: ADMIN_USERNAME=tu_user ADMIN_PASSWORD=tu_pass npx tsx server/seed.ts
```

### 5. Arrancar dev (frontend + backend juntos)

```bash
npm run dev
```

Abre: **http://localhost:5173** (Vite frontend, proxy a backend en :3000)

---

## 🏗 Build + producción

```bash
npm run build           # build frontend (dist/public) + backend (dist/server)
npm start               # arranca node dist/server/index.js
```

En producción:
- Backend Express sirve `dist/public/` como estáticos
- Cualquier ruta no `/api/*` retorna `index.html` (SPA fallback)
- `index.html` tiene `Cache-Control: no-store` (los assets con hash sí se cachean)

---

## 📦 Estructura

```
v2/
├── REBUILD-PLAN.md       ← Master roadmap
├── REBUILD-PROGRESS.md   ← Estado actual (LEER PRIMERO si retomas)
├── README.md             ← Este archivo
├── package.json
├── vite.config.ts        ← Build frontend
├── tsconfig.json         ← TS frontend
├── tsconfig.server.json  ← TS backend
├── tailwind.config.ts
├── drizzle.config.ts
├── .env.example
├── public/               ← Assets estáticos (favicon, etc)
├── src/                  ← Frontend
│   ├── main.ts           ← Entry
│   ├── styles/           ← tokens.css + tailwind.css
│   ├── lib/              ← api, auth, router
│   ├── components/       ← (Sesión 2: data-table, modal, form-input)
│   └── modules/          ← Cada feature lazy-loaded
│       ├── auth/login.ts
│       └── dashboard/dashboard.ts
├── server/               ← Backend
│   ├── index.ts          ← Bootstrap Express
│   ├── env.ts            ← Validación env vars con Zod
│   ├── logger.ts         ← Pino
│   ├── seed.ts           ← Crear admin inicial
│   ├── db/               ← Schema + client Drizzle
│   ├── middleware/       ← auth, cors, error
│   └── routes/           ← Endpoints API
└── shared/               ← Tipos + schemas Zod compartidos
    ├── types.ts
    └── schemas.ts
```

---

## 🛠 Scripts npm

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Frontend (Vite, :5173) + Backend (Express, :3000) |
| `npm run dev:fe` | Solo frontend |
| `npm run dev:be` | Solo backend con auto-reload (tsx watch) |
| `npm run build` | Build de frontend + backend a `dist/` |
| `npm start` | Producción: corre `dist/server/index.js` |
| `npm run db:generate` | Genera SQL migrations desde `schema.ts` |
| `npm run db:migrate` | Aplica migrations a la DB |
| `npm run db:studio` | Abre Drizzle Studio para inspeccionar DB |
| `npm run lint` | Type-check todo (frontend + backend) |

---

## 🚢 Deploy en Render

1. En Render, crear **nuevo Web Service** apuntando al repo
2. Build command: `cd v2 && npm install && npm run build`
3. Start command: `cd v2 && npm start`
4. Env vars (en panel de Render):
   - `NODE_ENV=production`
   - `TURSO_DATABASE_URL=libsql://...`
   - `TURSO_AUTH_TOKEN=...`
   - `JWT_SECRET=...` (32+ chars)
   - `ALLOWED_ORIGINS=https://tu-dominio.onrender.com`
5. Después del primer deploy, ejecutar seed via Render Shell:
   ```bash
   cd v2 && npx tsx server/seed.ts
   ```

---

## 📋 Roadmap

Ver **`REBUILD-PLAN.md`** para el plan completo.
Ver **`REBUILD-PROGRESS.md`** para qué se ha completado.

---

## 🤝 Para retomar el desarrollo

```bash
# 1. Lee el progreso actual
cat v2/REBUILD-PROGRESS.md

# 2. Lee el plan
cat v2/REBUILD-PLAN.md

# 3. Arranca dev
cd v2 && npm install && npm run dev

# 4. Continúa con la sesión que sigue (especificada en PROGRESS.md)
```

---

## 📜 License

Privado. Ing. David Cantú.
