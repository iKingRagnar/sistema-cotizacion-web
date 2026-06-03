'use strict';
// Middleware de validación con zod. Valida req[source] (por defecto el body) contra
// el schema dado. Si falla, responde 400 con los errores por campo SIN tocar la BD.
// Si pasa, sustituye req[source] por los datos ya parseados/normalizados por zod.
module.exports = function validate(schema, source = 'body') {
  return function (req, res, next) {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const detalles = result.error.issues.map((i) => ({
        campo: i.path.join('.') || '(raíz)',
        mensaje: i.message,
      }));
      return res.status(400).json({ error: 'Datos inválidos', detalles });
    }
    req[source] = result.data;
    next();
  };
};
