/* guia.js — Sistema de guía contextual. Un botón flotante "Guía" que, según la
   sección activa (evento panel:shown / data-tab / hash), muestra un panel
   hermoso con: para qué sirve, pasos, y el SIGUIENTE PASO recomendado.
   Aditivo y sin dependencias (FontAwesome ya está cargado). */
(function () {
  'use strict';
  if (window.__guiaInit) return;
  window.__guiaInit = true;

  var FLOW = 'Cliente → Máquina → Cotización → Venta → Garantía.';

  // Contenido por sección (clave = data-tab de la app).
  var GUIDE = {
    dashboards: { icon: 'gauge-high', color: '#2a6df4', title: 'Inicio / Tablero',
      what: 'Tu pantalla principal: resumen de clientes, cotizaciones, refacciones y alertas (como stock bajo).',
      steps: ['Lee las tarjetas de resumen para saber cómo va todo.', 'Atiende las alertas que aparezcan.', 'Entra al módulo que necesites.'],
      next: 'Ve a Clientes para registrar o buscar a quién vas a atender.' },
    clientes: { icon: 'users', color: '#2a6df4', title: 'Clientes',
      what: 'La base de todo: razón social, RFC, contacto, teléfono, correo y ciudad.',
      steps: ['Pulsa "Nuevo cliente".', 'Llena al menos el nombre/razón social.', 'Adjunta su constancia si la tienes.', 'Guarda.'],
      next: 'Registra las Máquinas de ese cliente para tenerlas listas al cotizar.' },
    prospeccion: { icon: 'bullseye', color: '#0ea5a4', title: 'Prospección',
      what: 'Clientes potenciales: empresa, contacto, ciudad y potencial de venta estimado.',
      steps: ['Pulsa "Nuevo prospecto".', 'Anota empresa y contacto.', 'Registra el potencial y notas de seguimiento.'],
      next: 'Cuando acepte, créalo como Cliente y cotízale.' },
    refacciones: { icon: 'gears', color: '#caa106', title: 'Refacciones',
      what: 'Tu catálogo: número de parte, descripción, precios, stock y stock mínimo.',
      steps: ['Pulsa "Nueva refacción".', 'Captura número de parte y precios.', 'Indica stock y stock mínimo (para alertas).', 'Agrega foto si quieres.'],
      next: 'Ya puedes agregarlas a las Cotizaciones en segundos.' },
    maquinas: { icon: 'industry', color: '#0ea5a4', title: 'Máquinas',
      what: 'Equipos del cliente: modelo, número de serie, categoría y ubicación.',
      steps: ['Pulsa "Nueva máquina".', 'Captura modelo y número de serie.', 'Asóciala al cliente.', 'Agrega foto y ubicación.'],
      next: 'Crea una Cotización para el cliente y su máquina.' },
    almacen: { icon: 'boxes-stacked', color: '#7c3aed', title: 'Catálogos / Almacén',
      what: 'Listas maestras que el sistema reutiliza para que no escribas lo mismo muchas veces.',
      steps: ['Elige la lista a ajustar.', 'Agrega, edita o elimina elementos.', 'Los cambios se reflejan en toda la app.'],
      next: 'Con los catálogos listos, captura más rápido en Refacciones y Máquinas.' },
    cotizaciones: { icon: 'file-invoice-dollar', color: '#caa106', title: 'Cotizaciones',
      what: 'El corazón del sistema: agregas partidas (refacciones, mano de obra) y calcula subtotal, IVA y total.',
      steps: ['Pulsa "Nueva cotización" y elige el cliente.', 'Agrega partidas; el total se calcula solo.', 'Usa Vista previa (icono de ojo) antes de enviar.', 'Imprime/PDF y, si la aprueban, aplícala.'],
      next: 'Al aplicarla pasa a Ventas y descuenta stock.' },
    ventas: { icon: 'cart-shopping', color: '#16a34a', title: 'Ventas',
      what: 'Las cotizaciones aprobadas/aplicadas: factura, fecha, total y estado de pago.',
      steps: ['Filtra por cliente o por mes.', 'Marca el estado de pago.', 'Consulta el detalle cuando lo necesites.'],
      next: 'Revisa Reportes para ver totales y comisiones del periodo.' },
    embarques: { icon: 'truck', color: '#0ea5a4', title: 'Viajes / Embarques',
      what: 'Viajes y visitas técnicas asociados al servicio: destino, fecha y motivo.',
      steps: ['Crea un nuevo viaje.', 'Indica destino, fecha y motivo.', 'Relaciónalo con el cliente o servicio.'],
      next: 'Anota las horas trabajadas en la Bitácora.' },
    garantias: { icon: 'shield-halved', color: '#7c3aed', title: 'Garantías',
      what: 'Control de garantías: cliente, máquina, serie, fechas de inicio/fin y si sigue activa.',
      steps: ['Pulsa "Nueva".', 'Selecciona cliente y máquina.', 'Captura fechas de inicio y fin.', 'Guarda.'],
      next: 'Si una máquina falla en garantía, regístralo en Revisión de máquinas.' },
    'revision-maquinas': { icon: 'screwdriver-wrench', color: '#e5484d', title: 'Revisión de máquinas',
      what: 'Incidentes y revisiones técnicas: modelo, serie, pruebas, entrega y comentarios.',
      steps: ['Crea una nueva revisión.', 'Identifica la máquina.', 'Anota pruebas y comentarios.', 'Marca si se entregó.'],
      next: 'Si deriva en trabajo cobrable, genera una Cotización.' },
    bonos: { icon: 'star', color: '#caa106', title: 'Bonos y comisiones',
      what: 'Calcula bonos/comisiones del personal de ventas según lo vendido y las tarifas.',
      steps: ['Verifica que las Ventas estén bien registradas.', 'Revisa los cálculos.', 'Compáralos con tus Tarifas.'],
      next: 'Ajusta porcentajes en Tarifas si cambian tus reglas.' },
    tecnicos: { icon: 'user-gear', color: '#2a6df4', title: 'Personal',
      what: 'Tu equipo: técnicos y vendedores, con puesto, rol y (para vendedores) comisiones.',
      steps: ['Pulsa "Nuevo".', 'Captura nombre, puesto y contacto.', 'Si es vendedor, márcalo (solo administrador).'],
      next: 'Define las Tarifas para que las comisiones salgan exactas.' },
    tarifas: { icon: 'tags', color: '#caa106', title: 'Tarifas',
      what: 'Valores base del negocio: comisiones, mano de obra y bonos. El sistema los usa en cálculos.',
      steps: ['Ajusta porcentajes y montos.', 'Guarda los cambios.', 'Verás el efecto en Cotizaciones y Bonos.'],
      next: 'Con tarifas correctas, Cotizaciones y Comisiones salen exactas.' },
    reportes: { icon: 'chart-column', color: '#2a6df4', title: 'Reportes',
      what: 'Resúmenes y exportaciones: ventas, comisiones y datos por periodo (Excel/CSV).',
      steps: ['Elige tipo de reporte y periodo.', 'Visualiza los totales.', 'Descarga o envía el reporte mensual.'],
      next: 'Úsalos para tomar decisiones y cerrar el mes.' },
    usuarios: { icon: 'user-shield', color: '#7c3aed', title: 'Usuarios y permisos',
      what: 'Solo administradores: crea cuentas y define qué puede hacer cada quien.',
      steps: ['Pulsa "Nuevo usuario" y asigna rol.', 'Comparte la contraseña inicial de forma segura.', 'Pide cambiarla al primer ingreso.'],
      next: 'Revisa Auditoría para ver quién hizo qué.' },
    auditoria: { icon: 'clipboard-list', color: '#6b7280', title: 'Auditoría',
      what: 'El registro de cambios: quién hizo qué y cuándo.',
      steps: ['Filtra por fecha o usuario.', 'Revisa las acciones registradas.'],
      next: 'Útil para control interno y para aclarar dudas.' },
    davai: { icon: 'robot', color: '#0ea5a4', title: 'Asistente DavAI',
      what: 'Un asistente con IA que te ayuda con dudas y tareas dentro del sistema.',
      steps: ['Escríbele tu pregunta o pídele ayuda con una tarea.', 'Sé concreto para mejores resultados.', 'Confirma y guarda tú los cambios.'],
      next: 'Combínalo con los módulos: él guía, tú decides.' }
  };

  function defaultGuide() {
    return { icon: 'compass', color: '#2a6df4', title: 'Guía rápida',
      what: 'Bienvenido. Sigue el flujo recomendado para no perderte: ' + FLOW,
      steps: ['Registra tus Clientes.', 'Da de alta sus Máquinas.', 'Crea Cotizaciones.', 'Al aprobarse, se vuelven Ventas.'],
      next: 'Usa el menú para entrar a cualquier módulo; vuelve aquí cuando lo necesites.' };
  }

  var current = 'dashboards';
  function setCurrent(tab) { if (tab && typeof tab === 'string') { current = tab; if (panelOpen()) render(); } }

  document.addEventListener('panel:shown', function (e) {
    var p = e && e.detail ? (e.detail.panel || e.detail) : null;
    setCurrent(p);
  });
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-tab]');
    if (el) setCurrent(el.getAttribute('data-tab'));
  }, true);
  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    if (h) setCurrent(h);
  });

  // ── DOM ──
  var fab, panel, backdrop;
  function build() {
    fab = document.createElement('button');
    fab.id = 'guia-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Abrir guía de ayuda');
    fab.innerHTML = '<i class="fas fa-circle-question"></i><span>Guía</span>';
    fab.addEventListener('click', open);
    document.body.appendChild(fab);

    backdrop = document.createElement('div');
    backdrop.id = 'guia-backdrop';
    backdrop.addEventListener('click', close);
    document.body.appendChild(backdrop);

    panel = document.createElement('aside');
    panel.id = 'guia-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Guía de la sección');
    document.body.appendChild(panel);
  }

  function panelOpen() { return panel && panel.classList.contains('open'); }

  function render() {
    var g = GUIDE[current] || defaultGuide();
    var stepsHtml = g.steps.map(function (s, i) {
      return '<li><span class="guia-num">' + (i + 1) + '</span><span>' + esc(s) + '</span></li>';
    }).join('');
    panel.innerHTML =
      '<div class="guia-head" style="background:' + g.color + '">' +
        '<div class="guia-head-icon"><i class="fas fa-' + g.icon + '"></i></div>' +
        '<div><div class="guia-kicker">ESTÁS EN</div><div class="guia-title">' + esc(g.title) + '</div></div>' +
        '<button class="guia-close" aria-label="Cerrar">&times;</button>' +
      '</div>' +
      '<div class="guia-body">' +
        '<p class="guia-what">' + esc(g.what) + '</p>' +
        '<div class="guia-sec">¿Cómo lo hago?</div>' +
        '<ol class="guia-steps">' + stepsHtml + '</ol>' +
        '<div class="guia-next"><div class="guia-next-label"><i class="fas fa-arrow-right"></i> SIGUIENTE PASO</div>' +
          '<div>' + esc(g.next) + '</div></div>' +
        '<a class="guia-manual" href="/Manual-Usuario-Universal.pdf" target="_blank" rel="noopener">' +
          '<i class="fas fa-book-open"></i> Ver manual completo (PDF)</a>' +
        '<div class="guia-flow"><i class="fas fa-route"></i> Flujo: ' + FLOW + '</div>' +
      '</div>';
    panel.querySelector('.guia-close').addEventListener('click', close);
  }

  function open() { render(); panel.classList.add('open'); backdrop.classList.add('open'); }
  function close() { panel.classList.remove('open'); backdrop.classList.remove('open'); }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }

  // Burbuja de bienvenida (una sola vez) para que descubran la guía.
  function welcomeOnce() {
    try { if (localStorage.getItem('guia-welcome-v1')) return; } catch (_) {}
    var b = document.createElement('div');
    b.id = 'guia-welcome';
    b.innerHTML = '<strong>¿Nuevo por aquí?</strong> Toca <b>Guía</b> en cualquier momento: te dice qué hacer en cada pantalla.';
    document.body.appendChild(b);
    var dismiss = function () { b.remove(); try { localStorage.setItem('guia-welcome-v1', '1'); } catch (_) {} };
    b.addEventListener('click', dismiss);
    setTimeout(dismiss, 9000);
  }

  function init() { build(); welcomeOnce(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
