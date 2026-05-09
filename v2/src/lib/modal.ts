/**
 * Modal helper minimalista. Sin animations infinitas, ESC + click backdrop cierran.
 *
 * Uso:
 *   const close = openModal({ title: 'Editar', body: htmlString, onClose: () => {} });
 *   close();  // cierra programáticamente
 */
export interface OpenModalOpts {
  title: string;
  body: string | HTMLElement;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onMount?: (root: HTMLElement) => void;
  onClose?: () => void;
}

const SIZE_CLASS: Record<string, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

export function openModal(opts: OpenModalOpts): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60';
  overlay.style.opacity = '0';

  const sizeClass = SIZE_CLASS[opts.size ?? 'md'];

  const panel = document.createElement('div');
  panel.className = `card w-full ${sizeClass} max-h-[90vh] flex flex-col shadow-lg`;
  panel.addEventListener('click', (e) => e.stopPropagation());

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between pb-3 border-b border-[var(--border)] mb-4';
  header.innerHTML = `
    <h3 class="font-display text-lg font-bold">${opts.title}</h3>
    <button class="btn-icon btn-ghost text-2xl leading-none" aria-label="Cerrar">×</button>
  `;

  const body = document.createElement('div');
  body.className = 'flex-1 overflow-y-auto pr-1';
  if (typeof opts.body === 'string') body.innerHTML = opts.body;
  else body.appendChild(opts.body);

  panel.append(header, body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  /* Fade in */
  requestAnimationFrame(() => { overlay.style.transition = 'opacity 150ms'; overlay.style.opacity = '1'; });

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      opts.onClose?.();
    }, 150);
  };

  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', close);
  header.querySelector('button')?.addEventListener('click', close);

  opts.onMount?.(panel);
  return close;
}

export async function confirmDialog(message: string, opts?: { title?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const close = openModal({
      title: opts?.title ?? '¿Confirmar?',
      size: 'sm',
      body: `
        <p class="text-text-soft">${message}</p>
        <div class="flex justify-end gap-2 mt-6">
          <button class="btn" data-act="cancel">Cancelar</button>
          <button class="btn ${opts?.danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">Confirmar</button>
        </div>
      `,
      onMount: (root) => {
        root.querySelector('[data-act="cancel"]')?.addEventListener('click', () => { close(); resolve(false); });
        root.querySelector('[data-act="ok"]')?.addEventListener('click', () => { close(); resolve(true); });
      },
      onClose: () => resolve(false),
    });
  });
}
