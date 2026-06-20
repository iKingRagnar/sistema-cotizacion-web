# 📘 GUÍA DE USUARIO — Sistema de Servicio Técnico UNIVERSAL

¡Hola David! Esta es una guía rápida para que conozcas tu nueva plataforma "Inteligencia Operativa". Está pensada para que la uses sin complicaciones desde el primer día.

**🌐 Acceso:** https://sistema-cotizacion-web.onrender.com
**💾 Base de datos:** Supabase (en la nube — 24/7 con respaldo automático)

---

## 🎨 PRIMER VISTAZO

Al entrar verás:
- **Header arriba:** logo UNIVERSAL · pestañas principales (Cotizaciones, Almacén, Agenda, Reportes) · botón **☀️/🌙** para alternar **Modo Sol** o **Modo Luna**
- **Sidebar izquierda:** todos los módulos
- **Indicador "LIVE":** confirma que estás conectado a la nube
- **TC: $17.33:** tipo de cambio del día para conversiones MXN/USD

---

## 📊 1. DASHBOARDS — Tu panel ejecutivo

Es lo primero que verás. Tiene:

### Resumen general (arriba)
- **4 KPI ejecutivos:** Ventas del mes · Cartera total · Catálogo de refacciones · Operaciones (horas)
- Cada KPI viene con badge de estado: **CUMPLIDO / SALUDABLE / ACTIVA / CRÍTICO** según métricas

### Botones de acción
- 🔄 **Actualizar:** recarga datos
- 📄 **Imprimir / PDF:** abre reporte ejecutivo listo para imprimir
- 📋 **Reporte ejecutivo:** mismo reporte pero sin auto-impresión (para revisar)
- 💾 **Respaldos:** historial de backups

### KPIs inferiores
- Tarjetas con totales rápidos por módulo (Clientes, Cotizaciones, Refacciones, Horas)
- Click en cualquiera → te lleva al módulo

---

## 👥 2. CLIENTES — Catálogo de empresas

### Lo que verás
Tabla con: ID · Código · Nombre · RFC · Contacto · Teléfono · Email · Ciudad

### Acciones por fila
- 👁️ **Ver:** abre tarjeta completa del cliente CON **histórico embebido** (cotizaciones, ventas, reportes, garantías, máquinas vendidas — todo en un solo lugar)
- ✏️ **Editar:** modificar datos
- 🗑️ **Eliminar:** si el cliente tiene máquinas/cotizaciones asociadas, te pide confirmación para borrar TODO en cascada

### Botones arriba
- **+ Nuevo cliente:** agregar empresa
- **PDF:** genera reporte formal del catálogo de clientes (listo para imprimir)
- **Excel:** descarga `.xlsx` con todos los clientes

### Búsqueda y filtros
- Buscador rápido por nombre/código/RFC
- Filtros avanzados por columna (ID, código, nombre, RFC, ciudad, etc.)

---

## 🔩 3. REFACCIONES — Inventario

### Tabla principal
Código · Descripción · Categoría · Subcategoría · Zona · Stock · Stock mínimo · Precio MXN · Precio USD · Imagen

### Acciones clave
- 👁️ **Ver/Editar refacción** con ficha completa
- 📥 **Importar XLSX:** sube cientos de refacciones desde Excel (detecta columnas automáticamente)
- 📤 **Exportar:** CSV o Excel
- 🚨 **Alertas de stock bajo:** aparecen automáticamente cuando stock ≤ stock_minimo

### Tip
- Categoría y subcategoría son listas pre-cargadas con todo el catálogo UNIVERSAL Maquinaria

---

## ⚙️ 4. MÁQUINAS — Catálogo técnico

Aquí están todas las máquinas que UNIVERSAL ofrece o tiene en su inventario.

### Datos por máquina
- Nombre, marca, modelo, número de serie
- **Ficha técnica completa:** descripción corta/larga, incluye, accesorios, garantía, condiciones de pago
- **Categoría y subcategoría** (Centros de maquinado, Tornos, Láser, etc.)
- **Tiempo de entrega estimado** en días
- **Estado de preparación:** pendiente / lista / entregada
- **Modo FLYER:** SINGLE (1 máquina por hoja) o PAIR (2 máquinas comparativas)
- **Fotos:** 1 para single, 2 para pair

### Acción especial: Vista previa flyer
- 👁️ Genera el flyer comercial PDF estilo UNIVERSAL listo para enviar al cliente (sin precios, con todas las specs)

### Tip
- No hace falta capturar máquinas manualmente — el sistema las crea automáticamente cuando registras un **Embarque** con modelo nuevo

---

## 🏬 5. ALMACÉN — Movimientos de inventario

Registra entradas y salidas de refacciones por sucursal.

**Sucursales fijas:** Querétaro · Monterrey · Guadalajara · Reynosa · Chihuahua · México

