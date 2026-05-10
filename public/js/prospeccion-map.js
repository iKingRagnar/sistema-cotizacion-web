/* ============================================================
 * PROSPECCION-MAP.JS  -  Modulo avanzado de prospeccion
 * Leaflet + MarkerCluster + Heatmap + Sidebar + Drawer + Route
 * Patron IIFE, vanilla JS, independiente de frameworks
 * ============================================================ */
;(function () {
  'use strict';

  /* ----------------------------------------------------------
   * 0. CONSTANTS
   * ---------------------------------------------------------- */
  var STAGES = {
    prospecto:    { label: 'Prospecto',    color: '#3b82f6', order: 1 },
    contactado:   { label: 'Contactado',   color: '#8b5cf6', order: 2 },
    calificado:   { label: 'Calificado',   color: '#0ea5b7', order: 3 },
    propuesta:    { label: 'Propuesta',    color: '#e0950f', order: 4 },
    negociacion:  { label: 'Negociacion',  color: '#6b9c00', order: 5 },
    ganado:       { label: 'Ganado',       color: '#19b855', order: 6 },
    perdido:      { label: 'Perdido',      color: '#e02f37', order: 7 }
  };

  var SEGMENTS = {
    automotriz:   { label: 'Automotriz',      emoji: '\u{1F697}', color: '#3b82f6' },
    construccion: { label: 'Construccion',     emoji: '\u{1F3D7}️', color: '#e0950f' },
    mineria:      { label: 'Mineria',          emoji: '⛏️', color: '#8b5cf6' },
    manufactura:  { label: 'Manufactura',      emoji: '\u{1F3ED}', color: '#ea580c' },
    energia:      { label: 'Energia',          emoji: '⚡', color: '#ca8a04' },
    metalurgia:   { label: 'Metalurgia',       emoji: '\u{1F525}', color: '#e02f37' },
    alimentos:    { label: 'Alimentos',        emoji: '\u{1F33E}', color: '#19b855' },
    quimica:      { label: 'Quimica',          emoji: '\u{1F9EA}', color: '#db2777' },
    transporte:   { label: 'Transporte',       emoji: '\u{1F69A}', color: '#0891b2' },
    agricola:     { label: 'Agricola',         emoji: '\u{1F69C}', color: '#65a30d' },
    petroleo:     { label: 'Petroleo y Gas',   emoji: '\u{1F6E2}️', color: '#0ea5b7' },
    tecnologia:   { label: 'Tecnologia',       emoji: '\u{1F4BB}', color: '#6366f1' },
    salud:        { label: 'Salud',            emoji: '\u{1F3E5}', color: '#0891b2' },
    textil:       { label: 'Textil',           emoji: '\u{1F9F5}', color: '#a16207' }
  };

  /* Demo seed data - 35 Mexican companies */
  var SEED_DATA = [
    { id:'d01', empresa:'Grupo Bimbo', zona:'CDMX Norte', lat:19.4835, lng:-99.1477, tipo_interes:'Refacciones industriales', industria:'alimentos', potencial_usd:285000, ultimo_contacto:'2026-04-20', score_ia:92, estado:'prospecto', notas:'Planta Azcapotzalco, lineas de empaque', contacto:'Ana Torres', telefono:'+525551234567', email:'atorres@grupobimbo.com', productos:['Bandas transportadoras','Sellos mecanicos','Rodamientos'] },
    { id:'d02', empresa:'Cemex Monterrey', zona:'Monterrey', lat:25.6580, lng:-100.2953, tipo_interes:'Maquinaria pesada', industria:'construccion', potencial_usd:450000, ultimo_contacto:'2026-04-15', score_ia:88, estado:'contactado', notas:'Planta Monterrey, requiere refacciones para trituradoras', contacto:'Carlos Mendez', telefono:'+528112345678', email:'cmendez@cemex.com', productos:['Trituradoras','Cribas','Bandas'] },
    { id:'d03', empresa:'Ternium Mexico', zona:'San Nicolas NL', lat:25.7400, lng:-100.2864, tipo_interes:'Acero y laminacion', industria:'metalurgia', potencial_usd:520000, ultimo_contacto:'2026-03-28', score_ia:95, estado:'calificado', notas:'Gran oportunidad, planta principal', contacto:'Roberto Garza', telefono:'+528187654321', email:'rgarza@ternium.com', productos:['Rodillos','Chumaceras','Acoples'] },
    { id:'d04', empresa:'Nemak', zona:'Garcia NL', lat:25.8061, lng:-100.5950, tipo_interes:'Fundicion automotriz', industria:'automotriz', potencial_usd:380000, ultimo_contacto:'2026-04-10', score_ia:85, estado:'propuesta', notas:'Proveedor de bloques de motor, 3 plantas', contacto:'Laura Villarreal', telefono:'+528133334444', email:'lvillarreal@nemak.com', productos:['Moldes','Bombas','Filtros'] },
    { id:'d05', empresa:'Peñoles Fresnillo', zona:'Fresnillo ZAC', lat:23.1733, lng:-102.8697, tipo_interes:'Equipo minero', industria:'mineria', potencial_usd:620000, ultimo_contacto:'2026-04-02', score_ia:91, estado:'negociacion', notas:'Mina La Herradura, alta prioridad', contacto:'Miguel Angel Perez', telefono:'+524921234567', email:'maperez@penoles.com', productos:['Bombas sumergibles','Valvulas','Mangueras HP'] },
    { id:'d06', empresa:'FEMSA - Coca Cola', zona:'Monterrey', lat:25.6714, lng:-100.3096, tipo_interes:'Lineas de embotellado', industria:'alimentos', potencial_usd:340000, ultimo_contacto:'2026-04-25', score_ia:82, estado:'prospecto', notas:'Planta principal MTY, modernizacion', contacto:'Patricia Lozano', telefono:'+528155556666', email:'plozano@femsa.com', productos:['Bandas','Sellos','Bombas sanitarias'] },
    { id:'d07', empresa:'Kia Motors Mexico', zona:'Pesqueria NL', lat:25.7539, lng:-100.0436, tipo_interes:'Robotica y automatizacion', industria:'automotriz', potencial_usd:780000, ultimo_contacto:'2026-03-15', score_ia:94, estado:'ganado', notas:'Contrato firmado 2026, linea de ensamble', contacto:'Eduardo Kim', telefono:'+528177778888', email:'ekim@kia.com.mx', productos:['Robots ABB','Controladores','Sensores'] },
    { id:'d08', empresa:'Vitro Vidrio Plano', zona:'Garcia NL', lat:25.7981, lng:-100.5520, tipo_interes:'Hornos y refractarios', industria:'manufactura', potencial_usd:290000, ultimo_contacto:'2026-04-18', score_ia:76, estado:'contactado', notas:'Planta de vidrio flotado', contacto:'Fernando Sada', telefono:'+528199990000', email:'fsada@vitro.com', productos:['Refractarios','Quemadores','Controles'] },
    { id:'d09', empresa:'CFE Central Lerdo', zona:'Lerdo DGO', lat:25.5333, lng:-103.5243, tipo_interes:'Generacion electrica', industria:'energia', potencial_usd:410000, ultimo_contacto:'2026-02-20', score_ia:78, estado:'prospecto', notas:'Termoelectrica, mantenimiento mayor', contacto:'Ricardo Avalos', telefono:'+526711234567', email:'ravalos@cfe.mx', productos:['Turbinas','Bombas','Instrumentacion'] },
    { id:'d10', empresa:'AHMSA', zona:'Monclova COAH', lat:26.9010, lng:-101.4219, tipo_interes:'Siderurgia', industria:'metalurgia', potencial_usd:550000, ultimo_contacto:'2026-03-05', score_ia:80, estado:'calificado', notas:'Altos hornos, oportunidad de refacciones', contacto:'Jorge Ancira', telefono:'+528661234567', email:'jancira@ahmsa.com', productos:['Chumaceras','Rodillos','Acoples'] },
    { id:'d11', empresa:'Volkswagen Puebla', zona:'Puebla', lat:19.0769, lng:-98.2637, tipo_interes:'Estampado y pintura', industria:'automotriz', potencial_usd:650000, ultimo_contacto:'2026-04-12', score_ia:89, estado:'propuesta', notas:'Planta mas grande VW fuera Alemania', contacto:'Hans Mueller', telefono:'+522221234567', email:'hmueller@vw.com.mx', productos:['Prensas','Robots','Filtros pintura'] },
    { id:'d12', empresa:'Grupo Modelo - Zacatecas', zona:'Calera ZAC', lat:22.9000, lng:-102.6500, tipo_interes:'Cerveceria', industria:'alimentos', potencial_usd:195000, ultimo_contacto:'2026-04-22', score_ia:71, estado:'contactado', notas:'Planta cervecera, linea nueva', contacto:'Isabel Ramirez', telefono:'+524929876543', email:'iramirez@gmodelo.com', productos:['Valvulas sanitarias','Bombas','Mangueras'] },
    { id:'d13', empresa:'Frisa Forjas', zona:'Santa Catarina NL', lat:25.6558, lng:-100.4486, tipo_interes:'Forja abierta', industria:'metalurgia', potencial_usd:420000, ultimo_contacto:'2026-03-30', score_ia:86, estado:'negociacion', notas:'Anillos forjados para aeroespacial', contacto:'Daniel Zambrano', telefono:'+528144445555', email:'dzambrano@frisa.com', productos:['Dados de forja','Prensas','Tratamiento termico'] },
    { id:'d14', empresa:'Whirlpool Ramos Arizpe', zona:'Ramos Arizpe COAH', lat:25.5333, lng:-100.9500, tipo_interes:'Electrodomesticos', industria:'manufactura', potencial_usd:310000, ultimo_contacto:'2026-04-08', score_ia:77, estado:'prospecto', notas:'Planta de lavadoras, alto volumen', contacto:'Sandra Lopez', telefono:'+528441234567', email:'slopez@whirlpool.com', productos:['Motores','Bandas','Sellos'] },
    { id:'d15', empresa:'Deacero', zona:'Saltillo COAH', lat:25.3856, lng:-101.0000, tipo_interes:'Trefilado y alambre', industria:'metalurgia', potencial_usd:380000, ultimo_contacto:'2026-03-12', score_ia:83, estado:'calificado', notas:'Alambre y varilla, 5 plantas', contacto:'Marco Cantu', telefono:'+528487654321', email:'mcantu@deacero.com', productos:['Trefiladoras','Rodillos','Lubricacion'] },
    { id:'d16', empresa:'John Deere Saltillo', zona:'Saltillo COAH', lat:25.4167, lng:-100.9833, tipo_interes:'Maquinaria agricola', industria:'agricola', potencial_usd:480000, ultimo_contacto:'2026-04-05', score_ia:87, estado:'propuesta', notas:'Tractores y cosechadoras', contacto:'James Smith', telefono:'+528441111222', email:'jsmith@deere.com', productos:['Hidraulica','Transmisiones','Filtros'] },
    { id:'d17', empresa:'Pemex Refineria Cadereyta', zona:'Cadereyta NL', lat:25.5833, lng:-99.9833, tipo_interes:'Refinacion petroleo', industria:'petroleo', potencial_usd:820000, ultimo_contacto:'2026-02-28', score_ia:93, estado:'negociacion', notas:'Mantenimiento mayor programado Q3', contacto:'Arturo Flores', telefono:'+528287654321', email:'aflores@pemex.com', productos:['Valvulas','Instrumentacion','Bombas API'] },
    { id:'d18', empresa:'Techint - Tenaris Tamsa', zona:'Veracruz', lat:19.1738, lng:-96.1342, tipo_interes:'Tuberia sin costura', industria:'metalurgia', potencial_usd:490000, ultimo_contacto:'2026-03-18', score_ia:84, estado:'contactado', notas:'Tubos para oil & gas', contacto:'Giuseppe Rossi', telefono:'+522291234567', email:'grossi@tenaris.com', productos:['Rodillos','Chumaceras','Acoples'] },
    { id:'d19', empresa:'Alpek (Indorama)', zona:'Altamira TAMPS', lat:22.3933, lng:-97.9431, tipo_interes:'Petroquimica PET', industria:'quimica', potencial_usd:360000, ultimo_contacto:'2026-04-14', score_ia:79, estado:'prospecto', notas:'Planta PET y poliester', contacto:'Rafael Garza', telefono:'+528331234567', email:'rgarza@alpek.com', productos:['Bombas','Agitadores','Sellos mecanicos'] },
    { id:'d20', empresa:'Grupo Mexico - Buenavista', zona:'Cananea SON', lat:30.9500, lng:-110.3000, tipo_interes:'Mineria de cobre', industria:'mineria', potencial_usd:750000, ultimo_contacto:'2026-03-01', score_ia:90, estado:'calificado', notas:'Mina a tajo abierto, la mas grande de Mexico', contacto:'Ernesto Tellez', telefono:'+526451234567', email:'etellez@gmexico.com', productos:['Bombas slurry','Ciclones','Mangueras HP'] },
    { id:'d21', empresa:'BMW San Luis Potosi', zona:'San Luis Potosi', lat:22.1256, lng:-100.9308, tipo_interes:'Ensamble automotriz', industria:'automotriz', potencial_usd:560000, ultimo_contacto:'2026-04-19', score_ia:88, estado:'propuesta', notas:'Planta Serie 3, alta tecnologia', contacto:'Klaus Weber', telefono:'+524441234567', email:'kweber@bmw.com.mx', productos:['Robots','PLC','Transportadores'] },
    { id:'d22', empresa:'Herdez - San Luis', zona:'San Luis Potosi', lat:22.1500, lng:-100.9750, tipo_interes:'Procesamiento alimentos', industria:'alimentos', potencial_usd:175000, ultimo_contacto:'2026-04-24', score_ia:68, estado:'prospecto', notas:'Salsas y conservas', contacto:'Maria Hernandez', telefono:'+524447654321', email:'mhernandez@herdez.com', productos:['Llenadoras','Bombas sanitarias','Bandas'] },
    { id:'d23', empresa:'Caterpillar Monterrey', zona:'Ciénega de Flores NL', lat:25.9500, lng:-100.2833, tipo_interes:'Equipo pesado', industria:'manufactura', potencial_usd:430000, ultimo_contacto:'2026-03-22', score_ia:81, estado:'contactado', notas:'Fabricacion motores diesel', contacto:'Mike Johnson', telefono:'+528166667777', email:'mjohnson@cat.com', productos:['Componentes motor','Hidraulica','Filtros'] },
    { id:'d24', empresa:'Toyota Guanajuato', zona:'Apaseo el Grande GTO', lat:20.5458, lng:-100.6856, tipo_interes:'Ensamble y estampado', industria:'automotriz', potencial_usd:580000, ultimo_contacto:'2026-04-07', score_ia:86, estado:'calificado', notas:'Tacoma pickup, expansion planta', contacto:'Takeshi Yamamoto', telefono:'+524611234567', email:'tyamamoto@toyota.com.mx', productos:['Prensas','Soldadura','Transporte'] },
    { id:'d25', empresa:'Mazda Salamanca', zona:'Salamanca GTO', lat:20.5667, lng:-101.1833, tipo_interes:'Pintura y ensamble', industria:'automotriz', potencial_usd:390000, ultimo_contacto:'2026-03-25', score_ia:79, estado:'propuesta', notas:'Mazda3 y CX-30', contacto:'Kenji Sato', telefono:'+524617654321', email:'ksato@mazda.com.mx', productos:['Robots pintura','Filtros','Bombas'] },
    { id:'d26', empresa:'Industrias Peñoles - Met-Mex', zona:'Torreon COAH', lat:25.5428, lng:-103.4068, tipo_interes:'Fundicion plomo/zinc', industria:'mineria', potencial_usd:440000, ultimo_contacto:'2026-04-01', score_ia:82, estado:'negociacion', notas:'Refineria de metales', contacto:'Sergio Luna', telefono:'+528711234567', email:'sluna@penoles.com', productos:['Bombas acido','Valvulas','Filtros prensa'] },
    { id:'d27', empresa:'Aerojet Rocketdyne QRO', zona:'Queretaro', lat:20.5875, lng:-100.3928, tipo_interes:'Aeroespacial', industria:'manufactura', potencial_usd:350000, ultimo_contacto:'2026-04-16', score_ia:75, estado:'contactado', notas:'Componentes aeroespaciales de precision', contacto:'David Park', telefono:'+524421234567', email:'dpark@aerojet.com', productos:['CNC','Herramientas corte','Medicion'] },
    { id:'d28', empresa:'Nissan Aguascalientes', zona:'Aguascalientes', lat:21.8906, lng:-102.2908, tipo_interes:'Ensamble vehiculos', industria:'automotriz', potencial_usd:510000, ultimo_contacto:'2026-03-10', score_ia:85, estado:'calificado', notas:'Sentra y Kicks, 2 plantas', contacto:'Hiroshi Tanaka', telefono:'+524491234567', email:'htanaka@nissan.com.mx', productos:['Robots','Bandas','Herramienta'] },
    { id:'d29', empresa:'Mexichem (Orbia)', zona:'Tlaxcala', lat:19.3181, lng:-98.2375, tipo_interes:'Tuberia PVC', industria:'quimica', potencial_usd:280000, ultimo_contacto:'2026-04-11', score_ia:73, estado:'prospecto', notas:'Manufactura PVC y compuestos', contacto:'Luis Jimenez', telefono:'+522461234567', email:'ljimenez@orbia.com', productos:['Extrusoras','Moldes','Enfriamiento'] },
    { id:'d30', empresa:'Lala - Gomez Palacio', zona:'Gomez Palacio DGO', lat:25.5647, lng:-103.4906, tipo_interes:'Lacteos', industria:'alimentos', potencial_usd:220000, ultimo_contacto:'2026-04-23', score_ia:69, estado:'contactado', notas:'Planta de leche UHT', contacto:'Ana Lara', telefono:'+528711234568', email:'alara@lala.com', productos:['Bombas sanitarias','Intercambiadores','Valvulas'] },
    { id:'d31', empresa:'Stellantis Saltillo', zona:'Saltillo COAH', lat:25.4225, lng:-100.9928, tipo_interes:'Motores y transmisiones', industria:'automotriz', potencial_usd:620000, ultimo_contacto:'2026-03-20', score_ia:90, estado:'negociacion', notas:'Ram pickup, motores Hemi', contacto:'Pierre Dupont', telefono:'+528481234567', email:'pdupont@stellantis.com', productos:['Maquinado CNC','Robots','Metrologia'] },
    { id:'d32', empresa:'Heidelberg Cement MX', zona:'Ramos Arizpe COAH', lat:25.5394, lng:-100.9478, tipo_interes:'Cemento y clinker', industria:'construccion', potencial_usd:310000, ultimo_contacto:'2026-04-03', score_ia:74, estado:'prospecto', notas:'Hornos de clinker, molinos', contacto:'Heinrich Schmidt', telefono:'+528447654321', email:'hschmidt@heidelberg.com', productos:['Refractarios','Bandas','Rodamientos'] },
    { id:'d33', empresa:'Siemens Energy QRO', zona:'Queretaro', lat:20.6200, lng:-100.3800, tipo_interes:'Turbinas gas', industria:'energia', potencial_usd:480000, ultimo_contacto:'2026-03-08', score_ia:83, estado:'propuesta', notas:'Servicio turbinas industriales', contacto:'Wolfgang Klein', telefono:'+524427654321', email:'wklein@siemens-energy.com', productos:['Palas turbina','Sellos','Rodamientos HP'] },
    { id:'d34', empresa:'Grupo IDESA', zona:'Coatzacoalcos VER', lat:18.1500, lng:-94.4500, tipo_interes:'Etileno y derivados', industria:'quimica', potencial_usd:390000, ultimo_contacto:'2026-02-15', score_ia:77, estado:'contactado', notas:'Planta Braskem-Idesa, petroquimica', contacto:'Omar Reyes', telefono:'+529211234567', email:'oreyes@idesa.com', productos:['Bombas','Compresores','Instrumentacion'] },
    { id:'d35', empresa:'Minera Frisco - Tayahua', zona:'Mazapil ZAC', lat:24.6167, lng:-101.5500, tipo_interes:'Mineria plata/zinc', industria:'mineria', potencial_usd:530000, ultimo_contacto:'2026-03-14', score_ia:86, estado:'calificado', notas:'Mina subterranea, bombeo intensivo', contacto:'Felipe Slim', telefono:'+524921111222', email:'fslim@frisco.com.mx', productos:['Bombas sumergibles','Ventiladores','Mangueras'] }
  ];

  /* ----------------------------------------------------------
   * 1. UTILITY HELPERS
   * ---------------------------------------------------------- */
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s || ''); return d.innerHTML; }

  function fmtCompactMXN(n) {
    var x = Number(n) || 0;
    if (x >= 1e6) return '$' + (x / 1e6).toFixed(1) + 'M';
    if (x >= 1e3) return '$' + (x / 1e3).toFixed(0) + 'K';
    return '$' + x.toLocaleString('es-MX');
  }
  function fmtFullMXN(n) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(n) || 0);
  }
  function fmtDate(iso) {
    if (!iso) return '--';
    try { return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)); }
    catch (_) { return String(iso).slice(0, 10); }
  }
  function fmtRelative(iso) {
    if (!iso) return '--';
    var diff = Date.now() - new Date(iso).getTime();
    var days = Math.round(diff / 86400000);
    if (days <= 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 7) return 'Hace ' + days + ' dias';
    if (days < 30) return 'Hace ' + Math.round(days / 7) + ' sem';
    if (days < 365) return 'Hace ' + Math.round(days / 30) + ' meses';
    return 'Hace ' + Math.round(days / 365) + ' años';
  }
  function haversineKm(a, b) {
    var R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    var la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(2 * R * Math.asin(Math.sqrt(x)));
  }
  function scoreColor(s) {
    if (s >= 85) return '#19b855';
    if (s >= 70) return '#e0950f';
    if (s >= 50) return '#3b82f6';
    return '#e02f37';
  }

  /* ----------------------------------------------------------
   * 2. CDN LOADER (markercluster + leaflet.heat)
   * ---------------------------------------------------------- */
  var cdnLoaded = {};
  function loadCDN(url, type) {
    if (cdnLoaded[url]) return cdnLoaded[url];
    cdnLoaded[url] = new Promise(function (resolve, reject) {
      if (type === 'css') {
        if (document.querySelector('link[href="' + url + '"]')) { resolve(); return; }
        var link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = url;
        link.onload = resolve; link.onerror = reject;
        document.head.appendChild(link);
      } else {
        if (document.querySelector('script[src="' + url + '"]')) { resolve(); return; }
        var s = document.createElement('script');
        s.src = url; s.async = true;
        s.onload = resolve; s.onerror = reject;
        document.body.appendChild(s);
      }
    });
    return cdnLoaded[url];
  }

  function ensurePlugins() {
    return Promise.all([
      loadCDN('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css', 'css'),
      loadCDN('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css', 'css'),
      loadCDN('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js', 'js'),
      loadCDN('https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js', 'js')
    ]);
  }

  /* ----------------------------------------------------------
   * 3. STATE
   * ---------------------------------------------------------- */
  var state = {
    allLeads: [],
    filtered: [],
    map: null,
    clusterGroup: null,
    heatLayer: null,
    viewMode: 'markers',       // markers | heatmap | both
    sidebarOpen: true,
    selectedStages: [],
    selectedSegments: [],
    searchQuery: '',
    minPotential: 0,
    hotOnly: false,
    sortBy: 'score',           // score | potential | name
    currentPage: 1,
    pageSize: 15,
    focusedLeadId: null,
    routeLeadIds: [],
    routePolyline: null,
    routeMarkers: [],
    initialized: false
  };

  /* ----------------------------------------------------------
   * 4. ICON BUILDERS — Teardrop pins with emoji (MapaSuminregio style)
   * ---------------------------------------------------------- */
  var iconCache = {};
  function buildLeadIcon(lead) {
    var key = lead.id + '|' + lead.estado + '|' + lead.score_ia;
    if (iconCache[key]) return iconCache[key];

    var stage = STAGES[lead.estado] || STAGES.prospecto;
    var seg = SEGMENTS[lead.industria] || { emoji: '\u{1F4CD}' };
    var score = Number(lead.score_ia) || 0;
    var pinH = score >= 85 ? 44 : score >= 60 ? 38 : 32;
    var pinW = Math.round(pinH * 0.78);
    var isHot = score >= 85;
    var emojiSize = Math.round(pinH * 0.38);

    var html = '<div class="prs-teardrop-wrap" style="width:' + pinW + 'px;height:' + (pinH + 6) + 'px;">';
    if (isHot) html += '<div class="prs-teardrop-pulse" style="border-color:' + stage.color + ';"></div>';
    html += '<div class="prs-teardrop" style="' +
      'width:' + pinW + 'px;height:' + pinH + 'px;' +
      'background:linear-gradient(145deg,' + stage.color + ' 0%,' + stage.color + 'cc 100%);' +
      'border:2.5px solid rgba(255,255,255,0.9);' +
      'box-shadow:0 4px 14px rgba(0,0,0,.35), 0 0 0 1px ' + stage.color + '44;' +
      '">';
    html += '<span class="prs-teardrop-emoji" style="font-size:' + emojiSize + 'px;">' + seg.emoji + '</span>';
    html += '</div>';
    if (score >= 90) html += '<div class="prs-teardrop-star">★</div>';
    html += '<div class="prs-teardrop-shadow"></div>';
    html += '</div>';

    var icon = L.divIcon({
      html: html,
      className: 'prospeccion-marker-icon',
      iconSize: [pinW, pinH + 6],
      iconAnchor: [pinW / 2, pinH + 6],
      popupAnchor: [0, -(pinH + 2)],
      tooltipAnchor: [0, -(pinH - 4)]
    });
    iconCache[key] = icon;
    return icon;
  }

  function buildClusterIcon(cluster) {
    var n = cluster.getChildCount();
    var size = n > 200 ? 62 : n > 50 ? 52 : n > 10 ? 44 : 38;
    var markers = cluster.getAllChildMarkers();
    var sumPot = 0, stageCount = {};
    for (var i = 0; i < markers.length; i++) {
      var ld = markers[i]._leadData;
      if (ld) {
        sumPot += Number(ld.potencial_usd) || 0;
        stageCount[ld.estado] = (stageCount[ld.estado] || 0) + 1;
      }
    }
    var label = sumPot > 1e6 ? Math.round(sumPot / 1e6) + 'M' : sumPot > 1e3 ? Math.round(sumPot / 1e3) + 'K' : String(sumPot);

    var ringSegs = '';
    var total = n, offset = 0;
    var stKeys = Object.keys(STAGES);
    for (var s = 0; s < stKeys.length; s++) {
      var cnt = stageCount[stKeys[s]] || 0;
      if (cnt > 0) {
        var pct = (cnt / total) * 100;
        ringSegs += '<circle cx="50" cy="50" r="44" fill="none" stroke="' + STAGES[stKeys[s]].color + '" stroke-width="5" stroke-dasharray="' + (pct * 2.76).toFixed(1) + ' 276.5" stroke-dashoffset="-' + (offset * 2.76).toFixed(1) + '" opacity="0.85"/>';
        offset += pct;
      }
    }

    var html = '<div class="prs-cluster-bubble" style="width:' + size + 'px;height:' + size + 'px;">';
    html += '<svg viewBox="0 0 100 100" class="prs-cluster-ring">' + ringSegs + '</svg>';
    html += '<div class="prs-cluster-inner">';
    html += '<span class="prs-cluster-count">' + n + '</span>';
    html += '<span class="prs-cluster-value">$' + label + '</span>';
    html += '</div></div>';
    return L.divIcon({ html: html, className: 'prs-cluster-icon', iconSize: [size, size] });
  }

  /* ----------------------------------------------------------
   * 5. TOOLTIP HTML
   * ---------------------------------------------------------- */
  function tooltipHTML(lead) {
    var stage = STAGES[lead.estado] || STAGES.prospecto;
    var seg = SEGMENTS[lead.industria] || { emoji: '\u{1F4CD}', label: lead.industria || '?' };
    var score = Number(lead.score_ia) || 0;
    var star = score >= 90 ? '<span style="background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.3);padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700;">★ HOT ' + score + '</span>' : '';
    return '<div style="padding:12px;">' +
      '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">' +
        '<span style="background:' + stage.color + '26;color:' + stage.color + ';border:1px solid ' + stage.color + '66;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700;text-transform:uppercase;">' + stage.label + '</span>' +
        star +
      '</div>' +
      '<div style="font-size:14px;font-weight:700;color:var(--prs-text,#0b1220);line-height:1.25;margin-bottom:3px;">' + esc(lead.empresa) + '</div>' +
      '<div style="font-size:11px;color:var(--prs-text-muted,#475569);margin-bottom:8px;">' + seg.emoji + ' ' + esc(seg.label) + ' · ' + esc(lead.zona || '') + '</div>' +
      '<div style="display:flex;gap:6px;">' +
        '<div style="flex:1;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:8px;padding:6px 8px;">' +
          '<div style="font-size:9px;color:var(--prs-text-muted,#475569);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">Potencial</div>' +
          '<div style="font-size:13px;color:var(--prs-accent,#1a73e8);font-weight:700;">' + fmtCompactMXN(lead.potencial_usd) + '</div>' +
        '</div>' +
        '<div style="flex:1;background:rgba(128,128,128,0.06);border:1px solid rgba(128,128,128,0.12);border-radius:8px;padding:6px 8px;">' +
          '<div style="font-size:9px;color:var(--prs-text-muted,#475569);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">Score</div>' +
          '<div style="font-size:13px;font-weight:700;color:' + scoreColor(score) + ';">' + score + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:10px;color:var(--prs-text-muted,#475569);margin-top:6px;text-align:center;font-style:italic;">Click para ver detalle</div>' +
    '</div>';
  }

  /* ----------------------------------------------------------
   * 6. FILTER & SORT
   * ---------------------------------------------------------- */
  function applyFilters() {
    var q = state.searchQuery.toLowerCase();
    var result = state.allLeads.filter(function (r) {
      // Text search
      if (q) {
        var blob = [r.empresa, r.zona, r.estado, r.industria, r.tipo_interes, r.notas, r.contacto].map(function (x) { return String(x || '').toLowerCase(); }).join(' ');
        if (blob.indexOf(q) < 0) return false;
      }
      // Stage
      if (state.selectedStages.length > 0 && state.selectedStages.indexOf(r.estado) < 0) return false;
      // Segment
      if (state.selectedSegments.length > 0 && state.selectedSegments.indexOf(r.industria) < 0) return false;
      // Min potential
      if (state.minPotential > 0 && (Number(r.potencial_usd) || 0) < state.minPotential) return false;
      // Hot only
      if (state.hotOnly && (Number(r.score_ia) || 0) < 85) return false;
      return true;
    });
    // Sort
    result.sort(function (a, b) {
      if (state.sortBy === 'score') return (Number(b.score_ia) || 0) - (Number(a.score_ia) || 0);
      if (state.sortBy === 'potential') return (Number(b.potencial_usd) || 0) - (Number(a.potencial_usd) || 0);
      if (state.sortBy === 'name') return (a.empresa || '').localeCompare(b.empresa || '');
      return 0;
    });
    state.filtered = result;
    state.currentPage = 1;
  }

  /* ----------------------------------------------------------
   * 7. RENDER: KPIs
   * ---------------------------------------------------------- */
  function renderKPIs() {
    var el = qs('#prospeccion-kpi-strip');
    if (!el) return;
    var rows = state.filtered;
    var total = rows.length;
    var totalPot = 0, scoreSum = 0, stages = {};
    var ganados = 0;
    for (var i = 0; i < rows.length; i++) {
      totalPot += Number(rows[i].potencial_usd) || 0;
      scoreSum += Number(rows[i].score_ia) || 0;
      var st = rows[i].estado || 'prospecto';
      stages[st] = (stages[st] || 0) + 1;
      if (st === 'ganado') ganados++;
    }
    var avgScore = total ? Math.round(scoreSum / total) : 0;
    var conversion = total > 0 ? Math.round((ganados / total) * 100) : 0;

    // Mini bars HTML
    var barsHTML = '';
    var stageKeys = Object.keys(STAGES);
    var maxCount = 1;
    for (var j = 0; j < stageKeys.length; j++) {
      var c = stages[stageKeys[j]] || 0;
      if (c > maxCount) maxCount = c;
    }
    for (var k = 0; k < stageKeys.length; k++) {
      var sk = stageKeys[k];
      var cnt = stages[sk] || 0;
      var pct = maxCount > 0 ? Math.round((cnt / maxCount) * 100) : 0;
      barsHTML += '<div class="prospeccion-kpi-bar-row">' +
        '<span class="prospeccion-kpi-bar-label">' + STAGES[sk].label + '</span>' +
        '<div class="prospeccion-kpi-bar-track"><div class="prospeccion-kpi-bar-fill" style="width:' + pct + '%;background:' + STAGES[sk].color + ';"></div></div>' +
        '<span class="prospeccion-kpi-bar-count">' + cnt + '</span>' +
      '</div>';
    }

    el.innerHTML =
      '<div class="prospeccion-kpi-card">' +
        '<div class="prospeccion-kpi-card__label">Total Leads</div>' +
        '<div class="prospeccion-kpi-card__value">' + total + ' <span class="trend-up"><i class="fas fa-arrow-up"></i></span></div>' +
        '<div class="prospeccion-kpi-card__sub">de ' + state.allLeads.length + ' totales</div>' +
      '</div>' +
      '<div class="prospeccion-kpi-card">' +
        '<div class="prospeccion-kpi-card__label">Potencial Total</div>' +
        '<div class="prospeccion-kpi-card__value">' + fmtCompactMXN(totalPot) + '</div>' +
        '<div class="prospeccion-kpi-card__sub">USD pipeline activo</div>' +
      '</div>' +
      '<div class="prospeccion-kpi-card">' +
        '<div class="prospeccion-kpi-card__label">Score IA Promedio</div>' +
        '<div class="prospeccion-kpi-card__value">' + avgScore + '</div>' +
        '<div class="prospeccion-score-bar"><div class="prospeccion-score-bar__fill" style="width:' + avgScore + '%;"></div></div>' +
      '</div>' +
      '<div class="prospeccion-kpi-card">' +
        '<div class="prospeccion-kpi-card__label">Conversion Pipeline</div>' +
        '<div class="prospeccion-kpi-card__value">' + conversion + '%</div>' +
        '<div class="prospeccion-kpi-card__sub">ganados / total</div>' +
      '</div>' +
      '<div class="prospeccion-kpi-card" style="grid-column:span 1">' +
        '<div class="prospeccion-kpi-card__label">Leads por Etapa</div>' +
        '<div class="prospeccion-kpi-bars">' + barsHTML + '</div>' +
      '</div>';
  }

  /* ----------------------------------------------------------
   * 8. RENDER: Sidebar
   * ---------------------------------------------------------- */
  function renderSidebar() {
    renderSidebarFilters();
    renderSidebarList();
  }

  function renderSidebarFilters() {
    // Stage pills
    var stageContainer = qs('#prs-stage-pills');
    if (stageContainer) {
      var html = '';
      var keys = Object.keys(STAGES);
      for (var i = 0; i < keys.length; i++) {
        var active = state.selectedStages.indexOf(keys[i]) >= 0 ? ' active' : '';
        html += '<button class="prospeccion-pill' + active + '" data-stage="' + keys[i] + '" style="--pill-color:' + STAGES[keys[i]].color + '">' + STAGES[keys[i]].label + '</button>';
      }
      stageContainer.innerHTML = html;
    }
    // Segment pills
    var segContainer = qs('#prs-segment-pills');
    if (segContainer) {
      var html2 = '';
      var skeys = Object.keys(SEGMENTS);
      for (var j = 0; j < skeys.length; j++) {
        var active2 = state.selectedSegments.indexOf(skeys[j]) >= 0 ? ' active' : '';
        html2 += '<button class="prospeccion-pill' + active2 + '" data-segment="' + skeys[j] + '" style="--pill-color:' + SEGMENTS[skeys[j]].color + '">' + SEGMENTS[skeys[j]].emoji + ' ' + SEGMENTS[skeys[j]].label + '</button>';
      }
      segContainer.innerHTML = html2;
    }
    // Summary
    var summary = qs('#prs-sidebar-summary');
    if (summary) {
      var pot = 0;
      for (var k = 0; k < state.filtered.length; k++) pot += Number(state.filtered[k].potencial_usd) || 0;
      summary.innerHTML = '<strong>' + state.filtered.length + '</strong> leads · ' + fmtCompactMXN(pot) + ' potencial';
    }
  }

  function renderSidebarList() {
    var container = qs('#prs-lead-list');
    if (!container) return;

    var start = (state.currentPage - 1) * state.pageSize;
    var page = state.filtered.slice(start, start + state.pageSize);

    if (page.length === 0) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--prs-text-muted);font-size:0.8rem;">No se encontraron leads con los filtros actuales.</div>';
      renderPagination();
      return;
    }

    var html = '';
    for (var i = 0; i < page.length; i++) {
      var lead = page[i];
      var stage = STAGES[lead.estado] || STAGES.prospecto;
      var seg = SEGMENTS[lead.industria] || { emoji: '\u{1F4CD}' };
      var score = Number(lead.score_ia) || 0;
      var isActive = state.focusedLeadId === lead.id ? ' active' : '';
      html += '<div class="prospeccion-lead-card' + isActive + '" data-lead-id="' + lead.id + '">' +
        '<div class="prospeccion-lead-card__dot" style="background:' + stage.color + ';color:' + stage.color + '"></div>' +
        '<div class="prospeccion-lead-card__body">' +
          '<div class="prospeccion-lead-card__name">' + seg.emoji + ' ' + esc(lead.empresa) + '</div>' +
          '<div class="prospeccion-lead-card__meta">' +
            '<span>' + esc(lead.zona || '') + '</span>' +
            '<span>·</span>' +
            '<span style="color:' + stage.color + '">' + stage.label + '</span>' +
          '</div>' +
          '<div class="prospeccion-lead-card__row2">' +
            '<span class="prospeccion-lead-card__potential">' + fmtCompactMXN(lead.potencial_usd) + '</span>' +
            '<span class="prospeccion-lead-card__score">' +
              '<span class="prospeccion-lead-card__score-bar"><span class="prospeccion-lead-card__score-fill" style="width:' + score + '%;background:' + scoreColor(score) + ';"></span></span>' +
              score +
            '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }
    container.innerHTML = html;
    renderPagination();
  }

  function renderPagination() {
    var container = qs('#prs-pagination');
    if (!container) return;
    var totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    var html = '<button class="prospeccion-page-btn" data-page="prev" ' + (state.currentPage <= 1 ? 'disabled' : '') + '><i class="fas fa-chevron-left"></i></button>';
    var startP = Math.max(1, state.currentPage - 2);
    var endP = Math.min(totalPages, startP + 4);
    for (var p = startP; p <= endP; p++) {
      html += '<button class="prospeccion-page-btn' + (p === state.currentPage ? ' active' : '') + '" data-page="' + p + '">' + p + '</button>';
    }
    html += '<button class="prospeccion-page-btn" data-page="next" ' + (state.currentPage >= totalPages ? 'disabled' : '') + '><i class="fas fa-chevron-right"></i></button>';
    container.innerHTML = html;
  }

  /* ----------------------------------------------------------
   * 9. RENDER: Map layers
   * ---------------------------------------------------------- */
  function renderMapMarkers() {
    if (!state.map || !window.L) return;
    var L = window.L;

    // Clear existing
    if (state.clusterGroup) {
      state.map.removeLayer(state.clusterGroup);
      state.clusterGroup = null;
    }
    if (state.heatLayer) {
      state.map.removeLayer(state.heatLayer);
      state.heatLayer = null;
    }

    var valid = state.filtered.filter(function (r) {
      return Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng));
    });

    // Markers (clustered)
    if (state.viewMode === 'markers' || state.viewMode === 'both') {
      if (typeof L.markerClusterGroup === 'function') {
        state.clusterGroup = L.markerClusterGroup({
          chunkedLoading: true,
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          zoomToBoundsOnClick: true,
          animate: true,
          removeOutsideVisibleBounds: true,
          maxClusterRadius: function (zoom) { return zoom >= 11 ? 35 : zoom >= 8 ? 55 : 75; },
          iconCreateFunction: buildClusterIcon
        });
        for (var i = 0; i < valid.length; i++) {
          var lead = valid[i];
          var marker = L.marker([Number(lead.lat), Number(lead.lng)], { icon: buildLeadIcon(lead) });
          marker._leadData = lead;
          marker.bindTooltip(tooltipHTML(lead), {
            direction: 'top', offset: [0, -8], opacity: 1,
            className: 'prs-tooltip', sticky: false
          });
          (function (id) {
            marker.on('click', function () { openDrawer(id); });
          })(lead.id);
          state.clusterGroup.addLayer(marker);
        }
        state.map.addLayer(state.clusterGroup);
      } else {
        // Fallback: plain markers
        for (var j = 0; j < valid.length; j++) {
          var lead2 = valid[j];
          var m2 = L.marker([Number(lead2.lat), Number(lead2.lng)], { icon: buildLeadIcon(lead2) });
          m2._leadData = lead2;
          m2.bindTooltip(tooltipHTML(lead2), { direction: 'top', offset: [0, -8], opacity: 1, className: 'prs-tooltip' });
          (function (id2) { m2.on('click', function () { openDrawer(id2); }); })(lead2.id);
          m2.addTo(state.map);
        }
      }
    }

    // Heatmap
    if (state.viewMode === 'heatmap' || state.viewMode === 'both') {
      if (L.heatLayer) {
        var maxPot = 1;
        for (var k = 0; k < valid.length; k++) {
          var p = Number(valid[k].potencial_usd) || 0;
          if (p > maxPot) maxPot = p;
        }
        var points = [];
        for (var m = 0; m < valid.length; m++) {
          var intensity = Math.max(0.05, Math.min(1, (Number(valid[m].potencial_usd) || 0) / maxPot));
          points.push([Number(valid[m].lat), Number(valid[m].lng), intensity]);
        }
        state.heatLayer = L.heatLayer(points, {
          radius: 28, blur: 22, maxZoom: 11, max: 1,
          gradient: {
            0.0: 'rgba(59,130,246,0.0)',
            0.3: 'rgba(59,130,246,0.6)',
            0.5: 'rgba(139,92,246,0.7)',
            0.7: 'rgba(224,149,15,0.85)',
            0.9: 'rgba(25,184,85,0.95)',
            1.0: 'rgba(224,47,55,1.0)'
          }
        });
        state.heatLayer.addTo(state.map);
      }
    }

    // Fit bounds
    if (valid.length > 0) {
      var bounds = L.latLngBounds(valid.map(function (r) { return [Number(r.lat), Number(r.lng)]; }));
      state.map.fitBounds(bounds.pad(0.15));
    } else {
      state.map.setView([24.5, -101.5], 5);
    }
  }

  /* ----------------------------------------------------------
   * 10. NOTES PERSISTENCE (localStorage)
   * ---------------------------------------------------------- */
  var NOTES_KEY = 'prs_lead_notes';
  function loadNotes() {
    try { return JSON.parse(localStorage.getItem(NOTES_KEY)) || {}; } catch (_) { return {}; }
  }
  function saveNote(leadId, text) {
    var notes = loadNotes();
    if (text && text.trim()) notes[leadId] = text.trim();
    else delete notes[leadId];
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch (_) { /* quota */ }
  }
  function getNote(leadId) {
    return loadNotes()[leadId] || '';
  }

  function findSimilarLeads(lead, max) {
    max = max || 4;
    var results = [];
    for (var i = 0; i < state.allLeads.length; i++) {
      var o = state.allLeads[i];
      if (o.id === lead.id) continue;
      var score = 0;
      if (o.industria === lead.industria) score += 40;
      if (o.estado === lead.estado) score += 20;
      var dist = haversineKm(lead, o);
      if (dist < 100) score += 25;
      else if (dist < 300) score += 15;
      else if (dist < 500) score += 5;
      var potDiff = Math.abs((o.potencial_usd || 0) - (lead.potencial_usd || 0));
      if (potDiff < 100000) score += 15;
      else if (potDiff < 300000) score += 8;
      if (score >= 30) results.push({ lead: o, score: score, dist: dist });
    }
    results.sort(function (a, b) { return b.score - a.score; });
    return results.slice(0, max);
  }

  /* ----------------------------------------------------------
   * 10b. DETAIL DRAWER — 5 tabs (Info, Activity, Notes, AI, Edit)
   * ---------------------------------------------------------- */
  function openDrawer(leadId) {
    var lead = null;
    for (var i = 0; i < state.allLeads.length; i++) {
      if (state.allLeads[i].id === leadId) { lead = state.allLeads[i]; break; }
    }
    if (!lead) return;
    state.focusedLeadId = leadId;

    if (state.map && Number.isFinite(Number(lead.lat))) {
      state.map.flyTo([Number(lead.lat), Number(lead.lng)], 12, { duration: 1 });
    }

    var stage = STAGES[lead.estado] || STAGES.prospecto;
    var seg = SEGMENTS[lead.industria] || { emoji: '\u{1F4CD}', label: lead.industria || '?' };
    var score = Number(lead.score_ia) || 0;
    var circ = 2 * Math.PI * 30;
    var offset = circ - (score / 100) * circ;

    var body = qs('#prs-drawer-body');
    if (!body) return;

    var products = lead.productos || [];
    var prodHTML = '';
    for (var p = 0; p < products.length; p++) {
      prodHTML += '<span class="prospeccion-tag">' + esc(products[p]) + '</span>';
    }

    var waLink = lead.telefono ? 'https://wa.me/' + String(lead.telefono).replace(/[^0-9]/g, '') : '#';
    var telLink = lead.telefono ? 'tel:' + lead.telefono : '#';
    var mailLink = lead.email ? 'mailto:' + lead.email : '#';
    var navLink = Number.isFinite(Number(lead.lat)) ? 'https://www.google.com/maps/dir/?api=1&destination=' + lead.lat + ',' + lead.lng : '#';

    var persistedNotes = getNote(lead.id) || lead.notas || '';

    var activities = [];
    if (lead.ultimo_contacto) activities.push({ date: lead.ultimo_contacto, type: 'contact', text: 'Ultimo contacto registrado', icon: 'fa-phone' });
    activities.push({ date: '2026-04-01', type: 'email', text: 'Propuesta comercial enviada', icon: 'fa-envelope' });
    activities.push({ date: '2026-03-15', type: 'system', text: 'Lead importado al sistema', icon: 'fa-download' });

    var timelineHTML = '';
    var typeColors = { contact: '#3b82f6', email: '#8b5cf6', system: '#94a3b8', visit: '#22c55e', call: '#f59e0b' };
    for (var t = 0; t < activities.length; t++) {
      var act = activities[t];
      var tc = typeColors[act.type] || '#94a3b8';
      timelineHTML += '<div class="prs-timeline-item">' +
        '<div class="prs-timeline-dot" style="background:' + tc + ';box-shadow:0 0 0 3px ' + tc + '22;"></div>' +
        '<div class="prs-timeline-content">' +
          '<div class="prs-timeline-date">' + fmtDate(act.date) + ' <span style="color:' + tc + ';font-weight:600;">' + fmtRelative(act.date) + '</span></div>' +
          '<div class="prs-timeline-text"><i class="fas ' + act.icon + '" style="color:' + tc + ';margin-right:4px;font-size:0.7rem;"></i>' + esc(act.text) + '</div>' +
        '</div>' +
      '</div>';
    }

    var stageOptions = '';
    var stKeys = Object.keys(STAGES);
    for (var si = 0; si < stKeys.length; si++) {
      stageOptions += '<option value="' + stKeys[si] + '"' + (lead.estado === stKeys[si] ? ' selected' : '') + '>' + STAGES[stKeys[si]].label + '</option>';
    }
    var segOptions = '';
    var sgKeys = Object.keys(SEGMENTS);
    for (var sgi = 0; sgi < sgKeys.length; sgi++) {
      segOptions += '<option value="' + sgKeys[sgi] + '"' + (lead.industria === sgKeys[sgi] ? ' selected' : '') + '>' + SEGMENTS[sgKeys[sgi]].emoji + ' ' + SEGMENTS[sgKeys[sgi]].label + '</option>';
    }

    var prob = Math.round(score * 0.85);
    var daysSinceContact = lead.ultimo_contacto ? Math.round((Date.now() - new Date(lead.ultimo_contacto).getTime()) / 86400000) : 999;
    var isStale = daysSinceContact > 30;

    var stagePillsHTML = '';
    var stKeys2 = Object.keys(STAGES);
    for (var sp = 0; sp < stKeys2.length; sp++) {
      var sk = stKeys2[sp];
      var isActive = lead.estado === sk;
      stagePillsHTML += '<button class="prs-stage-pill' + (isActive ? ' active' : '') + '" data-stage="' + sk + '" style="--pill-color:' + STAGES[sk].color + '">' + STAGES[sk].label + '</button>';
    }

    var similars = findSimilarLeads(lead);
    var similarsHTML = '';
    for (var si2 = 0; si2 < similars.length; si2++) {
      var sim = similars[si2];
      var simSeg = SEGMENTS[sim.lead.industria] || { emoji: '\u{1F4CD}', label: '?' };
      similarsHTML += '<div class="prs-similar-lead" data-id="' + sim.lead.id + '">' +
        '<div class="prs-similar-lead__emoji">' + simSeg.emoji + '</div>' +
        '<div class="prs-similar-lead__info">' +
          '<div class="prs-similar-lead__name">' + esc(sim.lead.empresa) + '</div>' +
          '<div class="prs-similar-lead__meta">' + esc(sim.lead.zona) + ' · ' + fmtCompactMXN(sim.lead.potencial_usd) + ' · ' + sim.dist + ' km</div>' +
        '</div>' +
        '<div class="prs-similar-lead__score">' + (sim.lead.score_ia || 0) + '</div>' +
      '</div>';
    }

    body.innerHTML =
      '<div class="prs-drawer-hero">' +
        '<div class="prs-drawer-hero__info">' +
          '<div class="prs-drawer-badges">' +
            '<span class="prs-badge" style="--badge-color:' + stage.color + '">' + stage.label + '</span>' +
            '<span class="prs-badge" style="--badge-color:' + (seg.color || '#64748b') + '">' + seg.emoji + ' ' + esc(seg.label) + '</span>' +
            (score >= 85 ? '<span class="prs-badge prs-badge--hot">★ HOT</span>' : '') +
            (isStale ? '<span class="prs-badge prs-badge--stale">⚠ Inactivo</span>' : '') +
          '</div>' +
          '<h3 class="prs-drawer-title">' + esc(lead.empresa) + '</h3>' +
          '<div class="prs-drawer-sub"><i class="fas fa-map-marker-alt"></i> ' + esc(lead.zona || '') + '</div>' +
        '</div>' +
        '<div class="prospeccion-gauge">' +
          '<svg viewBox="0 0 68 68"><circle class="prospeccion-gauge__track" cx="34" cy="34" r="30"/><circle class="prospeccion-gauge__fill" cx="34" cy="34" r="30" stroke="' + scoreColor(score) + '" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '"/></svg>' +
          '<div class="prospeccion-gauge__label">' + score + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="prs-stage-change"><div class="prs-stage-change__title"><i class="fas fa-exchange-alt"></i> CAMBIAR ETAPA</div><div class="prs-stage-pills">' + stagePillsHTML + '</div></div>' +

      '<div class="prs-kpi-grid">' +
        '<div class="prs-kpi-cell"><div class="prs-kpi-cell__label">POTENCIAL ANUAL</div><div class="prs-kpi-cell__val prs-kpi-cell__val--money">' + fmtFullMXN(lead.potencial_usd) + '</div></div>' +
        '<div class="prs-kpi-cell"><div class="prs-kpi-cell__label">PROBABILIDAD</div><div class="prs-kpi-cell__val">' + prob + '%</div></div>' +
        '<div class="prs-kpi-cell"><div class="prs-kpi-cell__label">SCORE</div><div class="prs-kpi-cell__val" style="color:' + scoreColor(score) + '">' + score + '/100</div></div>' +
        '<div class="prs-kpi-cell"><div class="prs-kpi-cell__label">ULTIMO CONTACTO</div><div class="prs-kpi-cell__val' + (isStale ? ' prs-kpi-cell__val--stale' : '') + '">' + fmtRelative(lead.ultimo_contacto) + '</div></div>' +
      '</div>' +

      '<div class="prospeccion-actions">' +
        '<a href="' + waLink + '" target="_blank" rel="noopener" class="prospeccion-action-btn prospeccion-action-btn--whatsapp"><i class="fab fa-whatsapp"></i>WhatsApp</a>' +
        '<a href="' + telLink + '" class="prospeccion-action-btn prospeccion-action-btn--call"><i class="fas fa-phone"></i>Llamar</a>' +
        '<a href="' + mailLink + '" class="prospeccion-action-btn prospeccion-action-btn--email"><i class="fas fa-envelope"></i>Email</a>' +
        '<a href="' + navLink + '" target="_blank" rel="noopener" class="prospeccion-action-btn prospeccion-action-btn--navigate"><i class="fas fa-route"></i>Navegar</a>' +
      '</div>' +

      '<div class="prs-drawer-route-row">' +
        '<button class="btn outline small" style="width:100%;" id="prs-add-to-route" data-id="' + lead.id + '"><i class="fas fa-route"></i> ' + (state.routeLeadIds.indexOf(lead.id) >= 0 ? 'Quitar de Ruta' : 'Agregar a Ruta') + '</button>' +
      '</div>' +

      '<div class="prs-drawer-tabs">' +
        '<button class="prs-drawer-tab active" data-tab="info"><i class="fas fa-info-circle"></i> Info</button>' +
        '<button class="prs-drawer-tab" data-tab="activity"><i class="fas fa-stream"></i> Actividad</button>' +
        '<button class="prs-drawer-tab" data-tab="notes"><i class="fas fa-sticky-note"></i> Notas</button>' +
        '<button class="prs-drawer-tab" data-tab="ai"><i class="fas fa-robot"></i> IA</button>' +
        '<button class="prs-drawer-tab" data-tab="edit"><i class="fas fa-edit"></i> Editar</button>' +
      '</div>' +

      '<div class="prs-drawer-panels">' +
        '<div class="prs-drawer-panel active" data-panel="info">' +
          '<div class="prospeccion-detail-section">' +
            '<div class="prospeccion-detail-section__title"><i class="fas fa-address-card"></i> Contacto</div>' +
            '<div class="prospeccion-detail-row"><span class="prospeccion-detail-row__icon"><i class="fas fa-user"></i></span><span class="prospeccion-detail-row__value">' + esc(lead.contacto || 'Sin contacto') + '</span></div>' +
            '<div class="prospeccion-detail-row"><span class="prospeccion-detail-row__icon"><i class="fas fa-phone"></i></span><span class="prospeccion-detail-row__value">' + esc(lead.telefono || '--') + '</span></div>' +
            '<div class="prospeccion-detail-row"><span class="prospeccion-detail-row__icon"><i class="fas fa-envelope"></i></span><span class="prospeccion-detail-row__value">' + esc(lead.email || '--') + '</span></div>' +
            '<div class="prospeccion-detail-row"><span class="prospeccion-detail-row__icon"><i class="fas fa-map-marker-alt"></i></span><span class="prospeccion-detail-row__value">' + esc(lead.zona || '') + '</span></div>' +
            '<div class="prospeccion-detail-row"><span class="prospeccion-detail-row__icon"><i class="fas fa-crosshairs"></i></span><span class="prospeccion-detail-row__value" style="font-family:monospace;font-size:0.72rem;">' + (lead.lat ? Number(lead.lat).toFixed(4) + ', ' + Number(lead.lng).toFixed(4) : '--') + '</span></div>' +
          '</div>' +
          (products.length ? '<div class="prospeccion-detail-section"><div class="prospeccion-detail-section__title"><i class="fas fa-box-open"></i> Productos de Interes</div><div class="prospeccion-tags">' + prodHTML + '</div></div>' : '') +
          '<div class="prospeccion-detail-section">' +
            '<div class="prospeccion-detail-section__title"><i class="fas fa-bullseye"></i> Interes Comercial</div>' +
            '<p style="font-size:0.8rem;color:var(--prs-text-muted);line-height:1.5;margin:0;">' + esc(lead.tipo_interes || 'Sin especificar') + '</p>' +
          '</div>' +
          '<div class="prospeccion-detail-section">' +
            '<div class="prospeccion-detail-section__title"><i class="fas fa-map-signs"></i> Ubicacion</div>' +
            '<div style="display:flex;gap:0.5rem;margin-top:0.5rem;">' +
              '<a href="' + navLink + '" target="_blank" rel="noopener" class="btn primary small" style="flex:1;text-align:center;"><i class="fas fa-directions"></i> Navegar al cliente</a>' +
              '<a href="https://maps.google.com/?q=' + (lead.lat || 0) + ',' + (lead.lng || 0) + '" target="_blank" rel="noopener" class="btn outline small" style="flex:1;text-align:center;"><i class="fas fa-map"></i> Google Maps</a>' +
            '</div>' +
          '</div>' +
          (similarsHTML ? '<div class="prospeccion-detail-section"><div class="prospeccion-detail-section__title"><i class="fas fa-link"></i> Leads Similares</div><div class="prs-similar-leads">' + similarsHTML + '</div></div>' : '') +
        '</div>' +

        '<div class="prs-drawer-panel" data-panel="activity">' +
          '<div class="prospeccion-detail-section">' +
            '<div class="prospeccion-detail-section__title"><i class="fas fa-stream"></i> Linea de Tiempo</div>' +
            '<div class="prs-timeline">' + timelineHTML + '</div>' +
          '</div>' +
          '<div class="prospeccion-detail-section">' +
            '<div class="prospeccion-detail-section__title"><i class="fas fa-chart-bar"></i> Estadisticas</div>' +
            '<div class="prs-visit-stats">' +
              '<div class="prs-visit-stat"><div class="prs-visit-stat__val">0</div><div class="prs-visit-stat__lbl">Visitas</div></div>' +
              '<div class="prs-visit-stat"><div class="prs-visit-stat__val">2</div><div class="prs-visit-stat__lbl">Emails</div></div>' +
              '<div class="prs-visit-stat"><div class="prs-visit-stat__val">1</div><div class="prs-visit-stat__lbl">Llamadas</div></div>' +
              '<div class="prs-visit-stat"><div class="prs-visit-stat__val">' + fmtRelative(lead.ultimo_contacto) + '</div><div class="prs-visit-stat__lbl">Ultimo</div></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="prs-drawer-panel" data-panel="notes">' +
          '<div class="prospeccion-detail-section">' +
            '<div class="prospeccion-detail-section__title"><i class="fas fa-sticky-note"></i> Notas del Prospecto</div>' +
            '<textarea class="prospeccion-notes-area" id="prs-notes-area" placeholder="Escribe notas aqui... Se guardan automaticamente.">' + esc(persistedNotes) + '</textarea>' +
            '<div class="prs-notes-status" id="prs-notes-status">Guardado automatico</div>' +
          '</div>' +
        '</div>' +

        '<div class="prs-drawer-panel" data-panel="ai">' +
          '<div class="prospeccion-detail-section">' +
            '<div class="prospeccion-detail-section__title"><i class="fas fa-wand-magic-sparkles"></i> Siguiente Accion Sugerida</div>' +
            '<div class="prs-ai-action-card">' +
              '<div class="prs-ai-action-card__icon"><i class="fas ' + (score >= 85 ? 'fa-calendar-check' : score >= 60 ? 'fa-envelope-open-text' : 'fa-book-reader') + '"></i></div>' +
              '<div class="prs-ai-action-card__text">' +
                (score >= 85 ? 'Agendar visita presencial esta semana. Preparar propuesta personalizada con catalogo del sector ' + esc(seg.label) + '.' :
                 score >= 60 ? 'Enviar caso de estudio del sector ' + esc(seg.label) + '. Dar seguimiento telefonico en 5 dias habiles.' :
                 'Nutrir con contenido educativo. Calificar necesidades especificas antes de enviar propuesta formal.') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="prospeccion-detail-section">' +
            '<div class="prospeccion-detail-section__title"><i class="fas fa-robot"></i> Analisis IA</div>' +
            '<div class="prs-ai-card">' +
              '<div class="prs-ai-score-row">' +
                '<div class="prs-ai-metric"><span class="prs-ai-metric__val" style="color:' + scoreColor(score) + '">' + score + '</span><span class="prs-ai-metric__lbl">Score General</span></div>' +
                '<div class="prs-ai-metric"><span class="prs-ai-metric__val">' + (score >= 85 ? 'Alto' : score >= 60 ? 'Medio' : 'Bajo') + '</span><span class="prs-ai-metric__lbl">Prioridad</span></div>' +
                '<div class="prs-ai-metric"><span class="prs-ai-metric__val">' + prob + '%</span><span class="prs-ai-metric__lbl">Prob. Cierre</span></div>' +
              '</div>' +
              '<div class="prs-ai-insight"><i class="fas fa-lightbulb" style="color:#f59e0b;"></i> ' +
                (score >= 85 ? 'Lead de alta prioridad. El potencial de ' + fmtCompactMXN(lead.potencial_usd) + ' justifica atencion inmediata y visita en sitio.' :
                 score >= 60 ? 'Oportunidad solida en sector ' + esc(seg.label) + '. Incrementar frecuencia de contacto para avanzar en pipeline.' :
                 'Lead en fase temprana. Recomendacion: identificar tomadores de decision y calificar presupuesto disponible.') +
              '</div>' +
              '<div class="prs-ai-tags">' +
                '<span class="prs-ai-tag"><i class="fas fa-industry"></i> ' + esc(seg.label) + '</span>' +
                '<span class="prs-ai-tag"><i class="fas fa-dollar-sign"></i> ' + fmtCompactMXN(lead.potencial_usd) + '</span>' +
                '<span class="prs-ai-tag"><i class="fas fa-clock"></i> ' + fmtRelative(lead.ultimo_contacto) + '</span>' +
                '<span class="prs-ai-tag"><i class="fas fa-map-pin"></i> ' + esc(lead.zona) + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="prospeccion-detail-section">' +
            '<div class="prospeccion-detail-section__title"><i class="fas fa-camera"></i> Analisis de Foto</div>' +
            '<div class="prs-photo-upload">' +
              '<div class="prs-photo-upload__zone" id="prs-photo-zone">' +
                '<i class="fas fa-cloud-upload-alt"></i>' +
                '<span>Sube una foto del equipo o planta</span>' +
                '<span class="prs-photo-upload__hint">Se analizara para recomendar productos</span>' +
                '<input type="file" id="prs-photo-input" accept="image/*" style="display:none;">' +
              '</div>' +
              '<div class="prs-photo-preview" id="prs-photo-preview" style="display:none;">' +
                '<img id="prs-photo-img" alt="Preview">' +
                '<button class="prs-photo-remove" id="prs-photo-remove"><i class="fas fa-times"></i></button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="prospeccion-detail-section">' +
            '<div class="prospeccion-detail-section__title"><i class="fas fa-envelope-open-text"></i> Generar Email</div>' +
            '<button class="btn outline small" id="prs-gen-email" style="width:100%;"><i class="fas fa-magic"></i> Redactar email de seguimiento</button>' +
            '<div class="prs-email-preview" id="prs-email-preview" style="display:none;"></div>' +
          '</div>' +
        '</div>' +

        '<div class="prs-drawer-panel" data-panel="edit">' +
          '<div class="prospeccion-detail-section">' +
            '<div class="prospeccion-detail-section__title"><i class="fas fa-edit"></i> Editar Lead</div>' +
            '<form id="prs-edit-form" class="prs-edit-form">' +
              '<div class="prs-edit-row"><label>Empresa</label><input type="text" name="empresa" value="' + esc(lead.empresa || '') + '"></div>' +
              '<div class="prs-edit-row"><label>Zona</label><input type="text" name="zona" value="' + esc(lead.zona || '') + '"></div>' +
              '<div class="prs-edit-row"><label>Contacto</label><input type="text" name="contacto" value="' + esc(lead.contacto || '') + '"></div>' +
              '<div class="prs-edit-row"><label>Telefono</label><input type="tel" name="telefono" value="' + esc(lead.telefono || '') + '"></div>' +
              '<div class="prs-edit-row"><label>Email</label><input type="email" name="email" value="' + esc(lead.email || '') + '"></div>' +
              '<div class="prs-edit-row"><label>Interes</label><input type="text" name="tipo_interes" value="' + esc(lead.tipo_interes || '') + '"></div>' +
              '<div class="prs-edit-row"><label>Etapa</label><select name="estado">' + stageOptions + '</select></div>' +
              '<div class="prs-edit-row"><label>Industria</label><select name="industria">' + segOptions + '</select></div>' +
              '<div class="prs-edit-row"><label>Potencial USD</label><input type="number" name="potencial_usd" value="' + (Number(lead.potencial_usd) || 0) + '" min="0" step="1000"></div>' +
              '<div class="prs-edit-row"><label>Score IA</label><input type="number" name="score_ia" value="' + (Number(lead.score_ia) || 0) + '" min="0" max="100"></div>' +
              '<div class="prs-edit-row"><label>Latitud</label><input type="number" name="lat" value="' + (Number(lead.lat) || '') + '" step="0.0001"></div>' +
              '<div class="prs-edit-row"><label>Longitud</label><input type="number" name="lng" value="' + (Number(lead.lng) || '') + '" step="0.0001"></div>' +
              '<button type="submit" class="btn primary" style="width:100%;margin-top:8px;"><i class="fas fa-save"></i> Guardar Cambios</button>' +
            '</form>' +
          '</div>' +
        '</div>' +
      '</div>';

    var overlay = qs('#prs-drawer-overlay');
    var drawer = qs('#prs-drawer');
    if (overlay) overlay.classList.add('open');
    if (drawer) drawer.classList.add('open');

    // Tab switching
    qsa('.prs-drawer-tab', body).forEach(function (tab) {
      tab.addEventListener('click', function () {
        qsa('.prs-drawer-tab', body).forEach(function (t) { t.classList.remove('active'); });
        qsa('.prs-drawer-panel', body).forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        var panel = qs('[data-panel="' + tab.getAttribute('data-tab') + '"]', body);
        if (panel) panel.classList.add('active');
      });
    });

    // Stage change buttons
    qsa('.prs-stage-pill', body).forEach(function (pill) {
      pill.addEventListener('click', function () {
        var newStage = this.getAttribute('data-stage');
        if (lead.estado === newStage) return;
        lead.estado = newStage;
        iconCache = {};
        applyFilters();
        renderAll();
        if (typeof showToast === 'function') showToast('Etapa cambiada a ' + STAGES[newStage].label, 'ok');
        openDrawer(leadId);
        fetch('/api/prospectos/' + lead.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') },
          body: JSON.stringify({ estado: newStage })
        }).catch(function () {});
      });
    });

    // Similar lead clicks
    qsa('.prs-similar-lead', body).forEach(function (el) {
      el.addEventListener('click', function () {
        var sid = this.getAttribute('data-id');
        if (sid) openDrawer(sid);
      });
    });

    // Photo upload
    var photoZone = qs('#prs-photo-zone');
    var photoInput = qs('#prs-photo-input');
    var photoPreview = qs('#prs-photo-preview');
    var photoImg = qs('#prs-photo-img');
    var photoRemove = qs('#prs-photo-remove');
    if (photoZone && photoInput) {
      photoZone.addEventListener('click', function () { photoInput.click(); });
      photoInput.addEventListener('change', function () {
        var file = this.files && this.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          if (photoImg) photoImg.src = ev.target.result;
          if (photoZone) photoZone.style.display = 'none';
          if (photoPreview) photoPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      });
      if (photoRemove) {
        photoRemove.addEventListener('click', function () {
          if (photoImg) photoImg.src = '';
          if (photoInput) photoInput.value = '';
          if (photoZone) photoZone.style.display = '';
          if (photoPreview) photoPreview.style.display = 'none';
        });
      }
    }

    // Generate email template
    var genEmailBtn = qs('#prs-gen-email');
    var emailPreview = qs('#prs-email-preview');
    if (genEmailBtn && emailPreview) {
      genEmailBtn.addEventListener('click', function () {
        var stageTemplates = {
          prospecto: 'Me pongo en contacto para presentarle nuestro catalogo de ' + (products[0] || 'productos industriales') + ', ideales para el sector ' + (seg.label || 'industrial') + '.',
          contactado: 'Dando seguimiento a nuestra conversacion previa, me gustaria agendar una reunion para revisar como podemos apoyar sus operaciones en ' + esc(lead.zona || 'su planta') + '.',
          calificado: 'Basado en nuestro analisis de sus necesidades, he preparado una propuesta personalizada que incluye ' + products.join(', ') + '.',
          propuesta: 'Le comparto los detalles finales de nuestra propuesta con un potencial de ' + fmtFullMXN(lead.potencial_usd) + '. Quedo atento a sus comentarios.',
          negociacion: 'Respecto a los terminos que estamos negociando, me gustaria proponer una reunion esta semana para cerrar los ultimos detalles.',
          ganado: 'Gracias por su confianza. Nuestro equipo esta listo para iniciar la entrega e instalacion.',
          perdido: 'Agradezco el tiempo invertido. Quedamos a su disposicion para futuras necesidades.'
        };
        var template = stageTemplates[lead.estado] || stageTemplates.prospecto;
        emailPreview.style.display = 'block';
        emailPreview.innerHTML = '<div class="prs-email-template">' +
          '<div class="prs-email-template__header"><strong>Para:</strong> ' + esc(lead.email || 'contacto@empresa.com') + '</div>' +
          '<div class="prs-email-template__header"><strong>Asunto:</strong> ' + esc(lead.empresa) + ' - Propuesta Comercial</div>' +
          '<div class="prs-email-template__body">' +
            '<p>Estimado/a ' + esc(lead.contacto || 'responsable') + ',</p>' +
            '<p>' + template + '</p>' +
            '<p>Saludos cordiales.</p>' +
          '</div>' +
          '<div class="prs-email-template__actions">' +
            '<a href="mailto:' + esc(lead.email || '') + '?subject=' + encodeURIComponent(lead.empresa + ' - Propuesta Comercial') + '" class="btn primary small"><i class="fas fa-paper-plane"></i> Enviar</a>' +
            '<button class="btn outline small prs-copy-email"><i class="fas fa-copy"></i> Copiar</button>' +
          '</div>' +
        '</div>';
        var copyBtn = emailPreview.querySelector('.prs-copy-email');
        if (copyBtn) {
          copyBtn.addEventListener('click', function () {
            var text = emailPreview.querySelector('.prs-email-template__body');
            if (text && navigator.clipboard) {
              navigator.clipboard.writeText(text.textContent).then(function () {
                if (typeof showToast === 'function') showToast('Email copiado', 'ok');
              });
            }
          });
        }
      });
    }

    // Notes auto-save
    var notesArea = qs('#prs-notes-area');
    var notesStatus = qs('#prs-notes-status');
    var noteTimer;
    if (notesArea) {
      notesArea.addEventListener('input', function () {
        clearTimeout(noteTimer);
        if (notesStatus) notesStatus.textContent = 'Guardando...';
        noteTimer = setTimeout(function () {
          saveNote(leadId, notesArea.value);
          if (notesStatus) notesStatus.textContent = 'Guardado ✓';
        }, 600);
      });
    }

    // Edit form
    var editForm = qs('#prs-edit-form');
    if (editForm) {
      editForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(editForm);
        var payload = {};
        fd.forEach(function (val, key) {
          if (key === 'potencial_usd' || key === 'score_ia' || key === 'lat' || key === 'lng') {
            lead[key] = Number(val) || 0;
            payload[key] = lead[key];
          } else {
            lead[key] = val;
            payload[key] = val;
          }
        });
        iconCache = {};
        applyFilters();
        renderAll();
        if (typeof showToast === 'function') showToast('Lead actualizado', 'ok');
        openDrawer(leadId);
        fetch('/api/prospectos/' + lead.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') },
          body: JSON.stringify(payload)
        }).catch(function () {});
      });
    }

    // Route button
    var routeBtn = qs('#prs-add-to-route');
    if (routeBtn) {
      routeBtn.addEventListener('click', function () {
        var lid = this.getAttribute('data-id');
        var idx = state.routeLeadIds.indexOf(lid);
        if (idx >= 0) state.routeLeadIds.splice(idx, 1);
        else state.routeLeadIds.push(lid);
        this.innerHTML = '<i class="fas fa-route"></i> ' + (state.routeLeadIds.indexOf(lid) >= 0 ? 'Quitar de Ruta' : 'Agregar a Ruta');
        updateRouteButton();
      });
    }

    renderSidebarList();
  }

  function closeDrawer() {
    state.focusedLeadId = null;
    var overlay = qs('#prs-drawer-overlay');
    var drawer = qs('#prs-drawer');
    if (overlay) overlay.classList.remove('open');
    if (drawer) drawer.classList.remove('open');
    renderSidebarList();
  }

  /* ----------------------------------------------------------
   * 11. ROUTE PLANNER
   * ---------------------------------------------------------- */
  function updateRouteButton() {
    var btn = qs('#prs-route-btn');
    if (btn) {
      btn.style.display = state.routeLeadIds.length >= 2 ? 'flex' : 'none';
      var spanEl = btn.querySelector('span');
      if (spanEl) spanEl.textContent = state.routeLeadIds.length + ' paradas';
    }
  }

  function openRoutePlanner() {
    var modal = qs('#prs-route-overlay');
    if (!modal) return;
    modal.classList.add('open');
    renderRouteStops();
    var routeMapEl = qs('#prs-route-map');
    if (routeMapEl && routeMapEl._routeMap) {
      setTimeout(function () { routeMapEl._routeMap.invalidateSize(); }, 300);
    }
    calculateRoute();
  }
  function closeRoutePlanner() {
    var modal = qs('#prs-route-overlay');
    if (modal) modal.classList.remove('open');
    clearRouteFromMap();
  }

  function renderRouteStops() {
    var list = qs('#prs-route-stops');
    if (!list) return;
    var html = '';
    for (var i = 0; i < state.routeLeadIds.length; i++) {
      var lead = null;
      for (var j = 0; j < state.allLeads.length; j++) {
        if (state.allLeads[j].id === state.routeLeadIds[i]) { lead = state.allLeads[j]; break; }
      }
      if (!lead) continue;
      html += '<div class="prospeccion-route-stop">' +
        '<div class="prospeccion-route-stop__number">' + (i + 1) + '</div>' +
        '<div class="prospeccion-route-stop__info">' +
          '<div class="prospeccion-route-stop__name">' + esc(lead.empresa) + '</div>' +
          '<div class="prospeccion-route-stop__detail">' + esc(lead.zona || '') + '</div>' +
        '</div>' +
        '<button class="prospeccion-route-stop__remove" data-id="' + lead.id + '" title="Quitar"><i class="fas fa-times"></i></button>' +
      '</div>';
    }
    list.innerHTML = html || '<div style="padding:24px;text-align:center;color:var(--prs-text-muted);font-size:0.8rem;">Agrega al menos 2 leads a la ruta desde el detalle.</div>';
  }

  function clearRouteFromMap() {
    if (state.routePolyline) {
      state.map.removeLayer(state.routePolyline);
      state.routePolyline = null;
    }
    for (var i = 0; i < state.routeMarkers.length; i++) {
      state.map.removeLayer(state.routeMarkers[i]);
    }
    state.routeMarkers = [];
  }

  function calculateRoute() {
    if (state.routeLeadIds.length < 2) {
      var summary = qs('#prs-route-summary');
      if (summary) summary.innerHTML = '<div style="padding:12px;text-align:center;color:var(--prs-text-muted);font-size:0.8rem;">Selecciona al menos 2 paradas</div>';
      return;
    }

    // Get leads in route order
    var leads = [];
    for (var i = 0; i < state.routeLeadIds.length; i++) {
      for (var j = 0; j < state.allLeads.length; j++) {
        if (state.allLeads[j].id === state.routeLeadIds[i]) {
          leads.push(state.allLeads[j]);
          break;
        }
      }
    }

    // Nearest-neighbor optimization
    var optimized = optimizeNearestNeighbor(leads);

    // Build OSRM URL for multi-stop route
    var coords = optimized.map(function (l) { return l.lng + ',' + l.lat; }).join(';');
    var osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' + coords + '?overview=full&geometries=geojson';

    fetch(osrmUrl).then(function (res) { return res.json(); }).then(function (data) {
      if (!data.routes || !data.routes.length) return;
      var route = data.routes[0];
      var routeCoords = route.geometry.coordinates.map(function (c) { return [c[1], c[0]]; });

      // Draw on map
      clearRouteFromMap();
      if (state.map) {
        state.routePolyline = L.polyline(routeCoords, {
          color: '#3b82f6', weight: 4, opacity: 0.8, dashArray: '8 6'
        }).addTo(state.map);

        for (var k = 0; k < optimized.length; k++) {
          var stopIcon = L.divIcon({
            html: '<div style="width:24px;height:24px;border-radius:50%;background:#3b82f6;color:white;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">' + (k + 1) + '</div>',
            className: 'prospeccion-marker-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });
          var sm = L.marker([Number(optimized[k].lat), Number(optimized[k].lng)], { icon: stopIcon }).addTo(state.map);
          state.routeMarkers.push(sm);
        }

        state.map.fitBounds(state.routePolyline.getBounds().pad(0.1));
      }

      // Update route map inside modal
      var routeMapEl = qs('#prs-route-map');
      if (routeMapEl && routeMapEl._routeMap) {
        var rm = routeMapEl._routeMap;
        if (routeMapEl._routePoly) rm.removeLayer(routeMapEl._routePoly);
        routeMapEl._routePoly = L.polyline(routeCoords, { color: '#3b82f6', weight: 4, opacity: 0.8 }).addTo(rm);
        rm.fitBounds(routeMapEl._routePoly.getBounds().pad(0.1));
      }

      // Summary
      var summary = qs('#prs-route-summary');
      if (summary) {
        var distKm = Math.round(route.distance / 1000);
        var durMin = Math.round(route.duration / 60);
        var durH = Math.floor(durMin / 60);
        var durM = durMin % 60;
        var durStr = durH > 0 ? durH + 'h ' + durM + ' min' : durM + ' min';
        summary.innerHTML =
          '<div class="prospeccion-route-stat"><div class="prospeccion-route-stat__value">' + distKm + ' km</div><div class="prospeccion-route-stat__label">Distancia</div></div>' +
          '<div class="prospeccion-route-stat"><div class="prospeccion-route-stat__value">' + durStr + '</div><div class="prospeccion-route-stat__label">Tiempo Est.</div></div>' +
          '<div class="prospeccion-route-stat"><div class="prospeccion-route-stat__value">' + optimized.length + '</div><div class="prospeccion-route-stat__label">Paradas</div></div>';
      }
    }).catch(function (err) {
      console.warn('OSRM route error:', err);
      // Fallback: show straight-line distances
      var summary = qs('#prs-route-summary');
      if (summary) {
        var totalDist = 0;
        for (var d = 1; d < optimized.length; d++) {
          totalDist += haversineKm(optimized[d - 1], optimized[d]);
        }
        summary.innerHTML =
          '<div class="prospeccion-route-stat"><div class="prospeccion-route-stat__value">~' + totalDist + ' km</div><div class="prospeccion-route-stat__label">Distancia (linea)</div></div>' +
          '<div class="prospeccion-route-stat"><div class="prospeccion-route-stat__value">' + optimized.length + '</div><div class="prospeccion-route-stat__label">Paradas</div></div>';
      }
    });
  }

  function optimizeNearestNeighbor(leads) {
    if (leads.length <= 2) return leads.slice();
    var remaining = leads.slice();
    var result = [remaining.shift()];
    while (remaining.length) {
      var last = result[result.length - 1];
      var nearest = 0, minDist = Infinity;
      for (var i = 0; i < remaining.length; i++) {
        var d = haversineKm(last, remaining[i]);
        if (d < minDist) { minDist = d; nearest = i; }
      }
      result.push(remaining.splice(nearest, 1)[0]);
    }
    return result;
  }

  /* ----------------------------------------------------------
   * 12. EXPORT / IMPORT
   * ---------------------------------------------------------- */
  function exportCSV() {
    var rows = state.filtered;
    if (!rows.length) {
      if (typeof showToast === 'function') showToast('No hay leads para exportar.', 'error');
      return;
    }
    var headers = ['id', 'empresa', 'zona', 'lat', 'lng', 'industria', 'tipo_interes', 'potencial_usd', 'score_ia', 'estado', 'ultimo_contacto', 'contacto', 'telefono', 'email', 'notas'];
    var lines = [headers.join(',')];
    for (var i = 0; i < rows.length; i++) {
      var vals = headers.map(function (h) {
        var v = String(rows[i][h] || '');
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      });
      lines.push(vals.join(','));
    }
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'prospeccion-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  function openImportModal() {
    var modal = qs('#prs-import-modal');
    if (modal) modal.classList.add('open');
  }
  function closeImportModal() {
    var modal = qs('#prs-import-modal');
    if (modal) modal.classList.remove('open');
  }

  function handleImportFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var text = e.target.result;
      var imported = [];
      if (file.name.endsWith('.json')) {
        try {
          var data = JSON.parse(text);
          imported = Array.isArray(data) ? data : [data];
        } catch (_) { if (typeof showToast === 'function') showToast('JSON invalido', 'error'); return; }
      } else {
        // CSV
        var lines = text.split('\n').filter(function (l) { return l.trim(); });
        if (lines.length < 2) return;
        var headers = lines[0].split(',').map(function (h) { return h.trim().replace(/^"|"$/g, ''); });
        for (var i = 1; i < lines.length; i++) {
          var vals = lines[i].split(',');
          var obj = {};
          for (var j = 0; j < headers.length; j++) {
            obj[headers[j]] = (vals[j] || '').replace(/^"|"$/g, '').trim();
          }
          if (obj.empresa) imported.push(obj);
        }
      }
      if (imported.length) {
        // Assign IDs if missing
        for (var k = 0; k < imported.length; k++) {
          if (!imported[k].id) imported[k].id = 'imp' + Date.now() + '_' + k;
          imported[k].potencial_usd = Number(imported[k].potencial_usd) || 0;
          imported[k].score_ia = Number(imported[k].score_ia) || 50;
          imported[k].lat = Number(imported[k].lat) || 0;
          imported[k].lng = Number(imported[k].lng) || 0;
        }
        state.allLeads = state.allLeads.concat(imported);
        applyFilters();
        renderAll();
        if (typeof showToast === 'function') showToast(imported.length + ' leads importados', 'ok');
      }
      closeImportModal();
    };
    reader.readAsText(file);
  }

  /* ----------------------------------------------------------
   * 13. RENDER ALL
   * ---------------------------------------------------------- */
  function renderAll() {
    renderKPIs();
    renderSidebar();
    renderMapMarkers();
    updateRouteButton();
    updateCoverageBadge();
  }

  function updateCoverageBadge() {
    var badge = qs('#prs-coverage-badge');
    if (!badge) {
      var container = qs('#prospeccion-map-chrome');
      if (!container) return;
      badge = document.createElement('div');
      badge.id = 'prs-coverage-badge';
      badge.className = 'prs-coverage-badge';
      container.appendChild(badge);
    }
    var total = state.filtered.length;
    var hot = 0;
    var totalPot = 0;
    for (var i = 0; i < state.filtered.length; i++) {
      if ((state.filtered[i].score_ia || 0) >= 85) hot++;
      totalPot += Number(state.filtered[i].potencial_usd) || 0;
    }
    badge.innerHTML = '<span class="prs-coverage-badge__count">' + total + '</span>' +
      '<span class="prs-coverage-badge__label">prospectos visibles</span>' +
      '<span style="margin-left:0.5rem;color:#fbbf24;">★ ' + hot + ' HOT</span>' +
      '<span style="margin-left:0.5rem;color:#4ade80;">' + fmtCompactMXN(totalPot) + '</span>';
  }

  /* ----------------------------------------------------------
   * 14. INIT MAP + Route Modal Map + My Location + Fullscreen
   * ---------------------------------------------------------- */
  function initMap() {
    if (state.map) return;
    var L = window.L;
    if (!L) return;

    var el = qs('#prospeccion-map-canvas');
    if (!el) return;

    state.map = L.map(el, { scrollWheelZoom: true, zoomControl: false });

    var isIndustrial = document.body && document.body.classList.contains('theme-industrial');
    var appearanceLight = document.body && document.body.classList.contains('appearance-light');
    var tileUrl;
    var tileOpts;
    if (isIndustrial) {
      if (appearanceLight) {
        tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        tileOpts = { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 20 };
      } else {
        tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
        tileOpts = { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 20 };
      }
    } else {
      tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      tileOpts = { attribution: '&copy; OpenStreetMap', maxZoom: 19 };
    }
    L.tileLayer(tileUrl, tileOpts).addTo(state.map);

    L.control.zoom({ position: 'bottomright' }).addTo(state.map);
    state.map.setView([24.5, -101.5], 5);

    initRouteModalMap(L, tileUrl, tileOpts);
    addMyLocationButton(L);
    addFullscreenButton();
  }

  function initRouteModalMap(L, tileUrl, tileOpts) {
    var routeMapEl = qs('#prs-route-map');
    if (!routeMapEl || routeMapEl._routeMap) return;
    setTimeout(function () {
      var rm = L.map(routeMapEl, { scrollWheelZoom: true, zoomControl: true });
      L.tileLayer(tileUrl, tileOpts).addTo(rm);
      rm.setView([24.5, -101.5], 5);
      routeMapEl._routeMap = rm;
      routeMapEl._routePoly = null;
    }, 300);
  }

  function addMyLocationButton(L) {
    var controls = qs('.prospeccion-map-controls');
    if (!controls || qs('#prs-my-location')) return;
    var btn = document.createElement('button');
    btn.id = 'prs-my-location';
    btn.className = 'prs-map-ctrl-btn';
    btn.title = 'Mi ubicacion';
    btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
    controls.appendChild(btn);
    var myLocMarker = null;
    btn.addEventListener('click', function () {
      btn.classList.add('locating');
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      navigator.geolocation.getCurrentPosition(function (pos) {
        btn.classList.remove('locating');
        btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
        var ll = [pos.coords.latitude, pos.coords.longitude];
        state.map.flyTo(ll, 13, { duration: 1.2 });
        if (myLocMarker) state.map.removeLayer(myLocMarker);
        myLocMarker = L.circleMarker(ll, {
          radius: 8, fillColor: '#3b82f6', fillOpacity: 1, color: '#fff', weight: 3,
          className: 'prs-my-loc-dot'
        }).addTo(state.map);
        myLocMarker.bindTooltip('Tu ubicacion', { direction: 'top', offset: [0, -10] });
        var pulse = L.circleMarker(ll, {
          radius: 20, fillColor: '#3b82f6', fillOpacity: 0.15, color: '#3b82f6', weight: 1, opacity: 0.4
        }).addTo(state.map);
        setTimeout(function () { if (pulse) state.map.removeLayer(pulse); }, 3000);
      }, function () {
        btn.classList.remove('locating');
        btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
        if (typeof showToast === 'function') showToast('No se pudo obtener ubicacion', 'error');
      }, { enableHighAccuracy: true, timeout: 8000 });
    });
  }

  function addFullscreenButton() {
    var controls = qs('.prospeccion-map-controls');
    if (!controls || qs('#prs-fullscreen')) return;
    var btn = document.createElement('button');
    btn.id = 'prs-fullscreen';
    btn.className = 'prs-map-ctrl-btn';
    btn.title = 'Pantalla completa';
    btn.innerHTML = '<i class="fas fa-expand"></i>';
    controls.appendChild(btn);
    btn.addEventListener('click', function () {
      var container = qs('.prospeccion-map-container');
      if (!container) return;
      container.classList.toggle('prs-fullscreen-mode');
      var isFS = container.classList.contains('prs-fullscreen-mode');
      btn.innerHTML = isFS ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
      btn.title = isFS ? 'Salir de pantalla completa' : 'Pantalla completa';
      document.body.style.overflow = isFS ? 'hidden' : '';
      setTimeout(function () { if (state.map) state.map.invalidateSize(); }, 350);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var container = qs('.prospeccion-map-container');
        if (container && container.classList.contains('prs-fullscreen-mode')) {
          container.classList.remove('prs-fullscreen-mode');
          btn.innerHTML = '<i class="fas fa-expand"></i>';
          document.body.style.overflow = '';
          setTimeout(function () { if (state.map) state.map.invalidateSize(); }, 350);
        }
      }
    });
  }

  /* ----------------------------------------------------------
   * 15. EVENT BINDING
   * ---------------------------------------------------------- */
  function bindEvents() {
    // Search
    var searchEl = qs('#prs-search');
    if (searchEl) {
      var searchTimer;
      searchEl.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          state.searchQuery = searchEl.value.trim();
          applyFilters();
          renderAll();
        }, 200);
      });
    }

    // Stage pills (delegated)
    var stagePills = qs('#prs-stage-pills');
    if (stagePills) {
      stagePills.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-stage]');
        if (!btn) return;
        var val = btn.getAttribute('data-stage');
        var idx = state.selectedStages.indexOf(val);
        if (idx >= 0) state.selectedStages.splice(idx, 1);
        else state.selectedStages.push(val);
        applyFilters();
        renderAll();
      });
    }

    // Segment pills (delegated)
    var segPills = qs('#prs-segment-pills');
    if (segPills) {
      segPills.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-segment]');
        if (!btn) return;
        var val = btn.getAttribute('data-segment');
        var idx = state.selectedSegments.indexOf(val);
        if (idx >= 0) state.selectedSegments.splice(idx, 1);
        else state.selectedSegments.push(val);
        applyFilters();
        renderAll();
      });
    }

    // Clear filters
    var clearStages = qs('#prs-clear-stages');
    if (clearStages) {
      clearStages.addEventListener('click', function () {
        state.selectedStages = [];
        applyFilters();
        renderAll();
      });
    }
    var clearSegments = qs('#prs-clear-segments');
    if (clearSegments) {
      clearSegments.addEventListener('click', function () {
        state.selectedSegments = [];
        applyFilters();
        renderAll();
      });
    }

    // Min potential slider
    var potSlider = qs('#prs-potential-slider');
    var potValue = qs('#prs-potential-value');
    if (potSlider) {
      potSlider.addEventListener('input', function () {
        state.minPotential = Number(potSlider.value) || 0;
        if (potValue) potValue.textContent = fmtCompactMXN(state.minPotential);
        applyFilters();
        renderAll();
      });
    }

    // Hot toggle
    var hotToggle = qs('#prs-hot-toggle');
    if (hotToggle) {
      hotToggle.addEventListener('click', function () {
        state.hotOnly = !state.hotOnly;
        hotToggle.classList.toggle('on', state.hotOnly);
        applyFilters();
        renderAll();
      });
    }

    // Sort select
    var sortSelect = qs('#prs-sort');
    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        state.sortBy = sortSelect.value;
        applyFilters();
        renderAll();
      });
    }

    // Lead card click (delegated)
    var leadList = qs('#prs-lead-list');
    if (leadList) {
      leadList.addEventListener('click', function (e) {
        var card = e.target.closest('[data-lead-id]');
        if (card) openDrawer(card.getAttribute('data-lead-id'));
      });
    }

    // Pagination (delegated)
    var pagEl = qs('#prs-pagination');
    if (pagEl) {
      pagEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-page]');
        if (!btn || btn.disabled) return;
        var val = btn.getAttribute('data-page');
        if (val === 'prev') state.currentPage = Math.max(1, state.currentPage - 1);
        else if (val === 'next') state.currentPage = Math.min(Math.ceil(state.filtered.length / state.pageSize), state.currentPage + 1);
        else state.currentPage = Number(val);
        renderSidebarList();
      });
    }

    // View mode toggle
    qsa('.prospeccion-view-toggle__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.viewMode = btn.getAttribute('data-mode');
        qsa('.prospeccion-view-toggle__btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderMapMarkers();
      });
    });

    function setProspeccionSidebarOpen(isOpen) {
      state.sidebarOpen = !!isOpen;
      var sidebar = qs('#prs-sidebar');
      var sidebarToggle = qs('#prs-sidebar-toggle');
      var collapseBtn = qs('#prs-sidebar-collapse');
      var mapChrome = qs('#prospeccion-map-chrome');
      if (sidebar) {
        sidebar.classList.toggle('collapsed', !state.sidebarOpen);
        sidebar.setAttribute('aria-hidden', state.sidebarOpen ? 'false' : 'true');
      }
      if (mapChrome) mapChrome.classList.toggle('prospeccion-map-container--sidebar-collapsed', !state.sidebarOpen);
      if (sidebarToggle) {
        sidebarToggle.classList.toggle('shifted', state.sidebarOpen);
        sidebarToggle.innerHTML = state.sidebarOpen ? '<i class="fas fa-chevron-left" aria-hidden="true"></i>' : '<i class="fas fa-chevron-right" aria-hidden="true"></i>';
        sidebarToggle.setAttribute('aria-expanded', state.sidebarOpen ? 'true' : 'false');
        sidebarToggle.setAttribute('title', state.sidebarOpen ? 'Ocultar panel de filtros' : 'Mostrar panel de filtros');
      }
      if (collapseBtn) {
        collapseBtn.setAttribute('aria-expanded', state.sidebarOpen ? 'true' : 'false');
        collapseBtn.setAttribute('title', state.sidebarOpen ? 'Ocultar panel y ver el mapa completo' : '');
        collapseBtn.hidden = !state.sidebarOpen;
      }
      setTimeout(function () { if (state.map) state.map.invalidateSize(); }, 350);
    }

    function toggleProspeccionSidebar() {
      setProspeccionSidebarOpen(!state.sidebarOpen);
    }

    // Sidebar toggle (borde del mapa) + botón "Ocultar" dentro del panel
    var sidebarToggle = qs('#prs-sidebar-toggle');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', toggleProspeccionSidebar);
    }
    var sidebarCollapse = qs('#prs-sidebar-collapse');
    if (sidebarCollapse) {
      sidebarCollapse.addEventListener('click', toggleProspeccionSidebar);
    }

    // Drawer close
    var drawerClose = qs('#prs-drawer-close');
    if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
    var drawerOverlay = qs('#prs-drawer-overlay');
    if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);

    // Route planner
    var routeBtn = qs('#prs-route-btn');
    if (routeBtn) routeBtn.addEventListener('click', openRoutePlanner);
    var routeClose = qs('#prs-route-close');
    if (routeClose) routeClose.addEventListener('click', closeRoutePlanner);
    var routeOverlay = qs('#prs-route-overlay');
    if (routeOverlay) {
      routeOverlay.addEventListener('click', function (e) {
        if (e.target === routeOverlay) closeRoutePlanner();
      });
    }
    // Route stop remove (delegated)
    var routeStops = qs('#prs-route-stops');
    if (routeStops) {
      routeStops.addEventListener('click', function (e) {
        var btn = e.target.closest('.prospeccion-route-stop__remove');
        if (!btn) return;
        var id = btn.getAttribute('data-id');
        var idx = state.routeLeadIds.indexOf(id);
        if (idx >= 0) state.routeLeadIds.splice(idx, 1);
        renderRouteStops();
        calculateRoute();
        updateRouteButton();
      });
    }

    // Toolbar buttons
    var refreshBtn = qs('#prs-btn-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { loadData(); });
    var csvBtn = qs('#prs-btn-csv');
    if (csvBtn) csvBtn.addEventListener('click', exportCSV);
    var importBtn = qs('#prs-btn-import');
    if (importBtn) importBtn.addEventListener('click', openImportModal);
    var importClose = qs('#prs-import-close');
    if (importClose) importClose.addEventListener('click', closeImportModal);
    var importModal = qs('#prs-import-modal');
    if (importModal) {
      importModal.addEventListener('click', function (e) { if (e.target === importModal) closeImportModal(); });
    }

    // Import dropzone
    var dropzone = qs('#prs-import-dropzone');
    if (dropzone) {
      dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.classList.add('dragover'); });
      dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('dragover'); });
      dropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleImportFile(e.dataTransfer.files[0]);
      });
      dropzone.addEventListener('click', function () {
        var inp = qs('#prs-import-file');
        if (inp) inp.click();
      });
    }
    var importFileInput = qs('#prs-import-file');
    if (importFileInput) {
      importFileInput.addEventListener('change', function () {
        if (this.files.length) handleImportFile(this.files[0]);
      });
    }

    // Table toggle
    var tableToggle = qs('#prs-table-toggle');
    if (tableToggle) {
      tableToggle.addEventListener('click', function () {
        var wrap = qs('#prs-table-wrap');
        if (wrap) {
          var visible = wrap.style.display !== 'none';
          wrap.style.display = visible ? 'none' : 'block';
          tableToggle.classList.toggle('expanded', !visible);
        }
      });
    }
  }

  /* ----------------------------------------------------------
   * 16. DATA LOADING
   * ---------------------------------------------------------- */
  async function loadData() {
    try {
      // Try API first
      if (typeof window.fetchJson === 'function') {
        var API = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || '/api';
        var data = await window.fetchJson(API + '/prospectos');
        if (Array.isArray(data) && data.length > 0) {
          state.allLeads = data;
        } else {
          // Use seed data if API returns empty
          state.allLeads = SEED_DATA.slice();
        }
      } else {
        // Fallback: try fetch
        var resp = await fetch('/api/prospectos', {
          headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
        });
        if (resp.ok) {
          var jsonData = await resp.json();
          state.allLeads = Array.isArray(jsonData) ? jsonData : (jsonData.data || SEED_DATA.slice());
        } else {
          state.allLeads = SEED_DATA.slice();
        }
      }
    } catch (err) {
      console.warn('ProspeccionMap: API unavailable, using seed data.', err.message);
      state.allLeads = SEED_DATA.slice();
    }
    applyFilters();
    renderAll();
    // Invalidate map size after render
    setTimeout(function () { if (state.map) state.map.invalidateSize(); }, 300);
  }

  /* ----------------------------------------------------------
   * 17. TABLE RENDER (legacy compatibility)
   * ---------------------------------------------------------- */
  function renderTable() {
    var tbody = qs('#prs-table-body');
    if (!tbody) return;
    var rows = state.filtered;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty">Sin datos. Los leads aparecen aqui cuando hay prospectos cargados.</td></tr>';
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var stage = STAGES[r.estado] || STAGES.prospecto;
      html += '<tr style="cursor:pointer;" data-lead-id="' + r.id + '">' +
        '<td>' + esc(r.empresa) + '</td>' +
        '<td>' + esc(r.zona || '') + '</td>' +
        '<td><span style="color:' + stage.color + '">' + stage.label + '</span></td>' +
        '<td>' + esc((SEGMENTS[r.industria] || {}).label || r.industria || '') + '</td>' +
        '<td>' + esc(r.tipo_interes || '') + '</td>' +
        '<td>' + fmtCompactMXN(r.potencial_usd) + '</td>' +
        '<td><span style="font-weight:700;color:' + scoreColor(Number(r.score_ia) || 0) + '">' + Math.round(Number(r.score_ia) || 0) + '</span></td>' +
        '<td>' + fmtRelative(r.ultimo_contacto) + '</td>' +
        '<td>' + esc((r.notas || '').slice(0, 80)) + (r.notas && r.notas.length > 80 ? '…' : '') + '</td>' +
      '</tr>';
    }
    tbody.innerHTML = html;

    if (!tbody._prsClickBound) {
      tbody._prsClickBound = true;
      tbody.addEventListener('click', function (e) {
        var tr = e.target.closest('[data-lead-id]');
        if (tr) openDrawer(tr.getAttribute('data-lead-id'));
      });
    }

    var foot = qs('#prs-table-footer');
    if (foot) foot.textContent = rows.length + ' fila(s)';
  }

  /* ----------------------------------------------------------
   * 18. MAIN INIT (called when panel becomes visible)
   * ---------------------------------------------------------- */
  async function init() {
    if (state.initialized) {
      // Just refresh map size
      setTimeout(function () { if (state.map) state.map.invalidateSize(); }, 200);
      return;
    }
    state.initialized = true;

    try {
      // Ensure Leaflet is loaded
      if (!window.L || typeof window.L.map !== 'function') {
        await new Promise(function (resolve, reject) {
          if (window.L && typeof window.L.map === 'function') { resolve(); return; }
          var href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          if (!document.querySelector('link[href="' + href + '"]')) {
            var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.appendChild(link);
          }
          var s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.async = true;
          s.onload = resolve; s.onerror = reject;
          document.body.appendChild(s);
        });
      }
      // Load plugins
      await ensurePlugins();
    } catch (err) {
      console.error('Failed to load map libraries:', err);
    }

    initMap();
    bindEvents();
    await loadData();
    renderTable();
  }

  /* ----------------------------------------------------------
   * 19. PUBLIC API
   * ---------------------------------------------------------- */
  window.ProspeccionMap = {
    init: init,
    loadData: loadData,
    getState: function () { return state; },
    exportCSV: exportCSV,
    SEED_DATA: SEED_DATA,
    STAGES: STAGES,
    SEGMENTS: SEGMENTS
  };

  // Also keep backward-compatible loadProspeccion
  window.loadProspeccion = function () {
    init();
  };

})();
