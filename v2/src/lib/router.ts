/**
 * Router minimal hash-based con lazy loading por módulo.
 * Sin dependencias. Cambios de ruta = navigate('#/path').
 */
type RouteHandler = () => Promise<void> | void;

interface Route {
  pattern: string;             // ej: '#/clientes' o '#/clientes/:id'
  handler: RouteHandler;
  guard?: () => boolean;        // si retorna false, redirige a fallback
  fallback?: string;
}

const routes: Route[] = [];
let notFoundHandler: RouteHandler | null = null;
let currentParams: Record<string, string> = {};

export function defineRoute(route: Route): void {
  routes.push(route);
}

export function defineNotFound(handler: RouteHandler): void {
  notFoundHandler = handler;
}

export function navigate(path: string, replace = false): void {
  if (!path.startsWith('#')) path = '#' + path.replace(/^\//, '/');
  if (location.hash === path) {
    handleRoute(); // re-render
    return;
  }
  if (replace) location.replace(path);
  else location.hash = path;
}

export function getParam(name: string): string | undefined {
  return currentParams[name];
}

function matchRoute(hash: string): { route: Route; params: Record<string, string> } | null {
  for (const r of routes) {
    const params: Record<string, string> = {};
    const patternParts = r.pattern.split('/');
    const hashParts = hash.split('/');
    if (patternParts.length !== hashParts.length) continue;
    let ok = true;
    for (let i = 0; i < patternParts.length; i++) {
      const p = patternParts[i];
      const h = hashParts[i];
      if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(h);
      else if (p !== h) { ok = false; break; }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

async function handleRoute(): Promise<void> {
  const hash = location.hash || '#/';
  const match = matchRoute(hash);
  if (match) {
    if (match.route.guard && !match.route.guard()) {
      navigate(match.route.fallback || '#/login', true);
      return;
    }
    currentParams = match.params;
    try { await match.route.handler(); }
    catch (err) { console.error('[router] handler error:', err); }
  } else if (notFoundHandler) {
    await notFoundHandler();
  }
}

export function startRouter(): void {
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('DOMContentLoaded', handleRoute, { once: true });
  if (document.readyState !== 'loading') handleRoute();
}
