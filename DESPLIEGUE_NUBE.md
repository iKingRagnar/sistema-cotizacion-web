# Cómo dejar el sistema siempre en la nube (sin usar tu PC)

Tu computadora **no será el servidor**. Todo corre en la nube, 100% gratuito. Solo abres una URL en el navegador desde cualquier lugar.

---

## Qué vamos a usar (todo gratis, sin tarjeta)

| Servicio | Para qué | Gratis |
|----------|----------|--------|
| **Turso** | Base de datos en la nube (tus clientes, refacciones, máquinas) | Sí, plan free |
| **Render** | Servidor donde corre la app (Node.js) | Sí, plan free |

**Importante:** En el plan gratis de Render, si nadie entra a la app durante ~15 minutos, se “duerme”. La primera vez que alguien entre después de eso tardará ~1 minuto en despertar. Es normal y no tiene costo.

---

## Paso 1: Crear la base de datos en Turso

1. Entra a **https://turso.tech** y haz clic en **Sign up** (regístrate con GitHub o email).
2. En el panel, haz clic en **Create database**.
3. Pon un nombre, por ejemplo: `cotizacion-db`.
4. Elige una región cercana (ej. **Mexico** o **Dallas**).
5. Crea la base. En la pantalla de la base verás:
   - **Database URL** (algo como `libsql://cotizacion-db-nombre.turso.io`).
   - Un botón para crear **Auth token** (Generate token). Créalo y **cópialo** (solo se muestra una vez).
6. Guarda en un bloc de notas:
   - `TURSO_DATABASE_URL` = la Database URL.
   - `TURSO_AUTH_TOKEN` = el token que generaste.

---

## Paso 2: Subir el proyecto a GitHub (para que Render lo use)

1. Crea una cuenta en **https://github.com** si no tienes.
2. Crea un repositorio nuevo (por ejemplo `sistema-cotizacion-web`), **público**.
3. En tu PC, en la carpeta del proyecto:

   ```powershell
   cd c:\Users\ragna\Downloads\microsip-api\sistema-cotizacion-web
   git init
   git add .
   git commit -m "Sistema cotización web"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/sistema-cotizacion-web.git
   git push -u origin main
   ```

   (Sustituye `TU_USUARIO` por tu usuario de GitHub. Si ya tienes el repo en GitHub, solo haz push de esta carpeta.)

Si prefieres **no usar Git**, más abajo hay una opción subiendo el código directo a Render.

---

## Paso 3: Crear el servicio en Render

1. Entra a **https://render.com** y regístrate (con GitHub es más fácil).
2. En el panel, clic en **New +** → **Web Service**.
3. Conecta tu cuenta de GitHub si no está conectada y elige el repositorio **sistema-cotizacion-web**.
4. Configura:
   - **Name:** por ejemplo `sistema-cotizacion`.
   - **Region:** elige la más cercana (ej. Oregon).
   - **Branch:** `main`.
   - **Runtime:** `Node`.
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** **Free**.
5. En **Environment Variables** (Variables de entorno), agrega:

   | Key | Value |
   |-----|--------|
   | `TURSO_DATABASE_URL` | La URL que copiaste de Turso (ej. `libsql://cotizacion-db-xxx.turso.io`) |
   | `TURSO_AUTH_TOKEN` | El token que copiaste de Turso |

6. Clic en **Create Web Service**. Render instalará dependencias y arrancará la app (puede tardar 2–3 minutos).
7. Cuando termine, te dará una URL como:  
   **https://sistema-cotizacion-xxxx.onrender.com**  
   Esa es la URL de tu sistema **siempre en la nube**.

---

## Paso 4: Cargar los datos demo (una sola vez)

1. Abre la URL de tu app (la de Render).
2. Ve a la pestaña **Cargar datos demo**.
3. Clic en **Cargar datos demo ahora**.
4. Listo: tendrás clientes, refacciones y máquinas del Excel en la nube. Puedes verlos en las pestañas Clientes, Refacciones y Máquinas.

A partir de aquí **no necesitas encender tu PC como servidor**. Solo abres esa URL en cualquier navegador o dispositivo.

---

## Si no quieres usar GitHub (subir código directo)

Render permite conectar un repo. Si no quieres usar Git:

1. Comprime la carpeta `sistema-cotizacion-web` en un **ZIP** (incluye todo menos la carpeta `node_modules` y la carpeta `data`).
2. En Render, en lugar de conectar GitHub, usa **Deploy from repository** con un repo que puedas crear vacío y subir el ZIP descomprimido, o revisa si tienen “Deploy from ZIP” en la documentación actual.
3. La opción más estable es conectar un repo de GitHub como en los pasos anteriores.

---

## Resumen

- **Base de datos:** Turso (nube), gratis.
- **Servidor:** Render (nube), gratis.
- **Tu PC:** solo para editar código y hacer push; **no hace falta tener el servidor corriendo en tu computadora**.
- **Puerto 3000:** ya no importa en tu PC; Render asigna su propio puerto. Si algún día vuelves a correr `npm start` en local, el proyecto usa el puerto **3456** por defecto para evitar conflicto con otros programas.

Si quieres, en el siguiente paso podemos revisar juntos la URL de Render o algún error que te salga al desplegar.
