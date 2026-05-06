# Design System — Gestor Administrativo / ERP Refacciones

Sistema visual **corporativo premium** (inspiración: Linear, Vercel Dashboard, Shopify Admin, Odoo 17).  
Stack de referencia: **Tailwind CSS v4/v3** + **shadcn/ui** (React). La app actual usa **HTML + CSS con variables**; los tokens abajo son la fuente única de verdad y mapean 1:1 a Tailwind.

---

## 1. Paleta de colores (HEX)

### Brand — primario / secundario
| Rol | HEX | Uso |
|-----|-----|-----|
| **Primary 600** | `#0d9488` | Botones primarios, links activos, acento principal (teal) |
| **Primary 700** | `#0f766e` | Hover primario, texto sobre superficies claras |
| **Primary 50** | `#f0fdfa` | Fondos de highlight suaves |
| **Secondary 600** | `#2563eb` | Acciones secundarias, datos “info”, gráficos 2 |
| **Secondary 50** | `#eff6ff` | Badges info / fondos azul muy suave |

### Neutros (background / surface / borde)
| Rol | HEX | Uso |
|-----|-----|-----|
| **Background** | `#f8fafc` | Fondo app (slate 50) |
| **Surface** | `#ffffff` | Cards, tablas, modales |
| **Surface muted** | `#f1f5f9` | Filas alternas, inputs deshabilitados |
| **Border** | `#e2e8f0` | Bordes por defecto |
| **Border strong** | `#cbd5e1` | Separadores fuertes |
| **Text primary** | `#0f172a` | Títulos y cuerpo principal |
| **Text secondary** | `#475569` | Subtítulos, labels |
| **Text muted** | `#64748b` | Placeholder, meta |

### Estados
| Estado | Base | Foreground | Uso |
|--------|------|------------|-----|
| **Success** | `#ecfdf5` | `#047857` | Guardado, stock OK, sync |
| **Warning** | `#fffbeb` | `#b45309` | Stock bajo, avisos |
| **Error** | `#fef2f2` | `#b91c1c` | Errores, eliminar, crítico |
| **Info** | `#eff6ff` | `#1d4ed8` | Tips, enlaces informativos |

### Acento adicional (data / charts)
- **Accent violet** `#6366f1` — series B, hover en tablas alternativas  
- **Accent amber** `#d97706` — KPIs, alertas no bloqueantes  

---

## 2. Tipografía

| Uso | Familia | Pesos | Tailwind |
|-----|---------|-------|----------|
| **UI / cuerpo** | **Plus Jakarta Sans** | 400, 500, 600, 700 | `font-sans` |
| **Display / marca** | **Syne** (opcional) | 600–800 | `font-display` |
| **Monospace** | `ui-monospace`, SF Mono, Consolas | 400 | `font-mono` (códigos, IDs) |

### Escala sugerida (rem)
- `text-xs` — 0.75rem — badges, meta tabla  
- `text-sm` — 0.875rem — celdas densas, filtros  
- `text-base` — 1rem — formularios, cuerpo  
- `text-lg` — 1.125rem — subtítulos de sección  
- `text-xl` — 1.25rem — títulos de card  
- `text-2xl` — 1.5rem — título de página  

**Line-height:** `leading-tight` títulos, `leading-normal` tablas, `leading-relaxed` lectura larga.

---

## 3. Espaciado, radios y sombras

- **Espaciado base:** escala 4px (Tailwind `1` = 4px). Paneles: `p-6`, tablas: `px-4 py-3` en celdas.  
- **Radius:** `rounded-lg` (8px) inputs/botones; `rounded-xl` (12px) cards; `rounded-2xl` (16px) shells principales; **full** para pills/badges.  
- **Sombras:**  
  - `shadow-sm` — inputs  
  - `shadow` — cards  
  - `shadow-lg` — modales, dropdowns  
- **Bordes:** `border border-slate-200`; focus `ring-2 ring-teal-500/20`.

---

## 4. Tabla refacciones — Tailwind (referencia React / JSX)

Copiar como base de componente con `Table`, `DropdownMenu` (shadcn). Clases equivalentes:

