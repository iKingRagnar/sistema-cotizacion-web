/* ════════════════════════════════════════════════════════════════════════
 * prospeccion-supreme.js — NEUTRALIZADO en v120
 *
 * Razón: tenía setInterval(1000ms) corriendo PARA SIEMPRE. Aunque NO-OP en
 * cada tick, igual presionaba scheduler. Cache viejo del SW podía estar
 * sirviéndolo. Ahora literal vacío.
 * ════════════════════════════════════════════════════════════════════════ */
;(function () { 'use strict'; /* intentionally empty */ })();
