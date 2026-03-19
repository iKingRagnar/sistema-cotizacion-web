# Configuración del Asistente con IA

**¿Dónde configuro la API key del servidor?**  
Depende de dónde corra el servidor: **en producción (Render)** se configura en el panel de Render; **en tu PC (local)** en un archivo `.env` o en la variable de entorno antes de arrancar el servidor.

---

## 1. En producción (Render)

Ahí es donde “vive” el servidor cuando lo despliegas en la nube.

1. Entra a **[Render Dashboard](https://dashboard.render.com)** e inicia sesión.
2. Abre **tu servicio** (el que corresponde al Sistema de Cotización).
3. En el menú lateral, entra a **Environment**.
4. Pulsa **Add Environment Variable** (o **Add Variable**).
5. Añade:
   - **Key:** `OPENAI_API_KEY`
   - **Value:** tu API key de OpenAI (empieza por `sk-...`).  
     Puedes crearla en: **[platform.openai.com/api-keys](https://platform.openai.com/api-keys)**.
6. Guarda los cambios.
7. Haz un **nuevo Deploy** (pestaña **Manual Deploy** → **Deploy latest commit**, o vuelve a desplegar desde GitHub) para que el servidor arranque con la nueva variable.

Con eso el chat, la extracción de datos de imágenes y la extracción/“nueva cotización” desde PDF/Excel usarán la misma `OPENAI_API_KEY`.

---

## 2. En local (tu computadora)

Cuando corres el servidor en tu PC (`node server.js` o `npm start`), la key se puede configurar de dos maneras.

### Opción A: Archivo `.env` (recomendado)

El proyecto ya usa `dotenv`: si existe un archivo `.env`, el servidor lo carga al arrancar.

1. En la raíz del proyecto (carpeta donde está `server.js`), crea un archivo llamado **`.env`**.
2. Dentro escribe una línea como esta (sustituye por tu key real):

   ```
   OPENAI_API_KEY=sk-tu-api-key-aqui
   ```

3. Si acabas de clonar el repo, instala dependencias: `npm install`.
4. Arranca el servidor: `npm start` o `node server.js`.

### Opción B: Variable de entorno en la terminal

Sin archivo `.env`, puedes exportar la variable solo para esa sesión:

- **PowerShell:**
  ```powershell
  $env:OPENAI_API_KEY="sk-tu-api-key-aqui"
  node server.js
  ```
- **Cmd:**
  ```cmd
  set OPENAI_API_KEY=sk-tu-api-key-aqui
  node server.js
  ```
- **Bash / Linux / Mac:**
  ```bash
  export OPENAI_API_KEY=sk-tu-api-key-aqui
  node server.js
  ```

En Render **no** hace falta `.env`; allí se usan solo las variables de **Environment** del panel.

## Variables de entorno usadas por el servidor

| Variable           | Descripción                                      |
|--------------------|--------------------------------------------------|
| `CURSOR_API_KEY`   | API key de **Cursor**. Úsala si tu asistente usa la API de Cursor. |
| `OPENAI_API_KEY`   | API key de OpenAI (o compatible). Se usa si no está `CURSOR_API_KEY`. |
| `AI_API_KEY`       | Alternativa genérica si prefieres otro nombre.   |
| `OPENAI_API_BASE`  | (Opcional) URL base. Por defecto `https://api.openai.com/v1/chat/completions`. Si Cursor te da una URL distinta, ponla aquí. |
| `OPENAI_MODEL`     | (Opcional) Modelo. Por defecto `gpt-3.5-turbo`.   |

## Endpoint

- **POST** `/api/ai/chat`  
- Body: `{ "message": "tu pregunta aquí" }`  
- Respuesta: `{ "reply": "respuesta del modelo" }`  
- Si no está configurada ninguna key: **503** con mensaje indicando añadir `CURSOR_API_KEY` o `OPENAI_API_KEY`.

## Ya tengo la API key

En **Render → tu servicio → Environment** añade **CURSOR_API_KEY** (o **OPENAI_API_KEY** si usas OpenAI). Vuelve a desplegar, y el botón “Enviar” del Asistente con IA en la pestaña Configuración usará ese endpoint.