```tsx
<div className="rounded-2xl border border-slate-200/80 bg-white/80 shadow-lg shadow-slate-900/5 backdrop-blur-sm overflow-hidden">
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="sticky top-0 z-10 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/90 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
          <th className="px-4 py-3">Código</th>
          <th className="px-4 py-3">Descripción</th>
          <th className="px-4 py-3">Categoría</th>
          {/* ... */}
          <th className="sticky right-0 z-20 bg-slate-50 px-3 py-3 text-center shadow-[-8px_0_12px_-4px_rgba(15,23,42,0.08)]">Acciones</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        <tr className="transition hover:bg-slate-50/90 even:bg-slate-50/40">
          <td className="px-4 py-3 font-mono text-teal-700">125-GEAR</td>
          <td className="max-w-xs truncate px-4 py-3 text-slate-800">…</td>
          <td className="px-4 py-3">
            <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800">Línea</span>
            <span className="mx-1 text-slate-400">/</span>
            <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-600">Parte</span>
          </td>
          <td className="sticky right-0 bg-white px-2 py-2 text-center shadow-[-8px_0_12px_-4px_rgba(15,23,42,0.06)]">
            {/* DropdownMenu trigger: icono ⋮ */}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

**Precio:** `font-semibold tabular-nums text-teal-700`.  
**Stock crítico:** `text-amber-700 font-semibold` (no rojo puro salvo 0 crítico de negocio).

---

## 5. Design system global (componentes)

### Botones (shadcn: `Button` variant)
| Variant | Clases Tailwind típicas |
|---------|-------------------------|
| **primary** | `bg-teal-600 text-white hover:bg-teal-700 shadow-sm` |
| **secondary** | `bg-slate-100 text-slate-900 hover:bg-slate-200` |
| **outline** | `border border-slate-300 bg-white hover:bg-slate-50` |
| **ghost** | `hover:bg-slate-100 text-slate-700` |
| **danger** | `bg-red-600 text-white hover:bg-red-700` |
| **link** | `text-teal-700 underline-offset-4 hover:underline` |

### Cards
`rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm`

### Inputs / Select
`h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/25`

### Navbar / topbar
Altura ~56px, `border-b border-slate-200/80 bg-white/90 backdrop-blur`, logo + breadcrumbs + acciones usuario.

### Sidebar
Ancho 260px colapsable a 72px; ítem activo `bg-teal-50 text-teal-800 border-l-2 border-teal-600`.

### Filtros y búsqueda
Barra `flex gap-2 flex-wrap`; search con icono `pl-9`; chips de filtro activos con `rounded-full bg-slate-100`.

### Paginación
Botones `outline` pequeños; estado actual `bg-teal-600 text-white`.

### Empty state
Ilustración ligera + título `text-lg font-semibold` + CTA primario + texto muted.

---

## 6. shadcn/ui — mapeo rápido

| Pieza | Componente shadcn |
|-------|-------------------|
| Tabla premium | `Table` + `DropdownMenu` en acciones |
| Filtros | `Input`, `Select`, `Popover` + `Command` |
| Layout app | `Sidebar` + `Separator` |
| Formularios | `Form`, `Label`, `Input`, `Select`, `Checkbox` |
| Feedback | `Toast` (sonner), `Alert` |
| Modales | `Dialog`, `Sheet` (móvil) |

---

## 7. Migración a Tailwind + shadcn (recomendación)

1. Crear proyecto **Next.js** o **Vite + React** en carpeta `web/` (ya existe `web/` en algunos forks).  
2. `npx tailwindcss init` + instalar shadcn `npx shadcn@latest init`.  
3. Copiar tokens de `public/css/design-tokens.css` a `tailwind.config` theme.extend.colors.  
4. Migrar panel a panel: Refacciones → Cotizaciones → …  

Hasta entonces, **`design-tokens.css`** mantiene la misma marca en la app HTML actual.

---

## 8. Archivos en el repo

| Archivo | Contenido |
|---------|-----------|
| `public/css/design-tokens.css` | Variables `:root` (paleta + radius + sombras) |
| `public/css/design-system.css` | Utilidades `.ds-*` (menú fila, etc.) |
| `docs/DESIGN_SYSTEM.md` | Este documento |

---

*Última actualización: documento vivo — alinear con `design-tokens.css` al cambiar marca.*
