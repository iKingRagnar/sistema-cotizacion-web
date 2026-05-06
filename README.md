# Sistema Cotización Web — UI nueva (greenfield)

El **backend** (`server.js`, `auth.js`, `db.js`) y las rutas **`/api`** son la fuente de verdad de datos y reglas de negocio.

La **interfaz en la raíz** (`/`) es una SPA **nueva**, sin reutilizar HTML/CSS/JS de la aplicación anterior:

- `public/index.html` — shell mínimo
- `public/client/styles/main.css` — estilos desde cero
- `public/client/js/app.js` — login (`POST /api/auth/login`), configuración (`GET /api/config`), sesión (`GET /api/auth/me`)

La SPA histórica completa queda como **copia de rescate** en `public/legacy-app.html` y se puede abrir en **`/legacy-app`** (misma carpeta `public/` para CSS/JS referenciados con rutas absolutas tipo `/css/...`).

## Arranque local

```bash
npm install
cp .env.example .env   # si existe; configurar Turso u opciones locales según tu entorno
npm start
```

Abrir la URL que imprima `server.js` (típicamente `http://localhost:3456`).

## Repositorio

Código publicado en: **https://github.com/iKingRagnar/sistema-cotizacion-web** (rama `main`).
