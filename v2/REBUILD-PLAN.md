# 🔨 REBUILD FROM ZERO — Plan Maestro

> **Propósito**: Reconstruir el Sistema de Cotización Web desde cero con stack moderno,
> arquitectura limpia y SIN los problemas de performance/cache del v1.
>
> **Fecha de inicio**: 2026-05-08
> **Branch**: main (en carpeta `/v2`)
> **Backend actual sigue corriendo** en `/public` mientras `/v2` se construye en paralelo.

---

## 🎯 Decisiones de arquitectura (no negociables)

### ❌ Lo que se ELIMINA del v1 (causaba freezes)

| Antipatrón v1 | Por qué se elimina |
|---------------|-------------------|
| Service Worker con cache agresivo | Causaba scripts viejos atascados en browser |
| 22+ archivos CSS legacy | Cascade caótico, 595 backdrop-filter activos |
| 14 archivos `mega-features-*.js` | MutationObservers compitiendo, freezes |
| Monolito `app.js` (15K líneas) | Imposible de mantener, sin tipo, sin tests |
| `backdrop-filter: blur()` masivo | Paint cataclismic en cada interacción |
| Animations infinitas en background | Repaints constantes |
| Polling con `setInterval` por todos lados | Compounding |
| CSS `!important` carrera de escalada | Especificidad hell |

### ✅ Stack v2

```
Frontend
├── Vite 5            (build tool, HMR rápido, bundle pequeño)
├── TypeScript 5      (type safety, autocomplete real)
├── TailwindCSS 3     (1 archivo CSS, sin duplicados, design system)
├── Lit 3             (web components nativos, livianos, sin React overhead)
├── Lucide Icons      (SVG inline, sin Font Awesome 200KB)
├── Chart.js (lazy)   (solo cuando se abre dashboard)
└── Sin Service Worker (solución firme al cache hell)

Backend
├── Express 4         (mismo stack, compatible con Render actual)
├── TypeScript        (NO más JavaScript suelto)
├── Drizzle ORM       (type-safe queries, migrations versionadas)
├── @libsql/client    (Turso para producción, file local para dev)
├── Zod               (validación de schemas + types compartidos)
├── jose              (JWT moderno, mejor que jsonwebtoken)
└── pino              (logger estructurado, no console.log)

Compartido
├── shared/types.ts   (tipos compartidos frontend↔backend)
└── shared/schemas.ts (Zod schemas para validación end-to-end)
```

---

## 📋 Módulos a reconstruir (en orden de prioridad)

| # | Módulo | Estado | Prioridad |
|---|--------|--------|-----------|
| 1 | **Auth + Login** | ⏳ Pending | CRÍTICA |
| 2 | **Layout shell** (sidebar, header, panels) | ⏳ Pending | CRÍTICA |
| 3 | **Dashboard** | ⏳ Pending | Alta |
| 4 | **Clientes** | ⏳ Pending | Alta |
| 5 | **Refacciones** | ⏳ Pending | Alta |
| 6 | **Categorías** | ⏳ Pending | Media |
| 7 | **Máquinas** (catálogo) | ⏳ Pending | Alta |
| 8 | **Almacén** | ⏳ Pending | Alta |
| 9 | **Cotizaciones** | ⏳ Pending | CRÍTICA |
| 10 | **Ventas** | ⏳ Pending | Alta |
| 11 | **Prospección** (mapa + Pipeline + AI) | ⏳ Pending | Alta |
| 12 | **Revisión Máquinas** | ⏳ Pending | Alta |
| 13 | **Tarifas** | ⏳ Pending | Alta |
| 14 | **Reportes** | ⏳ Pending | Media |
| 15 | **Garantías** | ⏳ Pending | Media |
| 16 | **Mantenimientos** (calendario) | ⏳ Pending | Media |
| 17 | **Sin Cobertura** | ⏳ Pending | Media |
| 18 | **Bonos** | ⏳ Pending | Media |
| 19 | **Viajes** | ⏳ Pending | Media |
| 20 | **Personal/Técnicos** | ⏳ Pending | Media |
| 21 | **Bitácora horas** | ⏳ Pending | Baja |
| 22 | **Auditoría** | ⏳ Pending | Baja |
| 23 | **Usuarios** (admin) | ⏳ Pending | Alta |
| 24 | **DavAI** (chat + streaming SSE) | ⏳ Pending | Alta |

---

## 🎨 Design System v2

