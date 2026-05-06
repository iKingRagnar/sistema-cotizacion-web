# Sistema Cotización Web — UI corporativa + app completa

- **Backend y datos:** fuente de verdad sin cambios (`server.js`, `auth.js`, `db.js`, rutas `/api`).
- **Interfaz en `/`:** cliente **nuevo** (`public/index.html` mínimo + `public/client/styles/app.css` + `public/client/js/app.js`): mismo orden de secciones y mismos datos por API que la SPA histórica, sin copiar su HTML/CSS/JS ni capas premium. Es una vista **de lectura y tablas genéricas** (dashboard vía `/api/dashboard-stats`, listas vía endpoints GET existentes).
- **Interfaz clásica (cotización completa, formularios, demo masivo):** ruta **`/legacy-app`** → archivo `public/legacy-app.html` (mantener sincronizado si cambias el HTML masivo del proyecto anterior).

## Arranque local

```bash
npm install
cp .env.example .env   # si existe
npm start
```

### Portada industrial / nano

Opcional: coloca `public/fondos/nano-machining-services.webp` para la foto del hero; si no existe, el fondo sigue siendo el degradado industrial definido en `app.css`.

## Repositorio

https://github.com/iKingRagnar/sistema-cotizacion-web · rama `main`.
