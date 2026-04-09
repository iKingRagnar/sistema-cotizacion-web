# Desplegar en Vercel

El proyecto es una app **Express** en `server.js`. Vercel la empaqueta como **una función** (Fluid Compute) y sirve los archivos de `public/` por **CDN** (no uses solo `express.static` en producción en Vercel: está desactivado; los estáticos salen de `public/`).

## Requisitos

1. **Base de datos en la nube (recomendado):** [Turso](https://turso.tech) — en serverless **no** debes depender de SQLite en disco (es efímero).
   - Crea la base y genera token.
   - Variables en Vercel → Settings → Environment Variables:
     - `TURSO_DATABASE_URL` = URL `libsql://...`
     - `TURSO_AUTH_TOKEN` = token

2. **Copia el resto de variables** desde `.env.example` según uses auth, correo, etc. (JWT, SMTP, etc.).

3. **Respaldos automáticos a disco** (`BACKUP_AUTO_*`): en Vercel están **omitidos** (no hay disco persistente). Usa exportación manual desde la app o un job externo si lo necesitas.

## Pasos en Vercel (con licencia Pro)

1. [Importar el repositorio](https://vercel.com/new) (GitHub: `iKingRagnar/sistema-cotizacion-web`).
2. **Framework Preset:** deja que detecte **Express** o elige Node si no aparece.
3. **Build Command:** `npm install` (por defecto).
4. **Install Command:** `npm install`.
5. **Output / Root:** raíz del repo (donde está `package.json` y `server.js`).
6. Añade las variables de entorno (Turso y demás).
7. **Deploy.**

## Desarrollo local con CLI

```bash
npm i -g vercel
cd sistema-cotizacion-web
vercel dev
```

CLI mínima recomendada: 47+ (según documentación de Express en Vercel).

## Notas

- **`/health`:** sigue disponible para comprobaciones de salud.
- **Rutas del SPA:** si al recargar una URL profunda ves 404, en Vercel → Project → Settings → agrega un rewrite que envíe esas rutas al servidor (según la versión del dashboard); el `server.js` ya tiene `app.get('*')` sirviendo `index.html` cuando la petición llega a Express.
- **Límite de tiempo:** en Pro puedes subir `maxDuration` en `vercel.json` si algún informe o export tarda mucho (ver [docs](https://vercel.com/docs/functions/configuring-functions/duration)).

## Render

Si seguías usando Render, `render.yaml` puede mantenerse; la app está preparada para ambos entornos.