- **+ Nueva entrada:** llega producto al almacén
- **+ Nueva salida:** se entrega producto
- Cada movimiento se descuenta/suma al stock automáticamente

---

## 💰 6. COTIZACIONES — Lo más importante

Aquí se crea TODO el flujo comercial.

### Botón "+ Nueva cotización"
1. **Elige cliente** (busca por nombre o RFC)
2. **Tipo:** refacciones / servicio / máquina
3. **Agrega líneas:** cada renglón es una refacción o máquina
4. **Para máquinas:** aparece automáticamente el **badge verde de entrega estimada** según stock/mantenimiento/embarque
5. **Tipo de cambio:** se carga automático del día
6. **Descuento global** opcional
7. **Guardar** → estado "borrador"

### Acciones por cotización
- 👁️ **Vista previa:** revisar antes de enviar
- 📄 **Descargar PDF:** formato cota1.pdf con encabezado UNIVERSAL completo (datos cliente, líneas, condiciones, bancarios)
- ✏️ **Editar**
- ✓ **Aplicar (convertir a VENTA):** dispara automáticamente:
  - Bono de comisión al vendedor (15% refacciones · 15% servicios · 10% máquinas)
  - Si total ≥ $20,000 → bono adicional $1,000 por cada $20k
  - **Si es venta de máquina con número de serie → crea GARANTÍA automática + 2 mantenimientos del primer año**
- 🗑️ **Cancelar/eliminar**

### Filtros y vistas
- "Incluir aplicadas" para ver también las ya facturadas
- Filtros por folio, cliente, fecha, estado, tipo, vendedor

---

## 💼 7. VENTAS — Cotizaciones aplicadas

Es una vista filtrada: solo cotizaciones en estado "aplicada" o "venta".

- Tabla con totales MXN/USD
- Filtros por mes, vendedor, cliente
- Exportable

---

## 📍 8. PROSPECCIÓN — Clientes potenciales

CRM ligero para llevar el pipeline antes de que se convierta en cotización formal.

- Estados: contactado → propuesta → negociación → cerrado
- Notas por interacción

---

## 🔍 9. REVISIÓN DE MÁQUINAS — Pre-entrega

Checklist de máquinas vendidas que están en proceso de preparación antes de entregarlas al cliente.

- Estado de preparación
- Fecha estimada de lista
- Filas virtuales para máquinas vendidas sin checklist iniciado

---

## 🚚 10. EMBARQUES — Máquinas en tránsito

Registra máquinas que vienen de un proveedor (importadas, en camino, llegadas).

### Datos
- Nombre/modelo de la máquina (**con autocomplete inteligente:** si ya existe en Máquinas la liga automáticamente, si no la crea)
- Número de serie · Proveedor · Origen · Destino (sucursal)
- ETA · Estado: **en_camino** / **llegado** / **cancelado**
- Notas

### Tip clave
Cuando un embarque pasa a "llegado" por primera vez:
- Si es refacción → suma stock automáticamente
- Si es máquina → la marca como "lista para venta"

---

## 💸 11. TARIFAS — Configuración comercial

Aquí se centralizan TODOS los parámetros de cálculo:
- Mano de obra por hora (técnico, supervisor, etc.)
- % comisiones
- Tipo de cambio default
- **Márgenes de entrega dinámica** (días mínimo/máximo)
- Tarifas UNIVERSAL 2026

Solo administrador puede modificar.

---

## 📋 12. REPORTES DE SERVICIO

Cada visita técnica o instalación queda registrada aquí.

### Datos por reporte
- Cliente · Máquina · N° serie
- **Tipo:** servicio (falla) / venta / instalación / capacitación / garantía
- **Subtipo:** específico (falla eléctrica, mantenimiento preventivo, capacitación local, etc.)
- **Técnico asignado**
- **Fecha + slot horario:** Madrugada / Mañana / Tarde / Noche
- **Días de duración** (1 a N)
- **Fuera de ciudad** ✈️ → genera bono automático ($500/día)
- Descripción, notas, archivo firmado, evidencias

### Status
- abierto → en_proceso → finalizado (con firma del cliente)

### Conexión con Agenda
Cuando asignas técnico + fecha + slot, ese reporte aparece en la AGENDA bloqueando esa franja horaria.

---

## 🛡️ 13. GARANTÍAS

Lista de máquinas vendidas con garantía vigente.

### Funcionalidades
- Modelo, número de serie, fecha de entrega, mantenimientos programados
- **Calendario mensual** con próximos mantenimientos
- **Alertas automáticas** por correo cuando se acerca un mantenimiento
- **Procesar alertas:** envía emails masivos del mes (con opción "Simular" para probar)

### Tip
La garantía se crea **automáticamente** cuando aplicas una cotización de máquina con número de serie. Vienen incluidos los 2 mantenimientos del primer año.

---

## 📅 14. AGENDA — Calendario de técnicos

Vista mensual de todas las asignaciones (reportes con técnico + fecha + slot).

