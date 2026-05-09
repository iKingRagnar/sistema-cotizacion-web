/**
 * Pantalla de login. Sin frameworks, vanilla TS + Tailwind.
 * Validación con Zod, llamada API type-safe.
 */
import { api, ApiException } from '@/lib/api';
import { saveAuth } from '@/lib/auth';
import { navigate } from '@/lib/router';
import { loginSchema } from '@shared/schemas';
import type { LoginResponse } from '@shared/types';

export async function renderLogin(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="min-h-screen grid place-items-center p-4 bg-gradient-to-br from-bg-deep via-bg-surface to-bg-elevated">
      <div class="card w-full max-w-md shadow-lg">
        <header class="text-center mb-6">
          <div class="w-14 h-14 mx-auto mb-3 rounded-xl bg-gradient-to-br from-accent to-accent-2 grid place-items-center text-white text-2xl font-display font-bold shadow-md">
            ST
          </div>
          <h1 class="font-display text-2xl font-bold tracking-tight">Servicio Técnico</h1>
          <p class="text-text-muted text-sm mt-1">Inicia sesión para continuar</p>
        </header>

        <form id="login-form" class="space-y-4" autocomplete="on">
          <label class="block">
            <span class="text-xs font-semibold uppercase tracking-wider text-text-soft">Usuario</span>
            <input
              type="text"
              name="username"
              class="input mt-1"
              placeholder="tu_usuario"
              required
              autocomplete="username"
              autofocus
            />
          </label>

          <label class="block">
            <span class="text-xs font-semibold uppercase tracking-wider text-text-soft">Contraseña</span>
            <input
              type="password"
              name="password"
              class="input mt-1"
              placeholder="••••••••"
              required
              autocomplete="current-password"
            />
          </label>

          <div id="login-error" class="hidden text-sm text-red-300 bg-danger/10 border border-danger/30 rounded-md px-3 py-2"></div>

          <button type="submit" class="btn btn-primary w-full" id="login-btn">
            Entrar al sistema
          </button>
        </form>

        <p class="text-xs text-text-dim text-center mt-6">
          v2.0 · Sin service worker · Sin freezes
        </p>
      </div>
    </div>
  `;

  const form = document.getElementById('login-form') as HTMLFormElement;
  const errorBox = document.getElementById('login-error') as HTMLDivElement;
  const btn = document.getElementById('login-btn') as HTMLButtonElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');

    const formData = new FormData(form);
    const parsed = loginSchema.safeParse({
      username: formData.get('username'),
      password: formData.get('password'),
    });

    if (!parsed.success) {
      errorBox.textContent = parsed.error.issues.map((i) => i.message).join(' · ');
      errorBox.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Verificando...';

    try {
      const res = await api.post<LoginResponse>('/api/auth/login', parsed.data);
      saveAuth(res);
      navigate('#/');
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : 'Error de conexión';
      errorBox.textContent = msg;
      errorBox.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Entrar al sistema';
    }
  });
}
