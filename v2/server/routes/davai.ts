/**
 * DavAI — chat endpoint con SSE streaming.
 * Soporta Anthropic Claude API y OpenAI como respaldo.
 */
import { Router } from 'express';
import { davaiChatSchema } from '../../shared/schemas.js';
import { requireAuth } from '../middleware/auth.js';
import { env } from '../env.js';
import { logger } from '../logger.js';

const router = Router();

const SYSTEM_PROMPT = `Eres DavAI, asistente del Sistema de Servicio Técnico Industrial.
Tu rol: ayudar al equipo a:
- Buscar prospectos en industrias específicas (México)
- Generar mensajes comerciales personalizados (email, WhatsApp, LinkedIn)
- Calcular cotizaciones y márgenes
- Sugerir próximas acciones de venta
- Analizar el pipeline comercial

Sé conciso, profesional y orientado a la acción. Responde en español.`;

router.post('/chat', requireAuth, async (req, res, next) => {
  try {
    const { message, history } = davaiChatSchema.parse(req.body);

    if (!env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY) {
      res.status(503).json({
        error: 'DavAI no configurado',
        detail: 'Configura ANTHROPIC_API_KEY o OPENAI_API_KEY en variables de entorno.',
      });
      return;
    }

    /* Setup SSE */
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const done = () => { res.write(`data: [DONE]\n\n`); res.end(); };

    try {
      if (env.ANTHROPIC_API_KEY) {
        await streamAnthropic({ message, history: history ?? [], send });
      } else if (env.OPENAI_API_KEY) {
        await streamOpenAI({ message, history: history ?? [], send });
      }
      done();
    } catch (err) {
      logger.error({ err }, 'DavAI stream error');
      send({ error: err instanceof Error ? err.message : 'Error desconocido' });
      res.end();
    }
  } catch (err) { next(err); }
});

interface StreamArgs {
  message: string;
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  send: (data: object) => void;
}

async function streamAnthropic({ message, history, send }: StreamArgs): Promise<void> {
  const messages = [
    ...history.filter((m) => m.role !== 'system'),
    { role: 'user', content: message },
  ];
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': env.ANTHROPIC_API_KEY!,
      'Anthropic-Version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      stream: true,
      messages,
    }),
  });
  if (!resp.ok || !resp.body) throw new Error(`Anthropic ${resp.status}`);

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
      if (!raw || raw === '[DONE]') continue;
      try {
        const parsed = JSON.parse(raw);
        const txt = parsed.delta?.text;
        if (typeof txt === 'string') send({ text: txt });
      } catch {}
    }
  }
}

async function streamOpenAI({ message, history, send }: StreamArgs): Promise<void> {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: message },
  ];
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      stream: true,
    }),
  });
  if (!resp.ok || !resp.body) throw new Error(`OpenAI ${resp.status}`);

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
      if (!raw || raw === '[DONE]') continue;
      try {
        const parsed = JSON.parse(raw);
        const txt = parsed.choices?.[0]?.delta?.content;
        if (typeof txt === 'string') send({ text: txt });
      } catch {}
    }
  }
}

export default router;
