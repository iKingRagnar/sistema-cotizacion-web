import cors from 'cors';
import { env } from '../env.js';

const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

export const corsMiddleware = cors({
  origin(origin, cb) {
    // Permitir same-origin (sin header Origin) y los listados en ALLOWED_ORIGINS
    if (!origin) return cb(null, true);
    if (allowed.includes(origin)) return cb(null, true);
    cb(new Error(`Origin no permitido: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
