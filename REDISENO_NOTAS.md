# Rediseño "Aurora Glass — Azul Eléctrico Royal" — notas

## Qué cambió
Diagnóstico inicial: el proyecto cargaba **50+ hojas de estilo** peleándose entre sí y **24 módulos en lista plana**. Eso causaba el look inconsistente y la sensación de "perderse".

Solución, **sin tocar tu HTML ni tu JS de negocio** (todo aditivo, 100% reversible):

1. **`public/css/theme-overhaul.css`** — un único sistema de diseño cargado al final, en 5 capas:
   - Base dark premium unificada (tokens, tipografía, tablas, botones, inputs, modales).
   - Navegación, calendario y headers rediseñados.
   - **Aurora Glass**: superficies de cristal esmerilado (glassmorphism), profundidad y glow.
   - **Azul eléctrico royal** como acento (variable RGB única `--ov-accent-rgb`, fácil de re-tintar).
   - **Aurora animada** de fondo (`#ov-aurora`) con destellos de color en movimiento lento + micro-animaciones (respeta `prefers-reduced-motion`).

2. **`public/js/nav-overhaul.js`**:
   - Agrupa los 24 módulos en 6 categorías colapsables + buscador (recuerda estado).
   - Neutraliza los estilos inline amarillos legacy del tab activo y los pills del header.
   - Inyecta la capa de aurora animada y oculta el toast de debug.

3. **`public/index.html`** — enlaza ambos archivos al final (1 `<link>` + 1 `<script>`).

## Cómo desplegar (IMPORTANTE: aún no está en producción)
Desde esta carpeta, en tu terminal:

```bash
# 1) si aparece un lock atascado, bórralo (en Windows):
del .git\index.lock

# 2) confirma y sube
git add -A
git commit -m "feat(ui): Aurora Glass azul royal + navegacion agrupada"
git push origin main
```

Render desplegará en ~2-3 min. Fuerza recarga (Ctrl+Shift+R) por el caché de CSS.

## Re-tintar el acento en 1 línea
En `theme-overhaul.css`, busca `--ov-accent-rgb:` (sección V5) y cambia el RGB:
- Violeta: `124,108,255`
- Esmeralda: `16,185,129`
- Ámbar: `245,158,11`
…y ajusta `--ov-accent` / `--ov-accent-2` al hex equivalente.

## Reversible
Quita las 2 líneas que agregué en `index.html` (el `<link>` de `theme-overhaul.css` y el `<script>` de `nav-overhaul.js`) y vuelve al estado anterior. Cero riesgo.

## Siguiente paso opcional
Eliminar las ~50 hojas de estilo viejas (consolidar de verdad) para reducir peso de carga. Segunda pasada con pruebas módulo por módulo.
