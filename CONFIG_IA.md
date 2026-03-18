# Configuración del Asistente con IA

## Dónde poner tu API Key

1. **En Render (producción)**  
   - Entra a [Render Dashboard](https://dashboard.render.com) → tu servicio (Sistema de Cotización).  
   - **Environment** → **Add Environment Variable**.  
   - Nombre: `OPENAI_API_KEY`  
   - Valor: tu API key de OpenAI (o la key del proveedor que uses).  
   - Guarda y haz **Deploy** para que tome efecto.

2. **En local**  
   Crea un archivo `.env` en la raíz del proyecto (junto a `server.js`) con:

   ```
   OPENAI_API_KEY=sk-tu-api-key-aqui
   ```

   Luego en `server.js` puedes cargar variables con un paquete como `dotenv` (opcional). En Render no hace falta `.env` porque usas Environment.

## Variables de entorno usadas por el servidor

| Variable           | Descripción                                      |
|--------------------|--------------------------------------------------|
| `OPENAI_API_KEY`   | API key de OpenAI (o compatible). **Obligatoria** para que el chat funcione. |
| `AI_API_KEY`       | Alternativa a `OPENAI_API_KEY` si prefieres otro nombre. |
| `OPENAI_API_BASE`  | (Opcional) URL base. Por defecto `https://api.openai.com/v1/chat/completions`. Útil para proxies o otros proveedores compatibles. |
| `OPENAI_MODEL`     | (Opcional) Modelo. Por defecto `gpt-3.5-turbo`. |

## Endpoint

- **POST** `/api/ai/chat`  
- Body: `{ "message": "tu pregunta aquí" }`  
- Respuesta: `{ "reply": "respuesta del modelo" }`  
- Si no está configurada la key: **503** con mensaje indicando añadir `OPENAI_API_KEY`.

## Ya tengo la API key

Ponla en **Render → tu servicio → Environment → OPENAI_API_KEY**, vuelve a desplegar, y el botón “Enviar” del Asistente con IA en la pestaña Configuración usará ese endpoint.
