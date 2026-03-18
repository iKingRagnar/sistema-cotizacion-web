# Sistema de Cotización - En línea

Todo se puede **ver en línea** en el navegador. Los catálogos demo vienen del archivo **SistemaGestion_Demo.xlsm** (exportado a `seed-demo.json`).

## Cómo abrirlo y ver tu información

### 1. Generar los datos demo (una vez)

Si aún no tienes `seed-demo.json`, exporta desde el Excel:

1. Copia **SistemaGestion_Demo.xlsm** a la carpeta `sistema-cotizacion-web` (o deja la ruta en el script).
2. En esta carpeta ejecuta:
   ```bash
   python exportar_demo.py
   ```
   Se creará **seed-demo.json** con clientes, refacciones y máquinas del Excel.

### 2. Instalar y arrancar el servidor

```bash
cd sistema-cotizacion-web
npm install
npm start
```

### 3. Abrir en el navegador

Abre: **http://localhost:3000**

- Pestaña **Clientes**: ver y buscar clientes.
- Pestaña **Refacciones**: ver refacciones (código, descripción, marca, precio).
- Pestaña **Máquinas**: ver máquinas por cliente.
- Pestaña **Cargar datos demo**: un clic para importar los 30 clientes, 50 refacciones y 15 máquinas del Excel.

Después de cargar el demo, verás toda la información en las pestañas Clientes, Refacciones y Máquinas.

## Subir a la nube (100% gratuito)

- **Base de datos**: [Turso](https://turso.tech) (cuenta gratis, sin tarjeta). Creas una base y obtienes `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.
- **Servidor**: [Render](https://render.com) (cuenta gratis). Creas un “Web Service”, conectas tu repositorio o subes el proyecto y configuras:
  - Build: `npm install`
  - Start: `npm start`
  - Variables de entorno: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`

Así tendrás la app en una URL tipo `https://tu-app.onrender.com` y podrás ver todo en línea desde cualquier lugar.