### Tokens (CSS vars)

```css
:root {
  /* Colors — dark theme primero (la app es dark) */
  --bg-deep: #020617;
  --bg-surface: #0f172a;
  --bg-elevated: #1e293b;
  --border: rgba(255,255,255,0.08);
  --border-strong: rgba(255,255,255,0.14);

  --text: #f8fafc;
  --text-soft: #cbd5e1;
  --text-muted: #94a3b8;
  --text-dim: #64748b;

  --accent: #3b82f6;     /* azul */
  --accent-2: #8b5cf6;   /* morado */
  --accent-3: #06b6d4;   /* cyan */
  --success: #22c55e;
  --warning: #f59e0b;
  --danger: #ef4444;

  /* Spacing */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
  --space-4: 16px; --space-5: 20px; --space-6: 24px;
  --space-8: 32px; --space-10: 40px; --space-12: 48px;

  /* Radius */
  --r-sm: 6px; --r-md: 10px; --r-lg: 14px; --r-xl: 20px;

  /* Font */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --font-display: 'Sora', sans-serif;
}
```

### Reglas de oro

1. **NO `backdrop-filter`** (era el #1 culpable del freeze).
2. **NO animations infinitas** (excepto spinners de carga).
3. **NO `!important`** salvo en design tokens.
4. **NO archivos CSS dispersos** — todo en `src/styles/` con Tailwind + 1 `tokens.css`.
5. Componentes son `LitElement` con shadow DOM (estilos encapsulados, no leak).
6. Iconos = Lucide SVG inline (no Font Awesome).
7. Cada módulo es lazy-loaded.

---

## 🗂 Estructura de carpetas

```
v2/
├── REBUILD-PLAN.md          ← este archivo
├── REBUILD-PROGRESS.md      ← qué se ha hecho, qué falta
├── README.md                ← cómo correr local + deploy
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── drizzle.config.ts
├── .env.example
├── public/
│   └── favicon.svg
├── src/                     ← Frontend (Vite)
│   ├── main.ts             ← entry
│   ├── styles/
│   │   ├── tokens.css      ← CSS vars (design tokens)
│   │   └── tailwind.css
│   ├── lib/
│   │   ├── api.ts          ← cliente HTTP type-safe
│   │   ├── auth.ts         ← gestión de token JWT
│   │   ├── router.ts       ← router minimal hash-based
│   │   └── store.ts        ← state global (signals/proxy)
│   ├── components/         ← componentes reusables (Lit)
│   │   ├── app-shell.ts
│   │   ├── data-table.ts
│   │   ├── modal-base.ts
│   │   ├── form-input.ts
│   │   ├── btn-icon.ts
│   │   └── toast.ts
│   └── modules/            ← cada módulo lazy-loaded
│       ├── auth/login.ts
│       ├── dashboard/dashboard.ts
│       ├── clientes/clientes.ts
│       ├── ...
│       └── davai/davai.ts
├── server/                  ← Backend (Express)
│   ├── index.ts            ← bootstrap
│   ├── env.ts              ← validación env vars con Zod
│   ├── db/
│   │   ├── client.ts       ← Drizzle + LibSQL client
│   │   └── schema.ts       ← tablas (Drizzle schema)
│   ├── middleware/
│   │   ├── auth.ts         ← JWT verification
│   │   ├── cors.ts
│   │   └── logger.ts
│   └── routes/
│       ├── auth.ts
│       ├── clientes.ts
│       ├── refacciones.ts
│       ├── ...
│       └── davai.ts
└── shared/
    ├── types.ts            ← tipos de entidades
    └── schemas.ts          ← Zod schemas (validación)
```

---

## 🚀 Plan de ejecución por sesiones

> Cada sesión es ~2-3 horas. Si la sesión se interrumpe, lee `REBUILD-PROGRESS.md` para
> retomar exactamente donde quedó.

### Sesión 1 (HOY) — Fundamentos
- [x] Crear estructura de carpetas v2/
- [x] REBUILD-PLAN.md (este doc)
- [ ] REBUILD-PROGRESS.md (estado tracker)
- [ ] package.json + tsconfig + vite.config + tailwind + drizzle config
- [ ] tokens.css + tailwind.css
- [ ] Backend skeleton (express + drizzle + auth middleware)
- [ ] Schema DB inicial (users, clientes, refacciones)
- [ ] Frontend skeleton (router + app-shell + login)
- [ ] Endpoint /api/auth + login funcional
- [ ] README con instrucciones

### Sesión 2 — Core CRUD
- [ ] Componentes base (data-table, modal, form-input, btn-icon, toast)
- [ ] Módulo Clientes (CRUD completo)
- [ ] Módulo Categorías
- [ ] Módulo Refacciones (con filtros, búsqueda)

### Sesión 3 — Operaciones
- [ ] Módulo Máquinas
- [ ] Módulo Almacén
- [ ] Módulo Cotizaciones (form complejo, cálculo MXN/USD)

### Sesión 4 — Ventas + Reportes
- [ ] Módulo Ventas
- [ ] Módulo Reportes (con Chart.js lazy)
- [ ] Módulo Tarifas

### Sesión 5 — Prospección + Mapa
- [ ] Módulo Prospección (mapa Leaflet lazy + filtros + sidebar)
- [ ] Pipeline Kanban drag-drop
- [ ] Score IA por prospecto

### Sesión 6 — Mantenimientos + Garantías + Bonos
- [ ] Módulo Garantías
- [ ] Módulo Mantenimientos (calendario)
- [ ] Módulo Sin Cobertura
- [ ] Módulo Bonos
- [ ] Módulo Viajes

### Sesión 7 — Personal + Auditoría
- [ ] Módulo Personal/Técnicos
- [ ] Módulo Bitácora horas
- [ ] Módulo Auditoría
- [ ] Módulo Usuarios (admin)

### Sesión 8 — DavAI + Pulido final
- [ ] Módulo DavAI (chat con SSE streaming)
- [ ] Toggle theme (dark/light)
- [ ] Cmd+K palette
- [ ] Atajos de teclado
- [ ] PWA install (SIN service worker, solo manifest)
- [ ] Lighthouse audit > 90 en Performance/Accessibility/Best Practices

### Sesión 9 — Migración + Deploy
- [ ] Script de migración de datos v1 → v2
- [ ] Tests críticos
- [ ] Deploy a Render apuntando a /v2
- [ ] Switch DNS / mantener v1 como fallback inicialmente
- [ ] Cleanup v1 una vez v2 esté estable

---

## 📊 Performance targets v2

Métricas que el v2 DEBE cumplir (medidas con Chrome DevTools Performance trace):

| Métrica | Target | Razón |
|---------|--------|-------|
| LCP | < 1500ms | Primer paint rápido |
| INP | < 200ms | Interacciones responsivas |
| CLS | < 0.1 | Sin layout shifts |
| TBT | < 200ms | Main thread libre |
| ForcedReflow | < 50ms total | Sin layout thrashing |
| backdropFilter elementos | 0 | Evitar paint cataclismic |
| Animations infinitas | < 5 (solo spinners) | Sin repaints constantes |
| Bundle JS inicial | < 100 KB gzip | Carga rápida |
| Bundle CSS | < 30 KB gzip | Sin redundancia |

---

## 🔒 Seguridad v2

- JWT con httpOnly cookies (no localStorage para token)
- CSRF token en mutaciones
- Rate limiting en endpoints auth
- bcrypt para passwords (mismo que v1)
- Helmet middleware
- CORS estricto
- Validación de input con Zod en TODOS los endpoints

---

## 📦 Dependencias mínimas

### Frontend
```json
{
  "dependencies": {
    "lit": "^3.2.0",
    "lucide": "^0.460.0"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "typescript": "^5.6.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

### Backend
```json
{
  "dependencies": {
    "express": "^4.21.0",
    "drizzle-orm": "^0.36.0",
    "@libsql/client": "^0.14.0",
    "zod": "^3.23.0",
    "jose": "^5.9.0",
    "bcryptjs": "^2.4.3",
    "pino": "^9.5.0",
    "helmet": "^8.0.0",
    "cors": "^2.8.5",
    "express-rate-limit": "^7.4.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.27.0",
    "tsx": "^4.19.0",
    "@types/node": "^22.5.0",
    "@types/express": "^5.0.0",
    "@types/bcryptjs": "^2.4.0"
  }
}
```

---

## 🎬 Continuación

Cuando retomes, lee:
1. **`REBUILD-PROGRESS.md`** — para saber qué se hizo y qué sigue
2. **Este `REBUILD-PLAN.md`** — para el contexto completo

Comando para retomar en próxima sesión:
```
"Continúa con el rebuild v2 desde donde quedó. Lee v2/REBUILD-PROGRESS.md para el estado actual."
```