### Lo que verás
- Calendario tipo Outlook
- Días con asignaciones marcados con puntito de color (rojo: vencido / amarillo: próximo / azul: pendiente / verde: realizado)
- **Click en día** → modal con 4 slots (Madrugada/Mañana/Tarde/Noche)
  - Slot LIBRE → verde
  - Slot OCUPADO → rojo con candado 🔒 + nombre del técnico
- **Detalle de asignaciones** colapsable con info completa
- **Mantenimientos programados** del día (de garantías)

### Cómo ocupar a un técnico X días
1. Ve a Reportes → "+ Nuevo reporte"
2. Llena cliente, máquina, técnico, fecha, slot
3. Guarda → aparece automáticamente en Agenda
4. Para varios días: crea un reporte por día

---

## 🚫 15. SIN COBERTURA — Garantías expiradas

Máquinas cuya garantía ya venció. Para identificar oportunidades de venta de servicio post-garantía.

---

## 🪙 16. BONOS — Comisiones por técnico/vendedor

Acumulador automático mensual de todos los bonos generados por:
- Ventas (15% refacciones · 15% servicios · 10% máquinas)
- Bono $20k+ ($1,000 por cada $20k vendido)
- Bonos de capacitación (local/línea/foránea)
- Bono por día fuera de ciudad ($500/día)

### Filtros
- Por técnico
- Por mes
- Por tipo de bono

### Liquidación
Marcar bono como "pagado" cuando ya se entregó.

---

## 👷 17. PERSONAL — Empleados

Catálogo de técnicos, vendedores, administrativos.
- Rol · puesto · sucursal · sueldo base
- Vinculado con bonos automáticamente por nombre

---

## 🔍 18. AUDITORÍA — Historial de cambios

Registro de quién hizo qué y cuándo en el sistema (creaciones, ediciones, eliminaciones).
**Solo administrador.**

---

## 👤 19. USUARIOS — Accesos al sistema

Crear/editar cuentas con credenciales para entrar al sistema.
**Solo administrador.**

---

## 📁 20. CATEGORÍAS — Mantenimiento del catálogo

Editar el catálogo de categorías/subcategorías de máquinas y refacciones.

---

## 🤖 21. DavAI — Asistente

Botón flotante abajo a la derecha. Asistente IA para resolver dudas del sistema.

---

## 🎯 FLUJO TÍPICO DE USO

### Caso 1: Vender una máquina nueva
1. **Cotizaciones** → "+ Nueva cotización" → Cliente, tipo "maquina", agregar línea con la máquina
2. Sistema muestra automáticamente fecha estimada de entrega
3. Genera PDF y envíalo
4. Cuando el cliente acepta → **Aplicar cotización** ✓
5. Automáticamente:
   - Se crea la GARANTÍA con 2 mantenimientos del primer año
   - Se generan los BONOS de comisión
   - La máquina queda registrada al cliente
6. En **Revisión de máquinas** preparas la entrega
7. En **Embarques** la mueves a la sucursal de destino

### Caso 2: Reporte de servicio técnico
1. **Reportes** → "+ Nuevo reporte" → Cliente, máquina, técnico, fecha, slot
2. Aparece automáticamente en **Agenda**
3. Cuando el técnico termina → marca como **finalizado** con firma
4. Si fue fuera de ciudad → bono automático

### Caso 3: Mantenimiento preventivo de garantía
1. Sistema te avisa en **Garantías** cuando se acerca un mantenimiento programado
2. Click "Procesar alertas" → envía correos al cliente
3. Después creas el reporte de servicio normal

---

## 💡 TIPS GENERALES

- **Modo Luna 🌙 vs Sol ☀️:** el botón arriba alterna el tema; ambos están optimizados para máxima legibilidad
- **Búsqueda global:** cada pestaña tiene buscador rápido + filtros avanzados
- **Filtros con `>10`, `<5`, etc.:** funcionan en columnas numéricas
- **Exportar:** todas las tablas tienen botones CSV/Excel/PDF arriba a la derecha
- **Vistas guardadas:** botón "Vistas" para guardar combinaciones de filtros favoritas
- **Alertas en tiempo real:** badge rojo de notificaciones arriba a la derecha

---

## 🔒 SEGURIDAD

- Todo lo que haces queda registrado en **Auditoría**
- Cierra sesión cuando termines (botón arriba a la derecha)
- Si tu sesión expira, te aparece "Sesión expirada" → vuelve a iniciar
- Datos respaldados automáticamente en Supabase (nube)

---

## 🆘 SOPORTE

Si encuentras algún detalle raro, contacta a Luis Alberto Peña Cantú (Ingeniería).

**Disfruta tu plataforma — fue construida pensando en ti, David.** 🚀

---

*powered by Ing. David Cantú · Sistema de Servicio Técnico UNIVERSAL Maquinaria · 2026*
