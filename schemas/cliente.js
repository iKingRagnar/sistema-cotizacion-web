'use strict';
const { z } = require('zod');
// Schema de cliente — valida TIPOS sin transformar valores (no coerciona, para no
// corromper datos). Todos los campos opcionales y se permiten extra (passthrough):
// el objetivo es rechazar cuerpos claramente inválidos (no-objeto, campo de tipo
// equivocado) y dejar pasar intactos los payloads válidos del front.
const optStr = z.string().nullish(); // string | null | undefined

const clienteSchema = z.object({
  codigo: optStr,
  nombre: optStr,
  rfc: optStr,
  contacto: optStr,
  direccion: optStr,
  telefono: optStr,
  email: optStr,
  ciudad: optStr,
  constancia_url: optStr,
  constancia_nombre: optStr,
  constancia_thumb_url: optStr,
  constancia_clear: z.boolean().optional(),
}).passthrough();

module.exports = { clienteSchema };
