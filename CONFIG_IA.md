# Configuración del Asistente con IA

## Dónde poner tu API Key

1. **En Render (producción)**  
   - Entra a [Render Dashboard](https://dashboard.render.com) → tu servicio (Sistema de Cotización).  
   - **Environment** → **Add Environment Variable**.  
   - **Si usas API de Cursor:** nombre `CURSOR_API_KEY`, valor: tu API key de Cursor.  
   - **Si usas OpenAI:** nombre `OPENAI_API_KEY`, valor: tu API key de OpenAI.  
   - Guarda y haz **Deploy** para que tome efecto.

2. **En local**  
   Crea un archivo `.env` en la raíz del proyecto (junto a `server.js`) con:

   ```
   CURSOR_API_KEY=tu-api-key-de-cursor
   ```
   o
   ```
   OPENAI_API_KEY=sk-tu-api-key-aqui
   ```

   Luego en `server.js` puedes cargar variables con un paquete como `dotenv` (opcional). En Render no hace falta `.env` porque usas Environment.

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
