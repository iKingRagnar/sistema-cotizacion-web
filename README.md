# Sistema Cotización Web — Enterprise UI

Copia de trabajo basada en `sistema-cotizacion-web-Old y BackUp`: **misma estructura de backend (`server.js`, `auth.js`, `db.js`) y SPA (`public/index.html`, `public/js/app.js`)**.

Este fork añade una **capa visual corporativa minimalista** mediante `public/css/enterprise-ui.css`, activada con la clase `enterprise-ui` en el elemento `<html>`.

## Arranque local

```bash
npm install
cp .env.example .env   # si existe; configurar Turso u opciones locales según tu entorno
npm start
```

Abrir la URL que imprima `server.js` (típicamente `http://localhost:3456` o la configurada en el proyecto).

## Cambios respecto al backup

- `package.json`: nombre `sistema-cotizacion-web-enterprise`.
- `public/css/enterprise-ui.css`: tema neutro, menos ornamentación en login y cromo (sidebar/header).

Las rutas `/api` y la lógica de negocio se mantienen alineadas al proyecto original en David Proyecto salvo evoluciones futuras explícitas en este repositorio.

## Publicar en GitHub

Ya existe commit inicial en la rama `main`. Remoto configurado: `origin` → `https://github.com/iKingRagnar/sistema-cotizacion-web-enterprise.git`.

1. Crea el repositorio vacío en GitHub con ese mismo nombre (`sistema-cotizacion-web-enterprise`), **sin** README ni `.gitignore` generados por GitHub (evita conflicto en el primer push).

2. En la carpeta del proyecto:

```bash
git push -u origin main
```

Si prefieres usar GitHub CLI: instala `gh`, ejecuta `gh auth login` una vez y luego puedes crear el repo remoto con `gh repo create sistema-cotizacion-web-enterprise --public --source=. --remote=origin --push`.
