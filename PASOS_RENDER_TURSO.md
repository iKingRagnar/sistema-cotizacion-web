# Todo en línea: Render + Turso — Qué hacer paso a paso

Sigue los pasos en orden. Todo es gratis y no piden tarjeta.

---

## PARTE A — Base de datos (Turso)

### 1. Entrar a Turso
- Abre el navegador y ve a: **https://turso.tech**
- Clic en **Sign up** (regístrate con tu email o con GitHub).

### 2. Crear la base de datos
- En el panel de Turso, clic en **Create database** (o **New database**).
- **Database name:** escribe `cotizacion-db` (o el nombre que quieras).
- **Region:** elige una cercana, por ejemplo **Mexico** o **Dallas**.
- Clic en **Create**.

### 3. Anotar la URL y el token
- En la página de tu base de datos verás:
  - **Database URL** — algo como: `libsql://cotizacion-db-xxxxx-ragna.turso.io`
- Clic en **Generate token** (o **Auth tokens** → **Create token**).
- Pon un nombre al token (ej. `render`) y créalo.
- **Copia el token** en seguida (solo se muestra una vez).

Abre un bloc de notas y guarda:

```
TURSO_DATABASE_URL = (pega aquí la Database URL, tal cual, sin espacios)
TURSO_AUTH_TOKEN = (pega aquí el token que generaste)
```

No cierres el bloc de notas; lo usarás en la Parte C.

---

## PARTE B — Subir el código a GitHub

### 4. Cuenta de GitHub
- Ve a **https://github.com** e inicia sesión (o crea cuenta).

### 5. Crear un repositorio nuevo
- Clic en el **+** arriba a la derecha → **New repository**.
- **Repository name:** `sistema-cotizacion-web`
- Deja **Public**.
- No marques “Add a README” (el proyecto ya tiene archivos).
- Clic en **Create repository**.

### 6. Subir la carpeta del proyecto
Abre **PowerShell** y ejecuta estos comandos **uno por uno** (cambia `TU_USUARIO` por tu usuario de GitHub):

```powershell
cd c:\Users\ragna\Downloads\microsip-api\sistema-cotizacion-web
```

```powershell
git init
```

```powershell
git add .
```

```powershell
git commit -m "Sistema cotización en línea"
```

```powershell
git branch -M main
```

```powershell
git remote add origin https://github.com/TU_USUARIO/sistema-cotizacion-web.git
```

(Sustituye **TU_USUARIO** por tu usuario, por ejemplo si tu usuario es `juanperez`, sería:  
`https://github.com/juanperez/sistema-cotizacion-web.git`)

```powershell
git push -u origin main
```

Si te pide usuario y contraseña de GitHub, usa tu usuario y en “password” un **Personal Access Token** (en GitHub: Settings → Developer settings → Personal access tokens → Generate new token). Si no tienes Git instalado, instálalo desde **https://git-scm.com** y vuelve a intentar.

Cuando termine el `git push`, en la página del repo en GitHub deberías ver todos los archivos del proyecto.

---

## PARTE C — Poner la app en Render

### 7. Entrar a Render
- Ve a **https://render.com**
- Clic en **Get started for free** y regístrate (con GitHub es más rápido).

### 8. Crear el Web Service
- En el panel de Render, clic en **New +** (botón azul).
- Elige **Web Service**.

### 9. Conectar el repositorio
- Si te pide conectar GitHub, clic en **Connect GitHub** y autoriza a Render.
- En la lista de repositorios, busca **sistema-cotizacion-web** y clic en **Connect** al lado.

### 10. Configurar el servicio
Comprueba que esté así (o ajústalo):

| Campo | Valor |
|-------|--------|
| **Name** | `sistema-cotizacion` (o el nombre que quieras; será parte de la URL) |
| **Region** | Elige la más cercana (ej. **Oregon (US West)** o **Frankfurt**) |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | **Free** |

### 11. Añadir variables de entorno (Turso)
- Baja hasta la sección **Environment Variables**.
- Clic en **Add Environment Variable**.
- Primera variable:
  - **Key:** `TURSO_DATABASE_URL`
  - **Value:** pega la URL que guardaste del bloc de notas (la Database URL de Turso).
- Clic de nuevo en **Add Environment Variable**.
- Segunda variable:
  - **Key:** `TURSO_AUTH_TOKEN`
  - **Value:** pega el token que guardaste.

Revisa que no haya espacios al inicio o al final al pegar.

### 12. Crear el servicio
- Clic en **Create Web Service**.
- Render empezará a instalar dependencias y a desplegar (suele tardar 2–4 minutos).
- En la parte superior verás el estado (Building… luego Starting…). Cuando pase a **Live**, ya está listo.

### 13. Tu URL en línea
- Arriba verás un enlace como: **https://sistema-cotizacion-xxxx.onrender.com**
- Ese es el enlace de tu app. Ábrelo en el navegador.

---

## PARTE D — Cargar los datos demo (una vez)

### 14. Dentro de tu app
- En la app abierta (la URL de Render), ve a la pestaña **Cargar datos demo**.
- Clic en **Cargar datos demo ahora**.
- Espera a que diga que se cargaron clientes, refacciones y máquinas.

### 15. Listo
- Ve a las pestañas **Clientes**, **Refacciones** y **Máquinas** para ver los datos.
- A partir de aquí la app y los datos están en la nube: puedes apagar tu PC y seguir entrando por esa misma URL desde cualquier dispositivo.

---

## Resumen rápido

| Paso | Dónde | Acción |
|------|--------|--------|
| 1–3 | Turso | Crear cuenta → Create database → copiar URL y token |
| 4–6 | GitHub | Crear repo → en PowerShell: `git init`, `add`, `commit`, `remote`, `push` |
| 7–13 | Render | New Web Service → conectar repo → Build: `npm install`, Start: `npm start` → añadir `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` → Create |
| 14–15 | Tu URL | Abrir la URL de Render → Cargar datos demo → usar la app |

Si en algún paso te sale un error, copia el mensaje exacto y lo vemos.
