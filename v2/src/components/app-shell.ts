/**
 * App shell: sidebar nav + header + main slot.
 * Vanilla TS, sin Lit. Render una vez, los módulos solo updatean #main-content.
 */
import { getCurrentUser, clearAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { navigate } from '@/lib/router';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  group?: string;
  roles?: Array<'admin' | 'usuario' | 'consulta'>;
}

const NAV: NavItem[] = [
  { href: '#/', label: 'Dashboard', icon: '📊', group: 'main' },
  { href: '#/clientes', label: 'Clientes', icon: '👥', group: 'catalogos' },
  { href: '#/refacciones', label: 'Refacciones', icon: '🔧', group: 'catalogos' },
  { href: '#/categorias', label: 'Categorías', icon: '📂', group: 'catalogos' },
  { href: '#/maquinas', label: 'Máquinas', icon: '⚙️', group: 'catalogos' },
  { href: '#/cotizaciones', label: 'Cotizaciones', icon: '📄', group: 'operaciones' },
  { href: '#/ventas', label: 'Ventas', icon: '💰', group: 'operaciones' },
  { href: '#/prospeccion', label: 'Prospección', icon: '🎯', group: 'comercial' },
  { href: '#/revision-maquinas', label: 'Revisión Máq.', icon: '🔍', group: 'tecnico' },
  { href: '#/garantias', label: 'Garantías', icon: '🛡', group: 'tecnico' },
  { href: '#/mantenimientos', label: 'Mantenimientos', icon: '📅', group: 'tecnico' },
  { href: '#/sin-cobertura', label: 'Sin Cobertura', icon: '🚫', group: 'tecnico' },
  { href: '#/tarifas', label: 'Tarifas', icon: '💵', group: 'config' },
  { href: '#/personal', label: 'Personal', icon: '👷', group: 'rrhh' },
  { href: '#/bonos', label: 'Bonos', icon: '🎁', group: 'rrhh' },
  { href: '#/viajes', label: 'Viajes', icon: '✈️', group: 'rrhh' },
  { href: '#/bitacora', label: 'Bitácora horas', icon: '⏱', group: 'rrhh' },
  { href: '#/reportes', label: 'Reportes', icon: '📈', group: 'analytics' },
  { href: '#/usuarios', label: 'Usuarios', icon: '🔐', group: 'admin', roles: ['admin'] },
  { href: '#/audit', label: 'Auditoría', icon: '📋', group: 'admin', roles: ['admin'] },
];

const GROUP_LABELS: Record<string, string> = {
  main: 'Principal',
  catalogos: 'Catálogos',
  operaciones: 'Operaciones',
  comercial: 'Comercial',
  tecnico: 'Técnico',
  config: 'Configuración',
  rrhh: 'Recursos Humanos',
  analytics: 'Analytics',
  admin: 'Administración',
};

let shellRendered = false;

export function ensureShell(): { main: HTMLElement } {
  const app = document.getElementById('app')!;
  const user = getCurrentUser();

  if (!shellRendered) {
    app.innerHTML = `
      <div class="min-h-screen flex">
        <!-- SIDEBAR -->
        <aside id="sidebar" class="w-60 bg-bg-surface border-r border-[var(--border)] flex flex-col flex-shrink-0">
          <div class="p-4 border-b border-[var(--border)] flex items-center gap-2">
            <div class="w-9 h-9 rounded-md bg-gradient-to-br from-accent to-accent-2 grid place-items-center text-white font-display font-bold">ST</div>
            <div class="leading-tight">
              <div class="font-display font-bold text-sm">Servicio Técnico</div>
              <div class="text-[10px] text-text-muted uppercase tracking-wider">v2.0 · Estable</div>
            </div>
          </div>
          <nav id="sidebar-nav" class="flex-1 overflow-y-auto p-2 space-y-1"></nav>
          <div class="p-3 border-t border-[var(--border)] flex items-center justify-between">
            <div class="text-xs leading-tight">
              <div class="font-semibold text-text">${user?.nombreCompleto || user?.username || '—'}</div>
              <div class="text-text-muted">${user?.role || ''}</div>
            </div>
            <button id="logout-btn" class="btn-icon btn-ghost" title="Cerrar sesión">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            </button>
          </div>
        </aside>

        <!-- MAIN -->
        <div class="flex-1 flex flex-col min-w-0">
          <header class="h-14 bg-bg-surface border-b border-[var(--border)] flex items-center justify-between px-6">
            <h1 id="page-title" class="font-display font-bold text-lg">Dashboard</h1>
            <div class="text-xs text-text-muted font-mono">v2.0.0</div>
          </header>
          <main id="main-content" class="flex-1 overflow-auto p-6"></main>
        </div>
      </div>
    `;

    /* Render nav */
    const nav = document.getElementById('sidebar-nav')!;
    const items = NAV.filter((it) => !it.roles || (user && it.roles.includes(user.role)));
    const groups = new Map<string, NavItem[]>();
    for (const it of items) {
      const g = it.group || 'main';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(it);
    }

    nav.innerHTML = Array.from(groups.entries()).map(([g, list]) => `
      <div class="pt-2">
        <div class="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-dim">
          ${GROUP_LABELS[g] || g}
        </div>
        ${list.map((it) => `
          <a href="${it.href}" class="nav-link flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-text-soft hover:bg-[var(--bg-hover)] hover:text-text" data-href="${it.href}">
            <span>${it.icon}</span><span>${it.label}</span>
          </a>
        `).join('')}
      </div>
    `).join('');

    /* Logout */
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      try { await api.post('/api/auth/logout'); } catch {}
      clearAuth();
      navigate('#/login');
      shellRendered = false;
    });

    shellRendered = true;
  }

  /* Highlight active nav */
  const hash = location.hash || '#/';
  document.querySelectorAll<HTMLAnchorElement>('.nav-link').forEach((a) => {
    const isActive = a.dataset.href === hash;
    a.classList.toggle('bg-accent/10', isActive);
    a.classList.toggle('text-accent', isActive);
    a.classList.toggle('border-l-2', isActive);
    a.classList.toggle('border-accent', isActive);
  });

  return { main: document.getElementById('main-content')! };
}

export function setPageTitle(title: string): void {
  const el = document.getElementById('page-title');
  if (el) el.textContent = title;
  document.title = `${title} · Servicio Técnico v2`;
}

export function resetShell(): void {
  shellRendered = false;
}
