'use strict';
// Envuelve un handler async de Express y enruta cualquier rechazo de promesa al
// error handler central vía next(err). Elimina los try/catch repetidos por ruta.
//   app.get('/x', asyncHandler(async (req, res) => { ... }))
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
