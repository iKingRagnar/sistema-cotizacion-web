# Marca blanca, sonido y autenticación

## 1. `public/js/config.js` (cliente)

Valores por defecto que se muestran **antes** de cargar `/api/config`:

- `appName`, `shortName`, `tagline` — textos del encabezado y SEO.
- `logoUrl` — ruta o URL del logo (ej. `/assets/logo.png`). Vacío = `favicon.svg`.
- `primaryHex`, `accentHex` — colores para variables CSS `--config-primary` / `--config-accent` (gradiente del header).
- `soundEffectsDefault` — si es `true`, nuevos usuarios oyen un “tick” al mostrar toasts de éxito hasta que lo desactiven con el icono de volumen.

El servidor **mezcla** su respuesta de `/api/config` encima de este objeto (las variables de entorno tienen prioridad en servidor).

## 2. Variables de entorno (servidor)

Ver `.env.example`. Útiles en Render, VPS, etc.:

| Variable | Descripción |
|----------|-------------|
| `APP_NAME` | Nombre largo (Acerca de, etc.) |
| `APP_SHORT_NAME` | Título corto en la barra superior |
| `APP_TAGLINE` | Subtítulo bajo el título |
| `APP_LOGO_URL` | URL del logo |
| `APP_PRIMARY_HEX` / `APP_ACCENT_HEX` | Colores de marca |
| `APP_SOUND_DEFAULT` | `1` = sonido por defecto activado |

## 3. Autenticación y roles

Con `AUTH_ENABLED=1` y `AUTH_SECRET` definido:

- Sin token válido, la API responde `401` (excepto `/api/config` y `/api/auth/login`).
- Roles: **admin** (todo + pestaña Auditoría), **operador** (lectura y escritura), **consulta** (solo GET).
- Usuarios iniciales si la tabla está vacía: `admin`, `operador`, `consulta` (contraseñas configurables con `*_INITIAL_PASSWORD` en `.env`).

## 4. Auditoría

Las respuestas exitosas a **POST, PUT, DELETE** bajo `/api` generan filas en `audit_log` (usuario, rol, ruta, detalle recortado). La pestaña **Auditoría** solo la ve **admin** con autenticación activa.

## 5. PWA (`manifest.json`)

El nombre corto del manifest no se actualiza solo: si cambias la marca, edita `manifest.json` o regenera iconos según tu proceso de despliegue.
