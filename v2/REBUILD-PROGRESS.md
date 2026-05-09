# 📊 REBUILD PROGRESS — Estado Actual

> **Lee esto PRIMERO al retomar**. Te dice exactamente dónde quedó el rebuild y qué sigue.
>
> Última actualización: 2026-05-08

---

## 🔄 Sesión actual (Sesión 1) — Fundamentos

### ✅ Completado

- [x] Estructura de carpetas v2/ creada
- [x] REBUILD-PLAN.md (master document)
- [x] REBUILD-PROGRESS.md (este archivo)
- [x] package.json
- [x] tsconfig.json (frontend + backend)
- [x] vite.config.ts
- [x] tailwind.config.ts
- [x] postcss.config.js
- [x] drizzle.config.ts
- [x] .env.example
- [x] .gitignore
- [x] tokens.css (design tokens)
- [x] tailwind.css (entry)
- [x] Backend skeleton (express + middleware básico)
- [x] DB schema inicial (users, sesiones)
- [x] Frontend skeleton (router minimal + app-shell + login screen)
- [x] Endpoint /api/auth/login funcional
- [x] README.md con instrucciones de dev/build/deploy

### ⏳ En curso

- [ ] (sesión actual termina aquí)

### 📌 Próximo paso (Sesión 2)

**Comando para retomar:**
```
"Continúa con rebuild v2. Lee v2/REBUILD-PROGRESS.md y v2/REBUILD-PLAN.md.
Empieza la Sesión 2: componentes base + módulos Clientes/Categorías/Refacciones."
```

**TODO de la Sesión 2:**
1. Crear componente `<data-table>` (LitElement) con sort/filter/pagination
2. Crear componente `<modal-base>` con backdrop click + ESC
3. Crear componente `<form-input>` con validación + floating label
4. Crear componente `<btn-icon>` y `<toast>` 
5. Módulo Clientes: CRUD completo con modal de edición
6. Módulo Categorías: árbol categorías → subcategorías
7. Módulo Refacciones: tabla con filtros + búsqueda + acciones inline

---

## 📂 Archivos creados (Sesión 1)

```
v2/
├── REBUILD-PLAN.md              ✅
├── REBUILD-PROGRESS.md          ✅ (este)
├── README.md                    ✅
├── package.json                 ✅
├── tsconfig.json                ✅
├── tsconfig.node.json           ✅
├── vite.config.ts               ✅
├── tailwind.config.ts           ✅
├── postcss.config.js            ✅
├── drizzle.config.ts            ✅
├── .env.example                 ✅
├── .gitignore                   ✅
├── public/
│   └── favicon.svg              ✅
├── src/
│   ├── main.ts                  ✅ (entry)
│   ├── styles/
│   │   ├── tokens.css           ✅
│   │   └── tailwind.css         ✅
│   ├── lib/
│   │   ├── api.ts               ✅
│   │   ├── auth.ts              ✅
│   │   └── router.ts            ✅
│   ├── components/
│   │   └── (Sesión 2)
│   └── modules/
│       └── auth/
│           └── login.ts         ✅
├── server/
│   ├── index.ts                 ✅
│   ├── env.ts                   ✅
│   ├── db/
│   │   ├── client.ts            ✅
│   │   └── schema.ts            ✅
│   ├── middleware/
│   │   ├── auth.ts              ✅
│   │   ├── cors.ts              ✅
│   │   └── error.ts             ✅
│   └── routes/
│       └── auth.ts              ✅
└── shared/
    ├── types.ts                 ✅
    └── schemas.ts               ✅
```

---

## 🎯 Métricas a lograr al final del rebuild

(Ver REBUILD-PLAN.md sección "Performance targets")

| Métrica | Target | v1 actual | v2 |
|---------|--------|-----------|-----|
| LCP | < 1500ms | 1240-1700ms | TBD |
| INP | < 200ms | 36ms ✅ | TBD |
| backdropFilter elementos | 0 | 549 → 0 ✅ | 0 (built-in) |
| Bundle JS | < 100KB gzip | ~300KB+ | TBD |
| Service Worker | NONE | NONE ✅ | NONE |

---

## ⚠️ Notas importantes para retomar

1. **El v1 sigue activo** en `/public` y deployed en Render. NO romperlo.
2. **El v2 NO se deploya aún** — vive en `/v2` solamente. Cuando esté completo, se hará el switch.
3. **Branch**: trabajamos en `main`, dentro de carpeta `/v2`. No hay branch separada.
4. **El usuario tiene Turso configurado** — usa las env vars `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.
5. **Render free tier** = cold start ~30s. Tener paciencia al deploy.
6. **El usuario está estresado** por las horas perdidas en el v1. Hacer commits frecuentes para mostrar progreso visible.

---

## 🔗 Stack confirmado

- **Frontend**: Vite + TypeScript + Tailwind + Lit web components
- **Backend**: Express + TypeScript + Drizzle ORM + LibSQL/Turso
- **Auth**: JWT con jose + bcrypt
- **Validación**: Zod end-to-end
- **Logger**: Pino
- **Sin**: Service Worker, React, Webpack, Font Awesome, jQuery

---

## 🎬 Cómo continuar en próxima sesión

```bash
# 1. Lee este archivo (REBUILD-PROGRESS.md)
# 2. Lee REBUILD-PLAN.md sección "Próximo paso"
# 3. Ejecuta los TODOs de la siguiente sesión
# 4. Actualiza este archivo al terminar cada subtask
# 5. Commit + push frecuentemente
```
