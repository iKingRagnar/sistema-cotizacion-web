# Rediseño "Dark Premium" — notas

## Qué cambió
Diagnóstico: el proyecto cargaba **50+ hojas de estilo** peleándose entre sí (varios "temas" superpuestos + capas de parches) y **24 módulos en lista plana** sin agrupar. Eso causaba el look inconsistente y la sensación de "perderse".

Solución, **sin tocar tu HTML ni tu JS de negocio** (todo es aditivo):

1. **`public/css/theme-overhaul.css`** — un único sistema de diseño cargado al final de la cascada:
   - Fondo oscuro sólido premium (se eliminó la foto industrial que mataba la legibilidad).
   - Un solo acento (indigo `#6c8cff`) que reemplaza el amarillo `#FFD200` chillante.
   - Header, sidebar, paneles, tablas, botones, inputs, KPI, modales y scrollbars coherentes.
   - Branding del header corregido (el logo ya no tapa el texto).

2. **`public/js/nav-overhaul.js`** — navegación usable:
   - Agrupa los 24 módulos en **6 categorías colapsables**: Inteligencia, Comercial, Servicio & Operaciones, Almacén & Logística, Garantías, Administración.
   - **Buscador de módulos** en el sidebar.
   - Recuerda qué grupos dejaste colapsados (localStorage).
   - Neutraliza los estilos inline `!important` amarillos legacy y oculta el toast de debug "Map container is already initialized".
   - **No rompe nada**: los botones `.tab` conservan sus listeners (solo se reubican en el DOM).

3. **`public/index.html`** — enlaza los dos archivos al final (1 `<link>` + 1 `<script>`).

## Cómo desplegar
Desde esta carpeta:

```bash
git push origin main
```

Render detecta el push y despliega en ~2-3 min. Si no ves el cambio, fuerza recarga (Ctrl+Shift+R) por el caché de CSS.

## Reversible
Si algo no te gusta, basta con quitar las 2 líneas que agregué en `index.html` (el `<link>` de `theme-overhaul.css` y el `<script>` de `nav-overhaul.js`) y vuelve al estado anterior. Cero riesgo.

## Siguiente paso opcional
Eventualmente conviene **eliminar** las ~50 hojas de estilo viejas que ya no aportan (consolidar de verdad, no solo sobrescribir). Eso reduce peso de carga y deuda técnica. Puedo hacerlo en una segunda pasada con pruebas módulo por módulo.
