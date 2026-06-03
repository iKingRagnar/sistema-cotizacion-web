'use strict';
/*
 * Generador del Manual de Usuario (PDF) — Sistema de Cotización Universal.
 * Usa pdfkit (sin navegador). Dibuja iconos vectoriales a mano y maqueta
 * portada, índice, flujo recomendado y una ficha por módulo con pasos y tips.
 *
 *   node scripts/generar-manual.js  ->  Manual-Usuario-Universal.pdf
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// ── Paleta de marca ───────────────────────────────────────────────────────
const C = {
  navy: '#0c1929',
  navy2: '#13233f',
  ink: '#1f2937',
  body: '#374151',
  muted: '#6b7280',
  gold: '#FFD200',
  blue: '#2a6df4',
  green: '#16a34a',
  red: '#e5484d',
  violet: '#7c3aed',
  teal: '#0ea5a4',
  line: '#e5e7eb',
  soft: '#f3f6fc',
  white: '#ffffff',
};

const ROOT = path.join(__dirname, '..');
const LOGO = path.join(ROOT, 'public', 'fondos', 'universal-logo.png');
// Se genera dentro de public/ para que sea descargable desde la propia app
// en /Manual-Usuario-Universal.pdf
const OUT = path.join(ROOT, 'public', 'Manual-Usuario-Universal.pdf');

const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true,
  info: { Title: 'Manual de Usuario · Sistema Universal', Author: 'Universal Servicio Técnico' } });
const W = doc.page.width;   // 595.28
const H = doc.page.height;  // 841.89
const M = 54;               // margen de contenido
const CW = W - M * 2;       // ancho de contenido

doc.pipe(fs.createWriteStream(OUT));

// ── Helpers de dibujo ───────────────────────────────────────────────────────
function bg(color) { doc.save(); doc.rect(0, 0, W, H).fill(color); doc.restore(); }

function roundCard(x, y, w, h, r, fill, stroke) {
  doc.save();
  doc.roundedRect(x, y, w, h, r);
  if (fill) doc.fillColor(fill).fill();
  if (stroke) { doc.lineWidth(1).strokeColor(stroke).stroke(); }
  doc.restore();
}

// Icono dentro de una insignia (rounded square de color). glyph = función que
// dibuja en un lienzo 0..size con trazo/relleno blanco.
function iconBadge(x, y, size, color, glyph) {
  doc.save();
  doc.roundedRect(x, y, size, size, size * 0.28).fillColor(color).fill();
  doc.save();
  doc.translate(x + size * 0.22, y + size * 0.22);
  const s = size * 0.56;
  doc.lineWidth(Math.max(1.4, s * 0.09)).strokeColor(C.white).fillColor(C.white);
  glyph(s);
  doc.restore();
  doc.restore();
}

// — glyphs (lienzo 0..s) —
const G = {
  home: (s) => { doc.moveTo(0, s * 0.5).lineTo(s * 0.5, 0).lineTo(s, s * 0.5).stroke();
    doc.rect(s * 0.15, s * 0.5, s * 0.7, s * 0.5).stroke(); },
  users: (s) => { doc.circle(s * 0.33, s * 0.3, s * 0.18).stroke();
    doc.circle(s * 0.72, s * 0.36, s * 0.14).stroke();
    doc.moveTo(s * 0.05, s).quadraticCurveTo(s * 0.33, s * 0.55, s * 0.62, s).stroke();
    doc.moveTo(s * 0.5, s).quadraticCurveTo(s * 0.74, s * 0.62, s * 0.98, s).stroke(); },
  target: (s) => { doc.circle(s * 0.5, s * 0.5, s * 0.46).stroke();
    doc.circle(s * 0.5, s * 0.5, s * 0.24).stroke();
    doc.circle(s * 0.5, s * 0.5, s * 0.05).fill(); },
  gear: (s) => { doc.circle(s * 0.5, s * 0.5, s * 0.26).stroke();
    for (let i = 0; i < 8; i++) { const a = (Math.PI / 4) * i;
      doc.moveTo(s * 0.5 + Math.cos(a) * s * 0.3, s * 0.5 + Math.sin(a) * s * 0.3)
         .lineTo(s * 0.5 + Math.cos(a) * s * 0.46, s * 0.5 + Math.sin(a) * s * 0.46).stroke(); } },
  industry: (s) => { doc.moveTo(0, s).lineTo(0, s * 0.45).lineTo(s * 0.4, s * 0.7).lineTo(s * 0.4, s * 0.45)
    .lineTo(s * 0.8, s * 0.7).lineTo(s * 0.8, s * 0.2).lineTo(s, s * 0.2).lineTo(s, s).lineTo(0, s).stroke(); },
  box: (s) => { doc.moveTo(s * 0.5, s * 0.05).lineTo(s, s * 0.28).lineTo(s, s * 0.72).lineTo(s * 0.5, s * 0.95)
    .lineTo(0, s * 0.72).lineTo(0, s * 0.28).lineTo(s * 0.5, s * 0.05).stroke();
    doc.moveTo(0, s * 0.28).lineTo(s * 0.5, s * 0.5).lineTo(s, s * 0.28).stroke();
    doc.moveTo(s * 0.5, s * 0.5).lineTo(s * 0.5, s * 0.95).stroke(); },
  doc: (s) => { doc.moveTo(s * 0.15, 0).lineTo(s * 0.7, 0).lineTo(s * 0.9, s * 0.2).lineTo(s * 0.9, s)
    .lineTo(s * 0.15, s).lineTo(s * 0.15, 0).stroke();
    [0.4, 0.56, 0.72].forEach((yy) => doc.moveTo(s * 0.3, s * yy).lineTo(s * 0.75, s * yy).stroke()); },
  cart: (s) => { doc.moveTo(0, s * 0.1).lineTo(s * 0.2, s * 0.1).lineTo(s * 0.32, s * 0.7).lineTo(s * 0.92, s * 0.7)
    .lineTo(s, s * 0.28).lineTo(s * 0.24, s * 0.28).stroke();
    doc.circle(s * 0.4, s * 0.92, s * 0.08).fill(); doc.circle(s * 0.82, s * 0.92, s * 0.08).fill(); },
  truck: (s) => { doc.rect(0, s * 0.3, s * 0.6, s * 0.4).stroke();
    doc.moveTo(s * 0.6, s * 0.45).lineTo(s * 0.85, s * 0.45).lineTo(s, s * 0.62).lineTo(s, s * 0.7).lineTo(s * 0.6, s * 0.7).stroke();
    doc.circle(s * 0.2, s * 0.74, s * 0.1).fill(); doc.circle(s * 0.82, s * 0.74, s * 0.1).fill(); },
  shield: (s) => { doc.moveTo(s * 0.5, 0).lineTo(s, s * 0.18).lineTo(s, s * 0.55)
    .quadraticCurveTo(s, s * 0.85, s * 0.5, s).quadraticCurveTo(0, s * 0.85, 0, s * 0.55).lineTo(0, s * 0.18).lineTo(s * 0.5, 0).stroke();
    doc.moveTo(s * 0.28, s * 0.5).lineTo(s * 0.45, s * 0.66).lineTo(s * 0.74, s * 0.32).stroke(); },
  wrench: (s) => { doc.moveTo(s * 0.95, s * 0.1).quadraticCurveTo(s * 0.55, s * 0.18, s * 0.55, s * 0.45)
    .lineTo(s * 0.1, s * 0.9).lineTo(s * 0.25, s).lineTo(s * 0.7, s * 0.55)
    .quadraticCurveTo(s * 0.95, s * 0.5, s * 0.95, s * 0.1).stroke(); },
  chart: (s) => { doc.moveTo(0, 0).lineTo(0, s).lineTo(s, s).stroke();
    [[0.2, 0.55], [0.45, 0.3], [0.7, 0.45]].forEach(([xx, yy], i) =>
      doc.rect(s * xx, s * yy, s * 0.12, s * (1 - yy)).fill()); },
  star: (s) => { const cx = s * 0.5, cy = s * 0.52, R = s * 0.5, r = s * 0.2; let p = [];
    for (let i = 0; i < 10; i++) { const ra = i % 2 ? r : R; const a = -Math.PI / 2 + i * Math.PI / 5;
      p.push([cx + Math.cos(a) * ra, cy + Math.sin(a) * ra]); }
    doc.moveTo(p[0][0], p[0][1]); p.slice(1).forEach((q) => doc.lineTo(q[0], q[1])); doc.lineTo(p[0][0], p[0][1]).fill(); },
  clock: (s) => { doc.circle(s * 0.5, s * 0.5, s * 0.46).stroke();
    doc.moveTo(s * 0.5, s * 0.5).lineTo(s * 0.5, s * 0.22).stroke();
    doc.moveTo(s * 0.5, s * 0.5).lineTo(s * 0.72, s * 0.58).stroke(); },
  user: (s) => { doc.circle(s * 0.5, s * 0.3, s * 0.2).stroke();
    doc.moveTo(s * 0.1, s).quadraticCurveTo(s * 0.5, s * 0.5, s * 0.9, s).stroke(); },
  tag: (s) => { doc.moveTo(s * 0.05, s * 0.5).lineTo(s * 0.5, s * 0.05).lineTo(s * 0.95, s * 0.05)
    .lineTo(s * 0.95, s * 0.5).lineTo(s * 0.5, s * 0.95).lineTo(s * 0.05, s * 0.5).stroke();
    doc.circle(s * 0.72, s * 0.28, s * 0.07).fill(); },
  list: (s) => { [0.15, 0.4, 0.65, 0.9].forEach((yy) => { doc.circle(s * 0.08, s * yy, s * 0.06).fill();
    doc.moveTo(s * 0.25, s * yy).lineTo(s, s * yy).stroke(); }); },
  bot: (s) => { doc.roundedRect(s * 0.1, s * 0.25, s * 0.8, s * 0.6, s * 0.12).stroke();
    doc.circle(s * 0.35, s * 0.55, s * 0.07).fill(); doc.circle(s * 0.65, s * 0.55, s * 0.07).fill();
    doc.moveTo(s * 0.5, s * 0.1).lineTo(s * 0.5, s * 0.25).stroke(); doc.circle(s * 0.5, s * 0.07, s * 0.05).fill(); },
  shieldUser: (s) => { doc.moveTo(s * 0.5, 0).lineTo(s, s * 0.18).lineTo(s, s * 0.55)
    .quadraticCurveTo(s, s * 0.85, s * 0.5, s).quadraticCurveTo(0, s * 0.85, 0, s * 0.55).lineTo(0, s * 0.18).lineTo(s * 0.5, 0).stroke(); },
};

let pageNo = 0;
function footer() {
  pageNo++;
  if (pageNo === 1) return; // portada sin footer
  doc.save();
  doc.fontSize(8).fillColor(C.muted).font('Helvetica');
  doc.text('Sistema de Cotización Universal · Manual de Usuario', M, H - 34, { width: CW, align: 'left' });
  doc.text(String(pageNo), M, H - 34, { width: CW, align: 'right' });
  doc.moveTo(M, H - 40).lineTo(W - M, H - 40).lineWidth(0.5).strokeColor(C.line).stroke();
  doc.restore();
}
function newPage() { doc.addPage(); footer(); }

// Encabezado de sección (barra navy con icono + título)
function sectionHeader(num, title, color, glyph) {
  const y = 64;
  roundCard(M, y, CW, 58, 14, C.navy);
  iconBadge(M + 12, y + 9, 40, color, glyph);
  doc.fillColor(C.gold).font('Helvetica-Bold').fontSize(11).text(num, M + 64, y + 13);
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(17).text(title, M + 64, y + 26);
  doc.y = y + 80;
}

function h(text, color) {
  doc.moveDown(0.3);
  doc.fillColor(color || C.ink).font('Helvetica-Bold').fontSize(12.5).text(text, M, doc.y);
  doc.moveDown(0.2);
}
function p(text) {
  doc.fillColor(C.body).font('Helvetica').fontSize(10.5).text(text, M, doc.y, { width: CW, lineGap: 2.5 });
  doc.moveDown(0.3);
}

// Pasos numerados (círculo dorado + texto)
function steps(arr) {
  arr.forEach((t, i) => {
    const y = doc.y;
    doc.save();
    doc.circle(M + 9, y + 7, 9).fillColor(C.blue).fill();
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(9).text(String(i + 1), M + 4, y + 3, { width: 10, align: 'center' });
    doc.restore();
    doc.fillColor(C.body).font('Helvetica').fontSize(10.5).text(t, M + 28, y, { width: CW - 28, lineGap: 2 });
    doc.moveDown(0.35);
  });
}

// Callout (tip / siguiente paso) con barra de acento
function callout(label, text, color) {
  const x = M, w = CW;
  const startY = doc.y + 4;
  doc.font('Helvetica-Bold').fontSize(9.5);
  const labelH = 12;
  doc.font('Helvetica').fontSize(10);
  const textH = doc.heightOfString(text, { width: w - 54, lineGap: 2 });
  const boxH = Math.max(34, labelH + textH + 16);
  roundCard(x, startY, w, boxH, 10, C.soft, C.line);
  doc.save(); doc.roundedRect(x, startY, 5, boxH, 2.5).fillColor(color).fill(); doc.restore();
  doc.fillColor(color).font('Helvetica-Bold').fontSize(9.5).text(label, x + 16, startY + 9);
  doc.fillColor(C.body).font('Helvetica').fontSize(10).text(text, x + 16, startY + 9 + labelH, { width: w - 30, lineGap: 2 });
  doc.y = startY + boxH + 8;
}

function ensureSpace(needed) { if (doc.y + needed > H - 60) newPage(); }

// ════════════════════════════════════════════════════════════════════════
// PORTADA
// ════════════════════════════════════════════════════════════════════════
bg(C.navy);
// franja superior dorada
doc.save(); doc.rect(0, 0, W, 8).fill(C.gold); doc.restore();
// logo
try { doc.image(LOGO, W / 2 - 55, 150, { width: 110 }); } catch (_) {}
doc.fillColor(C.white).font('Helvetica-Bold').fontSize(34).text('Manual de Usuario', 0, 300, { align: 'center', width: W });
doc.fillColor(C.gold).font('Helvetica-Bold').fontSize(16).text('Sistema de Cotización Universal', 0, 344, { align: 'center', width: W });
doc.fillColor('#9fb3d1').font('Helvetica').fontSize(12).text('Servicio Técnico · Guía completa paso a paso', 0, 372, { align: 'center', width: W });
// tarjeta inferior
roundCard(M, 470, CW, 150, 16, C.navy2);
doc.fillColor(C.white).font('Helvetica-Bold').fontSize(12).text('Lo que aprenderás', M + 24, 492);
doc.fillColor('#c7d4ea').font('Helvetica').fontSize(10.5);
doc.text('•  Cómo entrar y moverte sin perderte', M + 24, 514, { width: CW - 48, lineGap: 4 });
doc.text('•  El flujo recomendado: de cliente a cotización a venta', M + 24, doc.y, { width: CW - 48, lineGap: 4 });
doc.text('•  Cada módulo explicado con pasos y consejos', M + 24, doc.y, { width: CW - 48, lineGap: 4 });
doc.text('•  Uso en celular y atajos útiles', M + 24, doc.y, { width: CW - 48, lineGap: 4 });
const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
doc.fillColor('#7e93b5').font('Helvetica').fontSize(9).text('Generado el ' + fecha, 0, 640, { align: 'center', width: W });
doc.save(); doc.rect(0, H - 8, W, 8).fill(C.gold); doc.restore();

// ════════════════════════════════════════════════════════════════════════
// ÍNDICE
// ════════════════════════════════════════════════════════════════════════
newPage();
doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(22).text('Índice', M, 70);
doc.moveTo(M, 100).lineTo(W - M, 100).lineWidth(2).strokeColor(C.gold).stroke();
doc.y = 120;
const toc = [
  '1.  Primeros pasos: entrar al sistema',
  '2.  El flujo recomendado (mapa general)',
  '3.  Inicio / Tablero',
  '4.  Clientes',
  '5.  Prospección',
  '6.  Refacciones',
  '7.  Máquinas',
  '8.  Catálogos',
  '9.  Cotizaciones',
  '10. Ventas',
  '11. Viajes',
  '12. Garantías',
  '13. Revisión de máquinas',
  '14. Bonos y comisiones',
  '15. Personal',
  '16. Tarifas',
  '17. Bitácora de horas',
  '18. Reportes',
  '19. Usuarios y permisos',
  '20. El asistente DavAI',
  '21. Uso en celular',
  '22. Consejos finales',
];
toc.forEach((t) => {
  doc.fillColor(C.body).font('Helvetica').fontSize(11.5).text(t, M + 6, doc.y, { lineGap: 6 });
  doc.moveDown(0.25);
});

// ════════════════════════════════════════════════════════════════════════
// 1. PRIMEROS PASOS
// ════════════════════════════════════════════════════════════════════════
newPage();
sectionHeader('PASO 1', 'Primeros pasos: entrar al sistema', C.blue, G.shieldUser);
p('Abre el sistema desde tu navegador. Verás una pantalla de inicio de sesión con tu logo. Escribe tu usuario y contraseña y pulsa Entrar.');
h('Cómo iniciar sesión');
steps([
  'Escribe tu Usuario (te lo da el administrador).',
  'Escribe tu Contraseña.',
  'Pulsa el botón Entrar. Si los datos son correctos, entras al Tablero.',
  'Para salir, abre tu menú de cuenta (arriba a la derecha) y elige Cerrar sesión.',
]);
callout('CONSEJO', 'Si te equivocas de contraseña varias veces, el sistema espera unos minutos por seguridad. Respira y vuelve a intentar; no se bloquea para siempre.', C.gold);
callout('SIGUIENTE PASO', 'Una vez dentro, ve al Tablero para tener la foto general, y luego registra tu primer Cliente.', C.green);

// ════════════════════════════════════════════════════════════════════════
// 2. FLUJO RECOMENDADO (diagrama)
// ════════════════════════════════════════════════════════════════════════
newPage();
sectionHeader('MAPA', 'El flujo recomendado', C.violet, G.target);
p('Para no perderte, sigue este orden natural. Cada paso alimenta al siguiente:');
const flow = [
  ['Cliente', C.blue, G.users],
  ['Máquina', C.teal, G.industry],
  ['Cotización', C.gold, G.doc],
  ['Venta', C.green, G.cart],
  ['Garantía', C.violet, G.shield],
];
let fx = M, fy = doc.y + 10;
const bw = (CW - 4 * 18) / 5;
flow.forEach((f, i) => {
  roundCard(fx, fy, bw, 86, 12, C.soft, C.line);
  iconBadge(fx + bw / 2 - 17, fy + 12, 34, f[1], f[2]);
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(9).text(f[0], fx, fy + 58, { width: bw, align: 'center' });
  if (i < flow.length - 1) {
    const ax = fx + bw + 4;
    doc.save().fillColor(C.muted).font('Helvetica-Bold').fontSize(16).text('>', ax, fy + 32, { width: 10 }).restore();
  }
  fx += bw + 18;
});
doc.y = fy + 110;
p('En palabras simples: primero das de alta al Cliente y sus Máquinas. Cuando te piden precio, creas una Cotización con refacciones y servicios. Si la aprueban, se vuelve Venta. Y si aplica, registras la Garantía. Todo queda conectado y se refleja en Reportes.');
callout('CONSEJO', 'No tienes que llenar todo de una vez. Puedes guardar y volver después; el sistema conserva tu información.', C.gold);

// ════════════════════════════════════════════════════════════════════════
// Fichas de módulos (helper)
// ════════════════════════════════════════════════════════════════════════
function modulo(num, titulo, color, glyph, paraQue, pasos, tip, siguiente) {
  newPage();
  sectionHeader(num, titulo, color, glyph);
  h('¿Para qué sirve?');
  p(paraQue);
  h('Paso a paso');
  steps(pasos);
  ensureSpace(70);
  if (tip) callout('CONSEJO', tip, C.gold);
  if (siguiente) callout('SIGUIENTE PASO', siguiente, C.green);
}

modulo('3', 'Inicio / Tablero', C.blue, G.home,
  'Es tu pantalla principal. Muestra de un vistazo cuántos clientes, cotizaciones y refacciones tienes, el valor de tus cotizaciones y alertas (por ejemplo, refacciones con poco stock).',
  ['Al entrar, llegas aquí automáticamente.',
   'Lee las tarjetas de resumen (KPIs) para saber cómo va todo.',
   'Usa los accesos a módulos para ir a la sección que necesites.'],
  'Revisa el Tablero al iniciar tu día: te dice rápidamente qué necesita atención.',
  'Entra a Clientes para registrar o buscar a quién vas a atender.');

modulo('4', 'Clientes', C.blue, G.users,
  'Aquí guardas a tus clientes: razón social, RFC, contacto, teléfono, correo y ciudad. Es la base de todo lo demás.',
  ['Pulsa "Nuevo cliente".',
   'Llena los datos (al menos el nombre/razón social).',
   'Si tienes su constancia fiscal, puedes adjuntarla.',
   'Guarda. El cliente aparece en la lista y ya puedes cotizarle.'],
  'Usa el buscador para encontrar un cliente al instante por nombre, RFC o ciudad.',
  'Registra las Máquinas de ese cliente para tenerlas listas al cotizar.');

modulo('5', 'Prospección', C.teal, G.target,
  'Para clientes potenciales (aún no son clientes formales). Llevas su empresa, contacto, ciudad y el potencial de venta estimado.',
  ['Entra a Prospección y pulsa "Nuevo prospecto".',
   'Anota empresa, contacto y datos de ubicación.',
   'Registra el potencial estimado y notas de seguimiento.',
   'Cuando se concrete, pásalo a Clientes.'],
  'Usa las notas para recordar acuerdos y la fecha del próximo contacto.',
  'Cuando un prospecto acepte, créalo como Cliente y cotízale.');

modulo('6', 'Refacciones', C.gold, G.gear,
  'Tu catálogo de refacciones: número de parte, descripción, marca, proveedor, precios (MXN/USD), stock y stock mínimo.',
  ['Pulsa "Nueva refacción".',
   'Captura número de parte, descripción y precios.',
   'Indica el stock actual y el stock mínimo para recibir alertas.',
   'Puedes agregar una foto de la pieza.'],
  'Mantén el stock mínimo bien puesto: el Tablero te avisará cuando algo esté por agotarse.',
  'Con tus refacciones cargadas, podrás agregarlas a las Cotizaciones en segundos.');

modulo('7', 'Máquinas', C.teal, G.industry,
  'El catálogo de máquinas/equipos, normalmente ligadas a un cliente: modelo, número de serie, categoría y ubicación.',
  ['Pulsa "Nueva máquina".',
   'Captura modelo y número de serie.',
   'Asóciala al cliente correspondiente.',
   'Agrega foto y ubicación si las tienes.'],
  'Tener la máquina bien identificada agiliza las cotizaciones y las garantías.',
  'Ya puedes crear una Cotización para el cliente y su máquina.');

modulo('8', 'Catálogos', C.violet, G.box,
  'Listas maestras que el sistema reutiliza (categorías, tipos y datos base). Te ahorran escribir lo mismo muchas veces.',
  ['Entra a Catálogos.',
   'Elige la lista que quieras ajustar.',
   'Agrega, edita o elimina elementos.',
   'Los cambios se reflejan en los formularios de toda la app.'],
  'Configura bien tus catálogos al inicio: todo lo demás se llena más rápido después.',
  'Con los catálogos listos, captura más ágil en Refacciones y Máquinas.');

modulo('9', 'Cotizaciones', C.gold, G.doc,
  'El corazón del sistema. Creas una cotización para un cliente, agregas partidas (refacciones, mano de obra, servicios), y el sistema calcula subtotales, IVA y total.',
  ['Pulsa "Nueva cotización" y elige el cliente.',
   'Agrega partidas: busca refacciones o captura servicios/mano de obra.',
   'Revisa cantidades y precios; el total se calcula solo.',
   'Guarda. Puedes ver la Vista previa e imprimir/PDF para enviarla.',
   'Cuando el cliente apruebe, aplícala para convertirla en Venta.'],
  'Usa el botón de Vista previa (icono de ojo) antes de enviar, para revisar cómo se verá el PDF.',
  'Si la aprueban, ve a aplicar la cotización; pasará a Ventas y descontará stock.');

modulo('10', 'Ventas', C.green, G.cart,
  'Las cotizaciones aprobadas/aplicadas. Aquí ves lo vendido, con su factura, fecha, total y si está pagado.',
  ['Entra a Ventas para ver el historial.',
   'Filtra por cliente o por mes.',
   'Marca el estado de pago cuando corresponda.',
   'Consulta el detalle de cada venta cuando lo necesites.'],
  'Mantén al día el estado "Pagado": tus Reportes saldrán correctos.',
  'Revisa Reportes para ver totales y comisiones del periodo.');

modulo('11', 'Viajes', C.teal, G.truck,
  'Registra los viajes/visitas técnicas asociados al servicio: a dónde, cuándo y para qué.',
  ['Entra a Viajes y crea uno nuevo.',
   'Indica destino, fecha y motivo.',
   'Relaciónalo con el cliente o servicio.',
   'Guarda para tener el historial de desplazamientos.'],
  'Llevar los viajes ordenados ayuda a cobrar traslados y a planear rutas.',
  'Anota las horas trabajadas en la Bitácora.');

modulo('12', 'Garantías', C.violet, G.shield,
  'Controla las garantías de las máquinas: cliente, equipo, número de serie, fecha de inicio y fin, y si sigue activa.',
  ['Entra a Garantías y pulsa "Nueva".',
   'Selecciona cliente y máquina.',
   'Captura fecha de inicio y de fin.',
   'Guarda; el sistema te ayuda a ver cuáles siguen vigentes.'],
  'Revisa periódicamente las garantías por vencer para avisar al cliente a tiempo.',
  'Si una máquina falla en garantía, regístralo en Revisión de máquinas.');

modulo('13', 'Revisión de máquinas', C.red, G.wrench,
  'El registro de incidentes/revisiones técnicas: modelo, número de serie, pruebas realizadas, si se entregó y comentarios.',
  ['Crea una nueva revisión.',
   'Identifica la máquina (modelo y serie).',
   'Anota las pruebas hechas y los comentarios.',
   'Marca si ya se entregó al cliente.'],
  'Sé detallado en los comentarios: son tu respaldo ante cualquier reclamo.',
  'Si la revisión deriva en trabajo cobrable, genera una Cotización.');

modulo('14', 'Bonos y comisiones', C.gold, G.star,
  'Calcula y registra bonos/comisiones del personal de ventas según lo vendido y las tarifas configuradas.',
  ['Asegúrate de que las Ventas estén bien registradas.',
   'Revisa la sección de Bonos para ver los cálculos.',
   'Verifica los porcentajes contra tus Tarifas.',
   'Usa la información para pagar comisiones del periodo.'],
  'Las comisiones dependen de Tarifas y de marcar correctamente a los vendedores en Personal.',
  'Ajusta porcentajes en Tarifas si cambian tus reglas de comisión.');

modulo('15', 'Personal', C.blue, G.user,
  'Tu equipo: técnicos y vendedores, con su puesto, rol, datos de contacto y, para vendedores, sus porcentajes de comisión.',
  ['Entra a Personal y pulsa "Nuevo".',
   'Captura nombre, puesto y datos de contacto.',
   'Si es vendedor, márcalo como tal (solo el administrador puede).',
   'Guarda.'],
  'Solo el administrador puede marcar a alguien como vendedor o cambiar comisiones (por seguridad).',
  'Define las Tarifas para que los cálculos de comisión sean correctos.');

modulo('16', 'Tarifas', C.gold, G.tag,
  'Los valores base del negocio: porcentajes de comisión, tarifas de mano de obra y bonos. El sistema los usa en cálculos.',
  ['Entra a Tarifas.',
   'Ajusta los porcentajes y montos según tus reglas.',
   'Guarda los cambios.',
   'Verás el efecto en Cotizaciones y Bonos.'],
  'Cambia las tarifas con cuidado: afectan cálculos de toda la app.',
  'Con tarifas correctas, tus Cotizaciones y Comisiones saldrán exactas.');

modulo('17', 'Bitácora de horas', C.teal, G.clock,
  'El registro de horas trabajadas: fecha, cliente, trabajo realizado, hora de inicio y fin.',
  ['Crea un registro de bitácora.',
   'Anota la fecha y el cliente.',
   'Captura hora de inicio y fin del trabajo.',
   'Describe el trabajo realizado.'],
  'Registra las horas el mismo día: es más fácil y más exacto.',
  'Usa la bitácora como respaldo al cobrar mano de obra en una Cotización.');

modulo('18', 'Reportes', C.blue, G.chart,
  'Resúmenes y exportaciones: ventas, comisiones y datos por periodo. Puedes descargar en Excel/CSV y generar reportes mensuales.',
  ['Entra a Reportes.',
   'Elige el tipo de reporte y el periodo.',
   'Visualiza los totales.',
   'Descarga en Excel/CSV o envía el reporte mensual por correo.'],
  'El reporte mensual puede enviarse automáticamente por correo si lo configuras.',
  'Usa los reportes para tomar decisiones y cerrar el mes.');

modulo('19', 'Usuarios y permisos', C.violet, G.shieldUser,
  'Solo para administradores. Creas las cuentas de tu equipo y defines qué puede ver/hacer cada uno (administrador, operador, usuario, consulta).',
  ['Entra a Usuarios (requiere ser administrador).',
   'Pulsa "Nuevo usuario" y asigna un rol.',
   'Comparte la contraseña inicial de forma segura.',
   'Pide a cada persona cambiar su contraseña al primer ingreso.'],
  'Da el menor permiso necesario a cada quien: "consulta" para quien solo mira, "operador" para quien captura.',
  'Revisa Auditoría para ver quién hizo qué cambios.');

modulo('20', 'El asistente DavAI', C.teal, G.bot,
  'Un asistente con inteligencia artificial integrado para ayudarte: responder dudas y apoyar en tareas dentro del sistema.',
  ['Abre el asistente desde su botón flotante.',
   'Escribe tu pregunta o pídele ayuda con una tarea.',
   'Sigue sus sugerencias dentro del sistema.'],
  'Pídele cosas concretas ("ayúdame a cotizar este documento") para mejores resultados.',
  'Combina DavAI con los módulos: él te guía, tú confirmas y guardas.');

// ════════════════════════════════════════════════════════════════════════
// 21. CELULAR
// ════════════════════════════════════════════════════════════════════════
newPage();
sectionHeader('21', 'Uso en celular', C.green, G.user);
p('El sistema tiene una versión móvil optimizada. Al abrirlo desde el teléfono, se ajusta automáticamente.');
h('Lo que puedes hacer en el celular');
steps([
  'Iniciar sesión con tu mismo usuario y contraseña.',
  'Consultar clientes, máquinas, refacciones, cotizaciones, ventas y más.',
  'Buscar rápido con el buscador de cada sección.',
  'Ver el detalle de cada registro con un toque.',
]);
callout('CONSEJO', 'Puedes "instalar" la app en tu pantalla de inicio desde el menú del navegador para abrirla como una aplicación.', C.gold);
callout('NOTA', 'La versión móvil está pensada para consultar en campo. Para capturar y editar a fondo, usa la versión de escritorio (hay un acceso directo en el menú de cuenta).', C.blue);

// ════════════════════════════════════════════════════════════════════════
// 22. CONSEJOS FINALES
// ════════════════════════════════════════════════════════════════════════
newPage();
sectionHeader('22', 'Consejos finales', C.gold, G.star);
h('Para sacarle el máximo provecho');
steps([
  'Sigue el flujo: Cliente → Máquina → Cotización → Venta → Garantía.',
  'Mantén tus catálogos y tarifas al día; todo lo demás se vuelve más rápido.',
  'Usa el buscador en cada lista en vez de desplazarte.',
  'Pasa el cursor sobre los iconos: te dicen qué hace cada botón.',
  'Revisa el Tablero a diario para detectar alertas a tiempo.',
  'Cambia tu contraseña periódicamente y no la compartas.',
]);
callout('RECUERDA', 'No tienes que aprenderlo todo de golpe. Empieza por Clientes y Cotizaciones; el resto se va sumando con el uso.', C.green);
doc.moveDown(1.2);
doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(13).text('¡Listo! Ya tienes lo necesario para usar el sistema con confianza.', M, doc.y, { width: CW, align: 'center' });

doc.end();
console.log('Manual generado en: ' + OUT);
