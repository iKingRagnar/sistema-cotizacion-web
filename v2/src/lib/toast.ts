/**
 * Toast notifications. Sin libs externas, sin animations infinitas.
 */
type ToastKind = 'success' | 'error' | 'warning' | 'info';

let container: HTMLDivElement | null = null;

function ensureContainer(): HTMLDivElement {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm';
  document.body.appendChild(container);
  return container;
}

const COLORS: Record<ToastKind, string> = {
  success: 'border-success bg-success/10 text-emerald-200',
  error: 'border-danger bg-danger/10 text-red-200',
  warning: 'border-warning bg-warning/10 text-amber-200',
  info: 'border-accent bg-accent/10 text-blue-200',
};

const ICONS: Record<ToastKind, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

export function toast(message: string, kind: ToastKind = 'info', duration = 3500): void {
  const c = ensureContainer();
  const el = document.createElement('div');
  el.className = `pointer-events-auto px-4 py-3 rounded-lg border ${COLORS[kind]} shadow-md text-sm flex items-start gap-3 transition-opacity`;
  el.innerHTML = `
    <span class="text-base font-bold">${ICONS[kind]}</span>
    <div class="flex-1 leading-snug">${message}</div>
    <button class="text-text-dim hover:text-text text-lg leading-none">×</button>
  `;
  const close = (): void => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector('button')?.addEventListener('click', close);
  c.appendChild(el);
  if (duration > 0) setTimeout(close, duration);
}
