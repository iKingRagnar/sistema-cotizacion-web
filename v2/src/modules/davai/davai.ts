/**
 * DavAI — chat con SSE streaming.
 */
import { ensureShell, setPageTitle } from '@/components/app-shell';
import { getAuthToken } from '@/lib/auth';
import { escapeHtml } from '@/lib/data-table';

interface ChatMessage { role: 'user' | 'assistant'; content: string }

export async function renderDavai(): Promise<void> {
  const { main } = ensureShell();
  setPageTitle('DavAI');

  const history: ChatMessage[] = [];

  main.innerHTML = `
    <div class="card max-w-4xl mx-auto flex flex-col" style="height: calc(100vh - 160px)">
      <div class="flex items-center gap-3 pb-3 border-b border-[var(--border)] mb-3">
        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent-2 grid place-items-center text-white font-display font-bold">D</div>
        <div>
          <div class="font-display font-bold">DavAI</div>
          <div class="text-xs text-success">● Asistente IA</div>
        </div>
      </div>

      <div id="messages" class="flex-1 overflow-y-auto space-y-3 px-2">
        <div class="text-center py-8">
          <div class="text-4xl mb-2">🤖</div>
          <h3 class="font-display font-bold mb-1">¿En qué te ayudo?</h3>
          <p class="text-text-muted text-sm">Pregúntame sobre prospectos, cotizaciones, mensajes comerciales...</p>
        </div>
      </div>

      <form id="chat-form" class="pt-3 border-t border-[var(--border)] flex gap-2">
        <input
          id="chat-input"
          type="text"
          placeholder="Escribe tu mensaje..."
          class="input flex-1"
          autocomplete="off"
          required
        />
        <button type="submit" class="btn btn-primary" id="send-btn">Enviar</button>
      </form>
    </div>
  `;

  const messagesEl = main.querySelector<HTMLElement>('#messages')!;
  const form = main.querySelector<HTMLFormElement>('#chat-form')!;
  const input = main.querySelector<HTMLInputElement>('#chat-input')!;
  const sendBtn = main.querySelector<HTMLButtonElement>('#send-btn')!;

  function appendMessage(role: 'user' | 'assistant', text = ''): HTMLElement {
    /* Quitar empty state */
    const empty = messagesEl.querySelector('.text-center.py-8');
    if (empty) empty.remove();

    const wrap = document.createElement('div');
    wrap.className = role === 'user' ? 'flex justify-end' : 'flex justify-start';
    wrap.innerHTML = `
      <div class="max-w-[80%] px-4 py-2 rounded-lg ${role === 'user' ? 'bg-accent text-white' : 'bg-bg-elevated text-text border border-[var(--border)]'}">
        <div class="text-xs opacity-70 mb-1">${role === 'user' ? 'Tú' : 'DavAI'}</div>
        <div class="text-sm whitespace-pre-wrap" data-content>${escapeHtml(text)}</div>
      </div>
    `;
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return wrap.querySelector('[data-content]') as HTMLElement;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    appendMessage('user', message);
    history.push({ role: 'user', content: message });
    input.value = '';
    sendBtn.disabled = true;
    sendBtn.textContent = 'Pensando...';

    const aiNode = appendMessage('assistant', '');
    let fullText = '';

    try {
      const token = getAuthToken();
      const resp = await fetch('/api/davai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ message, history: history.slice(0, -1) }),
        credentials: 'include',
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: 'Error desconocido' }));
        aiNode.textContent = `❌ ${err.error || 'Error'}` + (err.detail ? ` · ${err.detail}` : '');
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const parsed = JSON.parse(raw);
            if (typeof parsed.text === 'string') {
              fullText += parsed.text;
              aiNode.textContent = fullText;
              messagesEl.scrollTop = messagesEl.scrollHeight;
            }
            if (parsed.error) aiNode.textContent = '❌ ' + parsed.error;
          } catch {}
        }
      }

      if (fullText) history.push({ role: 'assistant', content: fullText });
    } catch (err) {
      aiNode.textContent = '❌ ' + (err as Error).message;
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Enviar';
      input.focus();
    }
  });

  input.focus();
}
