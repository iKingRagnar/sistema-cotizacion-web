# Ejecutar una vez: python exportar_demo.py
# Genera seed-demo.json desde SistemaGestion_Demo.xlsm
import openpyxl
import json
import os

xlsm = r'c:\Users\ragna\Downloads\SistemaGestion_Demo.xlsm'
if not os.path.isfile(xlsm):
    xlsm = os.path.join(os.path.dirname(__file__), '..', 'SistemaGestion_Demo.xlsm')
wb = openpyxl.load_workbook(xlsm, read_only=True, data_only=True)

def clean(v):
    if v is None: return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return int(v) if float(v).is_integer() else round(float(v), 2)
    s = str(v).strip()
    return s if s else None

# CAT_CLIENTES: ID, NOMBRE, RFC, CONTACTO, TELÉFONO, EMAIL, DIRECCIÓN, CIUDAD
def get_clientes():
    ws = wb['CAT_CLIENTES']
    rows = list(ws.iter_rows(values_only=True))[1:]  # skip header
    out = []
    for row in rows:
        if not row or row[0] is None: continue
        out.append({
            'codigo': 'CLI-%s' % int(row[0]) if row[0] is not None else None,
            'nombre': clean(row[1]),
            'rfc': clean(row[2]),
            'contacto': clean(row[3]),
            'telefono': clean(row[4]),
            'email': clean(row[5]),
            'direccion': clean(row[6]),
            'ciudad': clean(row[7]) if len(row) > 7 else None,
        })
    return [c for c in out if c.get('nombre')]

# CAT_REFACCIONES: ID, CÓDIGO, DESCRIPCIÓN, MARCA, ORIGEN, PRECIO_UNIT, UNIDAD
def get_refacciones():
    ws = wb['CAT_REFACCIONES']
    rows = list(ws.iter_rows(values_only=True))[1:]
    out = []
    for row in rows:
        if not row or row[0] is None: continue
        out.append({
            'codigo': clean(row[1]) or ('REF-%s' % row[0]),
            'descripcion': clean(row[2]) or '-',
            'marca': clean(row[3]),
            'origen': clean(row[4]),
            'precio_unitario': clean(row[5]) if len(row) > 5 and row[5] is not None else 0,
            'unidad': clean(row[6]) if len(row) > 6 else 'PZA',
        })
    return [r for r in out if r.get('codigo')]

# CAT_MAQUINAS: ID, NOMBRE, MARCA, MODELO, Nº SERIE, CLIENTE_ID, UBICACIÓN
def get_maquinas():
    ws = wb['CAT_MAQUINAS']
    rows = list(ws.iter_rows(values_only=True))[1:]
    out = []
    for row in rows:
        if not row or row[0] is None: continue
        out.append({
            'nombre': clean(row[1]),
            'marca': clean(row[2]),
            'modelo': clean(row[3]),
            'numero_serie': clean(row[4]) if len(row) > 4 else None,
            'cliente_id': int(row[5]) if len(row) > 5 and row[5] is not None else None,
            'ubicacion': clean(row[6]) if len(row) > 6 else None,
        })
    return [m for m in out if m.get('nombre')]

clientes = get_clientes()
refacciones = get_refacciones()
maquinas = get_maquinas()
wb.close()

seed = { 'clientes': clientes, 'refacciones': refacciones, 'maquinas': maquinas }
out_path = os.path.join(os.path.dirname(__file__), 'seed-demo.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(seed, f, ensure_ascii=False, indent=2)
print('Generado:', out_path)
print('Clientes:', len(clientes), 'Refacciones:', len(refacciones), 'Maquinas:', len(maquinas))
