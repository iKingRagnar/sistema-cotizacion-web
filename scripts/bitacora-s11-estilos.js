/**
 * Restaura Bitácora S11 con formato profesional (ExcelJS) y datos 24–27 mar 2026.
 * Uso: node scripts/bitacora-s11-estilos.js
 */
const path = require('path');
const ExcelJS = require('exceljs');

const BITACORA = path.join(__dirname, '..', '..', '..', 'Bitacora.xlsx');
const SHEET = 'Bitácora S11';

const C = {
  titleBlue: 'FF1E3A5F',
  headerBlue: 'FF1E3A5F',
  headerText: 'FFFFFFFF',
  totalBar: 'FFDCE6F7',
  border: 'FFB4C6E7',
  zebra1: 'FFF2F8FF',
  zebra2: 'FFFFFFFF',
};

const RESP = 'Luis Alberto Peña Cantú';
const TOTAL = 39.5;

function thinBorder(color = C.border) {
  return {
    top: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  };
}

const ROWS = [
  ['24/03/2026', '08:30', '12:15', 3.75, 'Sistema Cotización Web (Gestor administrativo) — Render / Turso', 'Cotización en PDF: orden de columnas (código, descripción, cantidad), referencias USD/MXN y subtotales en la moneda de la cotización.', 'Plantilla de PDF lista para presentación a cliente.', 'Desarrollo y pruebas con asistencia IA (Cursor).', RESP],
  ['24/03/2026', '13:00', '17:45', 4.75, 'Sistema Cotización Web (Gestor administrativo) — Render / Turso', 'Ajustes al PDF, validación de totales, pruebas de impresión y descarga; despliegue en Render.', 'PDF estable en producción; assets versionados (?v=) y service worker actualizado.', 'Control de caché del navegador para QA.', RESP],
  ['24/03/2026', '18:00', '19:30', 1.5, 'Sistema Cotización Web (Gestor administrativo) — Render / Turso', 'Seguimiento post-deploy y verificación en entorno publicado.', 'Comportamiento confirmado en producción.', '', RESP],
  ['25/03/2026', '08:15', '12:45', 4.5, 'Sistema Cotización Web (Gestor administrativo) — Render / Turso', 'Interfaz: cursor y apariencia “solo lectura” en tablas (CSS global, encabezados, fila de filtros, tema claro/oscuro).', 'Menos sensación de campo editable en zonas no interactivas.', 'Iteración según feedback de uso.', RESP],
  ['25/03/2026', '14:00', '19:30', 5.5, 'Sistema Cotización Web (Gestor administrativo) — Render / Turso', 'Tablas de datos: selección y refuerzo con eventos; columna Acciones (iconos) sin cursor de texto indebido.', 'Experiencia de grilla más acorde a producto empresarial.', 'Balance: permitir copiar texto en celdas de datos donde aplica.', RESP],
  ['26/03/2026', '08:30', '13:00', 4.5, 'Sistema Cotización Web (Gestor administrativo) — Render / Turso', 'Audio de fondo: HTMLAudioElement, bucle, volumen por defecto bajo, preferencias en localStorage (silencio/volumen).', 'Reproducción continua al cambiar pestañas internas del gestor (SPA).', 'visibilitychange para reanudar; autoplay desbloqueado con gesto del usuario.', RESP],
  ['26/03/2026', '14:30', '19:15', 4.75, 'Sistema Cotización Web (Gestor administrativo) — Render / Turso', 'Integración del audio en public/, atajos de volumen y control en el encabezado.', 'Experiencia de audio homogénea; CACHE_NAME del service worker ante cambios JS/CSS.', 'Patrón documentado en reglas del workspace.', RESP],
  ['27/03/2026', '08:00', '12:30', 4.5, 'Sistema Cotización Web (Gestor administrativo) — Render / Turso', 'Bitácora de horas: columnas Horas, Materiales y Estado (col-no-ibeam) en cabecera, filtros y celdas.', 'Cursor de texto solo donde corresponde; filtros siguen editables.', 'Alcance acotado a la tabla de bitácora.', RESP],
  ['27/03/2026', '14:00', '18:45', 4.75, 'Sistema Cotización Web (Gestor administrativo) — Render / Turso', 'Servidor: nodemailer opcional, intervalos y rutas de mantenimiento/alertas; pantallas de módulos alineadas al despliegue.', 'Backend alineado a operación y notificaciones según configuración.', 'Variables de entorno y pruebas según .env.', RESP],
  ['27/03/2026', '19:00', '20:00', 1, 'Sistema Cotización Web (Gestor administrativo) — Render / Turso', 'Control de versiones: commits y push a rama main; pruebas con recarga forzada del cliente.', 'Código integrado en remoto; listo para validación del cliente.', '', RESP],
];

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(BITACORA);

  const existing = wb.getWorksheet(SHEET);
  if (existing) wb.removeWorksheet(existing.id);

  const ws = wb.addWorksheet(SHEET, {
    views: [{ showGridLines: true }],
    properties: { defaultRowHeight: 18 },
  });

  ws.mergeCells('A1:F1');
  const t1 = ws.getCell('A1');
  t1.value = 'BITÁCORA DE ACTIVIDADES Y DESARROLLO TÉCNICO';
  t1.font = { name: 'Calibri', size: 16, bold: true, color: { argb: C.titleBlue } };
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('G1:I1');
  const w1 = ws.getCell('G1');
  w1.value = '24–27 marzo 2026';
  w1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: C.titleBlue } };
  w1.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('A2:I2');
  const t2 = ws.getCell('A2');
  t2.value = 'Área: Automatización, Business Intelligence y sistemas web internos';
  t2.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF445566' } };
  t2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.getRow(3).height = 6;

  for (let c = 1; c <= 9; c++) {
    const cell = ws.getCell(4, c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.totalBar } };
    cell.border = thinBorder();
  }
  ws.getCell('A4').value = 'TOTAL HORAS:';
  ws.getCell('A4').font = { name: 'Calibri', bold: true, size: 11 };
  ws.getCell('A4').alignment = { vertical: 'middle' };
  ws.getCell('D4').value = TOTAL;
  ws.getCell('D4').numFmt = '0.0';
  ws.getCell('D4').font = { name: 'Calibri', bold: true, size: 12, color: { argb: C.titleBlue } };
  ws.getCell('D4').alignment = { horizontal: 'center', vertical: 'middle' };

  const headers = [
    'Fecha',
    'Hora Inicio',
    'Hora Fin',
    'Horas\nTrabajadas',
    'Proyecto / Sistema o Paso',
    'Actividad Realizada',
    'Resultado / Avance',
    'Observaciones',
    'Responsable',
  ];
  headers.forEach((h, i) => {
    const cell = ws.getCell(5, i + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', bold: true, size: 11, color: { argb: C.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBlue } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder('FF2A4A7A');
  });
  ws.getRow(5).height = 36;

  ROWS.forEach((row, idx) => {
    const r = 6 + idx;
    const zebra = idx % 2 === 0 ? C.zebra1 : C.zebra2;
    row.forEach((val, c) => {
      const cell = ws.getCell(r, c + 1);
      cell.value = val;
      cell.font = { name: 'Calibri', size: 11 };
      cell.border = thinBorder('FFE2E8F0');
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebra } };

      if (c === 0) cell.alignment = { vertical: 'top', horizontal: 'left' };
      else if (c === 1 || c === 2) cell.alignment = { vertical: 'top', horizontal: 'left' };
      else if (c === 3) {
        cell.numFmt = '0.00';
        cell.alignment = { vertical: 'top', horizontal: 'center' };
      } else if (c >= 4 && c <= 7) {
        cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      } else cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    });
    ws.getRow(r).height = 72;
  });

  ws.columns = [
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 11 },
    { width: 38 },
    { width: 52 },
    { width: 40 },
    { width: 32 },
    { width: 26 },
  ];

  ws.views = [{ state: 'frozen', ySplit: 5 }];
  ws.autoFilter = `A5:I${5 + ROWS.length}`;

  await wb.xlsx.writeFile(BITACORA);
  console.log('Listo (con estilos):', BITACORA);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
