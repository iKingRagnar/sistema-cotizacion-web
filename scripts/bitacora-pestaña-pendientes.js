/**
 * Añade hoja "Pendientes por hacer" a Cursor IA/Bitacora.xlsx
 * Uso: node scripts/bitacora-pestaña-pendientes.js
 */
const path = require('path');
const ExcelJS = require('exceljs');

const BITACORA = path.join(__dirname, '..', '..', '..', 'Bitacora.xlsx');
const SHEET = 'Pendientes por hacer';

const C = {
  titleBlue: 'FF1E3A5F',
  sectionBg: 'FFDCE6F7',
  border: 'FFE2E8F0',
};

function thin() {
  return {
    top: { style: 'thin', color: { argb: C.border } },
    left: { style: 'thin', color: { argb: C.border } },
    bottom: { style: 'thin', color: { argb: C.border } },
    right: { style: 'thin', color: { argb: C.border } },
  };
}

const BLOCKS = [
  {
    title: 'REFACCIONES (módulo inventario / cotización)',
    items: [
      'Quitar o dejar de usar el campo Marca; reemplazar por Zona (estante, rack, etc.).',
      'Origen → reemplazar por Stock; el stock debe descontarse cuando una cotización con ese material se aplique (por cada refacción según cotizaciones aplicadas).',
      'Cantidad mínima: al llegar al umbral, generar alerta.',
      'Aplicar FIFO correcto y registro de consumos.',
      'Columna de cantidad mínima en refacciones.',
      'En código/refacción: al hacer clic, mostrar imagen del manual y número de parte (Assembly of part).',
      'Cada refacción con categoría; en la categoría listar máquinas aplicables. Al elegir una fresadora (u otra máquina), permitir subcategoría y ubicación de piezas.',
      'Si la refacción es nueva y se va a pedir: mostrar código de manual de partes de cada máquina (según manual del fabricante).',
      'Cotización lograda: marcar con check; al registrar la cotización como venta, eliminar ese renglón y reflejar que ya no existe esa cantidad en inventario.',
    ],
  },
  {
    title: 'PESTAÑA BONOS (enlace con servicios / capacitación)',
    items: [
      'Enlazar con Servicios.',
      'Si es capacitación: preguntar quién la realiza; listar técnicos disponibles.',
      'Según tipo de capacitación, asignar bono correspondiente; guardar, imprimir e indicar monto adeudado por bonos de capacitación.',
    ],
  },
  {
    title: 'PESTAÑA VIAJES',
    items: [
      'Viáticos: $1.000 MXN diarios (configurable si aplica).',
      'Reporte por viaje: cliente, actividades realizadas, montos, etc.',
      'Enlazar con bonos de capacitación cuando corresponda.',
      'Reporte mensual imprimible y enviable (resumen de viajes + bonos vinculados).',
    ],
  },
];

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(BITACORA);

  const old = wb.getWorksheet(SHEET);
  if (old) wb.removeWorksheet(old.id);

  const ws = wb.addWorksheet(SHEET, { views: [{ showGridLines: true }] });

  let row = 1;
  ws.mergeCells(`A${row}:D${row}`);
  const t = ws.getCell(`A${row}`);
  t.value = 'PENDIENTES POR HACER — Gestor (sistema-cotizacion-web)';
  t.font = { name: 'Calibri', size: 14, bold: true, color: { argb: C.titleBlue } };
  t.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getRow(row).height = 28;
  row++;

  ws.mergeCells(`A${row}:D${row}`);
  const sub = ws.getCell(`A${row}`);
  sub.value =
    'Backlog acordado con Luis Alberto. Implementación en app: módulos Refacciones, Bonos y Viajes.';
  sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
  sub.alignment = { horizontal: 'center', wrapText: true };
  row++;
  row++;

  for (const block of BLOCKS) {
    ws.mergeCells(`A${row}:D${row}`);
    const h = ws.getCell(`A${row}`);
    h.value = block.title;
    h.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.sectionBg } };
    h.alignment = { vertical: 'middle', wrapText: true };
    h.border = thin();
    ws.getRow(row).height = 26;
    row++;

    block.items.forEach((text, i) => {
      ws.getCell(`A${row}`).value = `${i + 1}.`;
      ws.getCell(`A${row}`).font = { name: 'Calibri', size: 11, bold: true };
      ws.getCell(`A${row}`).alignment = { vertical: 'top', horizontal: 'right' };
      ws.getCell(`A${row}`).border = thin();
      ws.mergeCells(`B${row}:D${row}`);
      const c = ws.getCell(`B${row}`);
      c.value = text;
      c.font = { name: 'Calibri', size: 11 };
      c.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      c.border = thin();
      ws.getRow(row).height = 44;
      row++;
    });
    row++;
  }

  ws.columns = [{ width: 5 }, { width: 18 }, { width: 40 }, { width: 25 }];
  ws.views = [{ state: 'frozen', ySplit: 4 }];

  await wb.xlsx.writeFile(BITACORA);
  console.log('Pestaña añadida:', SHEET, '→', BITACORA);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
