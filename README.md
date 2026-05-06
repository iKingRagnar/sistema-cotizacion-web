# Sistema Cotización Web — UI corporativa + app completa

- **Backend y datos:** sin cambios en la fuente de verdad (`server.js`, `auth.js`, `db.js`, rutas `/api`).
- **Interfaz en `/`:** la SPA histórica completa (`public/js/app.js` + marcado HTML de `public/index.html`) con cotizaciones, clientes, catálogos, etc., igual que en el backup **salvo** que aquí **no** se cargan las hojas `premium.css`, `premium-pro.css`, `luna-nuclear.css`, `nano-fondo.css` ni `premium-ux.js`; el acabado sobrio lo marca **`css/enterprise-ui.css`** al final de la cascada.

Durante un paso anterior existía un **shell vacío** en `public/client/` (solo login + texto placeholder): **ya no es la entrada del sitio**; sigue en el repo por si quieres reaprovechar trozos, pero **`/` vuelve a ser la aplicación real.**

La ruta **`/legacy-app`** sirve el mismo `legacy-app.html` (mantener sincronizado con `index.html` si cambias uno).

## Arranque local

```bash
npm install
cp .env.example .env   # si existe
npm start
```

## Repositorio

https://github.com/iKingRagnar/sistema-cotizacion-web · rama `main`.
