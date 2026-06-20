# Rediseño "Amber Clean" — tema claro (notas)

## Decisión final
El sistema pasó de oscuro a **tema claro/ámbar** (estilo de tu dashboard de mapas):
fondo crema, superficies blancas, acento ámbar `#F2A900`, tipografía Inter, tarjetas
suaves de 8–14px. Solo se replicó el **lenguaje de diseño** (color y layout); la marca,
logos y contenido son los tuyos (Universal · Servicio Técnico).

## Archivos
1. **`public/css/theme-overhaul.css`** — tema claro completo (v9b):
   tokens, fondo crema, header/sidebar blancos, KPIs, tablas, botones (primario ámbar),
   badges con tintes suaves, calendario claro, y **UI del mapa de Prospección** en claro
   (panel de filtros, leyenda, toggles, controles).
2. **`public/js/nav-overhaul.js`** — navegación agrupada + buscador, neutraliza colores
   inline rebeldes y corrige el texto degradado del módulo activo, fuerza celdas de tabla
   a `table-cell` (alineación de columnas).
3. **`public/index.html`** — enlaces con versión de caché `?v=9b-light`.

## Desplegar
```powershell
Get-ChildItem .git -Recurse -Filter *.lock | Remove-Item -Force -ErrorAction SilentlyContinue
git add -A
git commit -m "feat(ui): tema claro Amber Clean (estilo dashboard de mapas)"
git push origin main
```
Tras el deploy: **Ctrl+Shift+R** (la versión de caché ya cambió, así que cargará el CSS nuevo).

## Re-tintar el acento en 1 línea
En `theme-overhaul.css`, sección de tokens, cambia `--accent:#f2a900` (y `--accent-ink`
para el texto sobre el acento).

## Pendiente menor
La píldora flotante "35 prospectos visibles" sobre el mapa puede quedar oscura en algún
caso (clase propia no capturada). Si la ves así tras desplegar, te la ajusto en un toque.

## Reversible
Quita las 2 líneas de `index.html` (link de `theme-overhaul.css` y script de
`nav-overhaul.js`) para volver al estado anterior.
