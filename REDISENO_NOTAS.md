# Rediseño — corrección de alcance (notas)

## Estado correcto
- **Todo el sistema:** tema OSCURO (Aurora Glass · azul) — como estaba antes.
- **Solo Prospección:** tema CLARO / ÁMBAR (estilo de tu dashboard de mapas),
  scopeado a `#panel-prospeccion` y a las clases `prospeccion-*`.
- Solo se replicó el lenguaje visual (color/layout) de tu propio proyecto; la marca,
  logos y contenido siguen siendo los tuyos (Universal · Servicio Técnico).

## Archivos
1. `public/css/theme-overhaul.css` — base oscura + sección **V10** con:
   refuerzo de alineación de tablas y el tema **claro solo para Prospección**.
2. `public/js/nav-overhaul.js` — navegación agrupada, neutraliza colores inline
   rebeldes, corrige texto del activo y fuerza celdas de tabla a `table-cell`.
3. `public/index.html` — versión de caché `?v=10-prosp-light`.

## Desplegar
```powershell
Get-ChildItem .git -Recurse -Filter *.lock | Remove-Item -Force -ErrorAction SilentlyContinue
git add -A
git commit -m "fix(ui): revertir a oscuro; claro/ambar SOLO en Prospeccion"
git push origin main
```
Tras el deploy: **Ctrl+Shift+R** (la versión de caché cambió a v10).

## Reversible
Quitar las 2 líneas en `index.html` (link de `theme-overhaul.css` y script de
`nav-overhaul.js`) devuelve el proyecto a su estado original.
