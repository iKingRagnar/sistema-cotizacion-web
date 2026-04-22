# Rediseño Material Design 3 — Sistema de Cotización

**Fecha**: 2026-04-22
**Autor**: Claude (Opus 4.7) por encargo de Guillermo (iKingRagnar)
**Scope**: SPA legacy en `public/` (Render + Express). Excluye `web/` (Next.js separado).

---

## 1. Diagnóstico (Fase 1 — auditoría)

### Funcional (`app.js`, 13 445 LOC)
- 17/22 paneles OK; 5 con bugs leves de error swallowing (`maquinas`, `ventas`, `revision-maquinas`, `tarifas`, `tecnicos`).
- 19 ocurrencias de `window.prompt`/`window.confirm` (UX pobre): `categorias-catalogo`, `usuarios` schedules, `demo` backups, `cotizaciones` aprobación.
- 1 panel retirado (`incidentes`) con código residual (`loadIncidentes`, `incidentesCache`).
- 3 endpoints servidor huérfanos: `/api/insights/panel`, `/api/mantenimientos-taller`, `/api/bonos-resumen`.
- Dead code: `renderMaquinaFicha`, `openMailtoUsuariosEliminadosResumen`, `goToMaquinasFromRefaccionCategoria`.

### Correo (`server.js`, `nodemailer 6.9.16`)
- 6 flujos OK: aprobación cotización, export reportes, schedules diario/semanal, mensual admin, alertas garantía próxima/vencida.
- 5 ausentes: reset password, bienvenida usuario, notificación incidentes, notificación cotización **creada**, backups.
- Riesgos: catches silenciosos en aprobación cotización, generador PDF "casero" sin `pdfkit`, sin cola de envío, sin reintentos.

### Visual (CSS — 344 KB total, 7 archivos, 10 544 líneas)
- 1 258 `!important` (12% del código). `material.css` solo aporta 1 006.
- `design-tokens.css` huérfano: define variables MD3 que nadie usa.
- `.btn.primary` con 4 paletas distintas (gris, gradient teal, gradient teal→sky, sólido azul Google).
- 7 rojos + 9 azules + 4 verdes en convivencia (Tailwind + teal industrial + Material).
- 425 selectores con prefijo `body.theme-industrial`; 404 con `appearance-light`; 328 con `dark-theme` → 3 ramas paralelas.
- Border-radius sin escala: `6, 8, 10, 11, 12, 14, 16, 18, 999px`.
- Llamado "material" pero usa FontAwesome.

---

## 2. Sistema MD3 (Fase 2)

### Arquitectura CSS objetivo
```
public/css/
├── tokens.css                  # ÚNICA fuente de verdad
├── base.css                    # reset + html/body + typography
├── components/
│   ├── buttons.css             # .btn unificado + 5 variantes
│   ├── cards.css
│   ├── tables.css
│   ├── forms.css
│   ├── modals.css
│   ├── toasts.css
│   ├── badges.css
│   ├── chips.css
│   └── states.css              # loading/empty/error/skeleton
├── layout/
│   ├── app-shell.css
│   └── responsive.css
└── modules/
    ├── dashboard.css
    └── usuarios.css
```

**Objetivo final post-Fase 4**: ≤80 KB total, <50 `!important`.

### Decisiones clave
1. **Iconos**: Material Symbols (Rounded, peso 400, fill 0/1 según estado) cargados desde Google Fonts. FontAwesome se conserva solo donde MS no tenga equivalente.
2. **Tema**: una sola raíz `[data-theme="light|dark"]` en `<html>`. Las 3 ramas actuales (`theme-industrial`, `appearance-light`, `dark-theme`) se eliminan en Fase 4.
3. **`window.prompt/confirm` → modales propios**: nuevo helper `openPromptModal()` migra las 19 ocurrencias.
4. **State layers MD3**: `::before` con opacidad 0.08 hover / 0.12 focus/active. Sin ripples JS.
5. **Tipografía**: Google Sans (Display + Headlines + Titles) + Roboto (Body + Labels). Ya cargadas en `<head>`.

### Tokens
Ver `public/css/tokens.css` para la implementación completa. Resumen:
- **Paleta tonal MD3** (Material You — primary `#1A73E8`, surface `#F8F9FA`, error `#B3261E`, etc.)
- **Type scale** Display/Headline/Title/Body/Label en 3 tamaños cada uno.
- **Elevation** 5 niveles (e1 hover botón → e5 dialog).
- **Shape** xs(4) sm(8) md(12) lg(16) xl(28) full(9999).
- **Spacing** 4-pt grid (1=4px, 2=8px, 3=12px, 4=16px, 6=24px, 8=32px, 12=48px).
- **Motion** standard, emphasized, decelerated, accelerated; durations short(150) medium(250) long(400).

### Estrategia de coexistencia (Fase 3 → Fase 4)
- Fase 3: nuevos CSS se cargan **DESPUÉS** de `material.css` para ganar por orden de cascada.
- Body recibe clase `md3-on` cuando se aplica el rediseño.
- Selectores nuevos usan `body.md3-on .X` (specificity 0,2,0) o más alto donde compita con `body.theme-industrial.appearance-light .X` (0,3,0).
- Fase 4: borrar `material.css`, `theme-industrial.css`; trocear `style.css` en módulos chicos consumiendo tokens. Ya sin batalla de especificidad.

---

## 3. Plan de implementación

### Fase 3 (esta sesión) — Referencia
1. Spec (este documento) + commit.
2. `tokens.css`, `base.css`.
3. 9 componentes en `components/`.
4. `dashboard.css`, `usuarios.css` en `modules/`.
5. `index.html` carga nuevos CSS + Material Symbols + clase `md3-on`.
6. `app.js`: `openPromptModal()` + migración de 9 `window.prompt/confirm` en panel Usuarios.
7. Cache busters bumped (SW v36, app.js?v=143).
8. Commit + push.
9. Verificación live + capturas comparativas.

### Fase 4 — Propagación
Aplicar `modules/{panel}.css` a los 20 paneles restantes en orden:
- Clientes, Refacciones, Máquinas, Cotizaciones (módulos centrales)
- Bitácora, Ventas, Reportes
- Garantías, Mantenimientos, Sin cobertura
- Bonos, Viajes, Personal, Tarifas, Técnicos
- Almacén, Prospección, Revisión Máquinas
- Auditoría, Categorías, Demo, Acerca

Cuando ≥18 paneles estén migrados: **borrar `material.css` y `theme-industrial.css`**, trocear `style.css`, finalizar Fase 4 con CSS objetivo (≤80 KB).

### Fase 5 — Funcional + correo
- Toasts en los 5 catches silenciosos (`maquinas`, `ventas`, `revision-maquinas`, `tarifas`, `tecnicos`).
- Migrar 10 `window.prompt/confirm` restantes (categorías, demo, cotizaciones).
- Borrar dead code identificado.
- Implementar 5 flujos de correo ausentes (priorizar: reset password + bienvenida + notif incidentes).
- Wrapper `safeSendMail()` con cola y log a tabla `email_log`.
- Reemplazar `createSimplePdfBuffer` por `pdfkit` o `pdf-lib` para adjuntos reales.

---

## 4. Métricas de éxito
- CSS total ≤ 80 KB (vs 344 actuales).
- `!important` ≤ 50 (vs 1 258 actuales).
- 0 `window.prompt`/`window.confirm` en el código (vs 19).
- 22/22 paneles funcionales sin error swallowing (vs 17/22).
- 11/11 flujos de correo cubiertos (vs 6/11).
- Lighthouse Accessibility ≥ 95 en al menos 5 paneles principales.
