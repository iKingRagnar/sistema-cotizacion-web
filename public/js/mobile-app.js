/* mobile-app.js v6 — adaptado a v3 */
(function(){
'use strict';
const API='/api', TK='m-auth-token', UK='m-auth-user';
let page='dashboard', cache={}, stack=[];

function tok(){ return localStorage.getItem(TK)||''; }
function hdrs(){ return {'Content-Type':'application/json','Authorization':'Bearer '+tok()}; }
function user(){ try{return JSON.parse(localStorage.getItem(UK)||'null');}catch{return null;} }
function loader(){ return '<div class="m-loader"><div class="m-spinner"></div><span>Cargando…</span></div>'; }
function empty(t){ return '<div class="m-empty"><i class="fas fa-inbox"></i><p>'+(t||'Sin resultados')+'</p></div>'; }
function fmt(n,c){ if(n==null||n==='')return '—'; const x=parseFloat(n); return isNaN(x)?String(n):(c||'')+ x.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function badge(e){ if(!e)return ''; const s=e.toLowerCase(); let c='muted'; if(/aprobad|pagad|activ|vendid|complet|entregad/.test(s))c='ok'; else if(/pendient|proceso|revisión/.test(s))c='warn'; else if(/cancelad|rechazad|vencid/.test(s))c='danger'; else if(/borrador|nueva/.test(s))c='info'; return '<span class="m-badge '+c+'">'+e+'</span>'; }
function toast(m,ms=2800){ const el=document.getElementById('m-toast'); if(!el)return; el.textContent=m; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),ms); }
function infoBlock(rows){ return '<div class="m-info-block">'+rows.filter(([,v])=>v!=null&&v!=='').map(([k,v])=>'<div class="m-info-row"><span class="m-info-key">'+k+'</span><span class="m-info-val">'+v+'</span></div>').join('')+'</div>'; }
function actionBtns(html){ return '<p class="m-section-title mt-16">Acciones</p><div style="display:flex;flex-direction:column;gap:10px">'+html+'</div>'; }
function btnPrimary(onclick,icon,label){ return '<button class="m-btn-primary" onclick="'+onclick+'"><i class="fas fa-'+icon+'"></i> '+label+'</button>'; }
function btnSecondary(onclick,icon,label){ return '<button class="m-btn-primary" style="background:var(--clr-surface2);color:var(--clr-text);border:1px solid var(--clr-border)" onclick="'+onclick+'"><i class="fas fa-'+icon+'"></i> '+label+'</button>'; }

/* ── NAV ── */
function showPage(id){
  document.querySelectorAll('.m-page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.m-nav-btn').forEach(b=>b.classList.remove('active'));
  const pg=document.getElementById('page-'+id);
  const btn=document.querySelector('.m-nav-btn[data-page="'+id+'"]');
  if(pg){pg.classList.add('active');page=id;}
  if(btn)btn.classList.add('active');
  document.getElementById('m-content').scrollTop=0;
  loadPage(id);
}
function showDetail(html,title){
  const det=document.getElementById('page-detail');
  det.innerHTML='<div class="m-detail-header"><button onclick="window.mBack()"><i class="fas fa-arrow-left"></i></button><div class="m-detail-title">'+title+'</div></div>'+html;
  stack.push(page);
  document.querySelectorAll('.m-page').forEach(p=>p.classList.remove('active'));
  det.classList.add('active');
  document.getElementById('m-content').scrollTop=0;
}
window.mBack=()=>{ showPage(stack.pop()||'dashboard'); };
window.mGo=id=>showPage(id);

function loadPage(id){
  if(id==='dashboard') loadDash();
  else if(id==='clientes') loadClientes();
  else if(id==='maquinas') loadMaquinas();
  else if(id==='refacciones') loadRefacciones();
  else if(id==='cotizaciones') loadCotizaciones();
  else if(id==='ventas') loadGeneric('ventas','ventas',['cliente_nombre','folio_factura'],(r)=>r.cliente_nombre||'—','check-double','green',r=>[['Cliente',r.cliente_nombre],['Factura',r.folio_factura],['Fecha',r.fecha_venta],['Total',fmt(r.total,'$')],['Moneda',r.moneda],['Pagado',r.pagado?'Sí':'No'],['Notas',r.notas]]);
  else if(id==='garantias') loadGeneric('garantias','garantias',['razon_social','modelo_maquina','numero_serie'],(r)=>r.razon_social||r.modelo_maquina||'—','shield-alt','green',r=>[['Cliente',r.razon_social],['Máquina',r.modelo_maquina],['Serie',r.numero_serie],['Inicio',r.fecha_inicio],['Fin',r.fecha_fin],['Activa',r.activa?'Sí':'No'],['Notas',r.notas]]);
  else if(id==='prospeccion') loadGeneric('prospectos','prospeccion',['empresa','contacto','ciudad'],(r)=>r.empresa||'—','map-marked-alt','blue',r=>[['Empresa',r.empresa],['Contacto',r.contacto],['Email',r.email],['Tel',r.telefono],['Ciudad',r.ciudad],['Potencial',fmt(r.potencial_usd,'$')],['Score IA',r.score_ia],['Notas',r.notas]]);
  else if(id==='tecnicos') loadGeneric('personal','tecnicos',['nombre','email'],(r)=>r.nombre||'—','user-tie','',r=>[['Nombre',r.nombre],['Rol',r.rol],['Email',r.email],['Tel',r.telefono],['Tarifa/h',fmt(r.tarifa_hora_mxn,'$')],['Notas',r.notas]]);
  else if(id==='tarifas') loadGeneric('tarifas','tarifas',['key','value'],(r)=>r.key||'—','tags','yellow',r=>[['Clave',r.key],['Valor',r.value],['Categoría',r.categoria],['Notas',r.notas]]);
  else if(id==='bitacoras') loadGeneric('bitacora_horas','bitacoras',['cliente','trabajo'],(r)=>r.cliente||r.trabajo||'—','clock','',r=>[['Fecha',r.fecha],['Cliente',r.cliente],['Trabajo',r.trabajo],['Horas',r.horas],['Inicio',r.hora_inicio],['Fin',r.hora_fin],['Notas',r.notas]]);
  else if(id==='reportes') loadReportes();
  else if(id==='incidentes') loadGeneric('revision_maquinas','incidentes',['modelo','numero_serie','comentarios'],(r)=>r.modelo||r.numero_serie||'—','exclamation-triangle','red',r=>[['Modelo',r.modelo],['Serie',r.numero_serie],['Entregado',r.entregado?'Sí':'No'],['Prueba',r.prueba],['Comentarios',r.comentarios]]);
}

/* ── DASHBOARD ── */
async function loadDash(){
  const el=document.getElementById('page-dashboard');
  el.innerHTML=loader();
  async function sf(u){ try{ const r=await fetch(u,{headers:hdrs()}); return r.ok?await r.json():[];} catch{return [];} }
  const [cl,ct,mq,rf]=await Promise.all([sf(API+'/clientes'),sf(API+'/cotizaciones'),sf(API+'/maquinas'),sf(API+'/refacciones')]);
  const cArr=Array.isArray(ct)?ct:(ct.rows||[]);
  const rArr=Array.isArray(rf)?rf:[];
  const tot=cArr.reduce((s,c)=>s+(parseFloat(c.total)||0),0);
  const apr=cArr.filter(c=>/aprobad|vendid/i.test(c.estado||'')).length;
  const stk=rArr.filter(r=>(r.stock||0)<=(r.stock_minimo||0)).length;
  const u=user();
  const mods=[
    {id:'ventas',    label:'Ventas',      icon:'check-double',        col:'green'},
    {id:'garantias', label:'Garantías',   icon:'shield-alt',          col:'green'},
    {id:'prospeccion',label:'Prospección',icon:'map-marked-alt',      col:'blue'},
    {id:'tecnicos',  label:'Personal',    icon:'user-tie',            col:''},
    {id:'tarifas',   label:'Tarifas',     icon:'tags',                col:'yellow'},
    {id:'bitacoras', label:'Bitácora',    icon:'clock',               col:''},
    {id:'incidentes',label:'Revisiones',  icon:'exclamation-triangle', col:'red'},
    {id:'reportes',  label:'Reportes',    icon:'file-csv',            col:'blue'},
  ];
  el.innerHTML=`
    <p class="m-section-title">Bienvenido, ${u?(u.nombre||u.username):'usuario'}</p>
    <div class="m-kpi-grid">
      <div class="m-kpi"><div class="m-kpi-label">Clientes</div><div class="m-kpi-value accent">${cl.length}</div><div class="m-kpi-sub">Registrados</div></div>
      <div class="m-kpi"><div class="m-kpi-label">Cotizaciones</div><div class="m-kpi-value">${cArr.length}</div><div class="m-kpi-sub">${apr} aprobadas</div></div>
      <div class="m-kpi"><div class="m-kpi-label">Valor total</div><div class="m-kpi-value" style="font-size:1.1rem">$${(tot/1000).toFixed(1)}k</div><div class="m-kpi-sub">En cotizaciones</div></div>
      <div class="m-kpi"><div class="m-kpi-label">Refacciones</div><div class="m-kpi-value">${rArr.length}</div><div class="m-kpi-sub">${stk>0?'<span style="color:var(--clr-danger)">'+stk+' bajo</span>':'Stock OK'}</div></div>
    </div>
    <p class="m-section-title mt-16">Módulos</p>
    <div class="m-modules-grid">
      ${mods.map(m=>'<div class="m-module-btn" onclick="window.mGo(\''+m.id+'\')"><div class="m-module-icon '+m.col+'"><i class="fas fa-'+m.icon+'"></i></div><span>'+m.label+'</span></div>').join('')}
    </div>`;
}

/* ── CLIENTES ── */
async function loadClientes(q=''){
  const el=document.getElementById('page-clientes');
  if(!cache.clientes){ el.innerHTML=loader(); try{ const r=await fetch(API+'/clientes',{headers:hdrs()}); cache.clientes=r.ok?await r.json():[]; }catch{ cache.clientes=[]; } }
  const list=(cache.clientes||[]).filter(c=>!q||[c.razon_social,c.rfc,c.contacto,c.ciudad,c.email].some(f=>f&&String(f).toLowerCase().includes(q.toLowerCase())));
  el.innerHTML=`<div class="m-search-wrap"><i class="fas fa-search"></i><input class="m-search" id="q-clientes" placeholder="Buscar cliente…" value="${q}" oninput="window.mSearch('clientes',this.value)"></div>
    <p class="m-section-title">${list.length} clientes</p>
    ${list.length?list.map(c=>'<div class="m-card" onclick="window.mClienteDet('+c.id+')"><div class="m-card-icon"><i class="fas fa-user"></i></div><div class="m-card-body"><div class="m-card-title">'+(c.razon_social||'—')+'</div><div class="m-card-sub">'+[c.rfc,c.ciudad].filter(Boolean).join(' · ')+'</div></div><div class="m-card-arrow"><i class="fas fa-chevron-right"></i></div></div>').join(''):empty()}`;
}
window.mClienteDet=id=>{
  const c=(cache.clientes||[]).find(x=>x.id===id); if(!c)return;
  const tel=c.telefono?'<a href="tel:'+c.telefono+'" style="color:var(--clr-accent)"><i class="fas fa-phone"></i> Llamar</a>':'';
  const wa=c.telefono?'<a href="https://wa.me/'+c.telefono.replace(/\D/g,'')+'" target="_blank" style="color:#25D366"><i class="fab fa-whatsapp"></i> WhatsApp</a>':'';
  showDetail(infoBlock([['Razón Social',c.razon_social],['RFC',c.rfc],['Contacto',c.contacto],['Teléfono',c.telefono],['Email',c.email],['Ciudad',c.ciudad],['Estado',c.estado],['Notas',c.notas]])
    +(tel||wa?'<div style="display:flex;gap:12px;margin:10px 0">'+tel+wa+'</div>':'')
    +actionBtns(btnPrimary('window.mGoCot('+id+')','file-invoice-dollar','Ver cotizaciones')), c.razon_social||'Cliente');
};
window.mGoCot=cid=>{
  stack.push('detail'); showPage('cotizaciones');
  setTimeout(()=>{ const cname=((cache.clientes||[]).find(x=>x.id===cid)||{}).razon_social||''; const inp=document.getElementById('q-cotizaciones'); if(inp&&cname){inp.value=cname;loadCotizaciones(cname);} },120);
};

/* ── MÁQUINAS ── */
async function loadMaquinas(q=''){
  const el=document.getElementById('page-maquinas');
  if(!cache.maquinas){ el.innerHTML=loader(); try{ const r=await fetch(API+'/maquinas',{headers:hdrs()}); cache.maquinas=r.ok?await r.json():[]; }catch{ cache.maquinas=[]; } }
  const list=(cache.maquinas||[]).filter(m=>!q||[m.modelo,m.numero_serie,m.cliente_nombre,m.categoria].some(f=>f&&String(f).toLowerCase().includes(q.toLowerCase())));
  el.innerHTML=`<div class="m-search-wrap"><i class="fas fa-search"></i><input class="m-search" id="q-maquinas" placeholder="Buscar máquina…" value="${q}" oninput="window.mSearch('maquinas',this.value)"></div>
    <p class="m-section-title">${list.length} máquinas</p>
    ${list.length?list.map(m=>'<div class="m-card" onclick="window.mMaqDet('+m.id+')"><div class="m-card-icon yellow"><i class="fas fa-industry"></i></div><div class="m-card-body"><div class="m-card-title">'+(m.modelo||'—')+'</div><div class="m-card-sub">'+[m.numero_serie,m.cliente_nombre].filter(Boolean).join(' · ')+'</div></div><div class="m-card-arrow"><i class="fas fa-chevron-right"></i></div></div>').join(''):empty()}`;
}
window.mMaqDet=id=>{
  const m=(cache.maquinas||[]).find(x=>x.id===id); if(!m)return;
  showDetail(infoBlock([['Modelo',m.modelo],['Serie',m.numero_serie],['Categoría',m.categoria],['Cliente',m.cliente_nombre],['Ubicación',m.ubicacion],['Instalación',m.fecha_instalacion],['Notas',m.notas]]), m.modelo||'Máquina');
};

/* ── REFACCIONES ── */
async function loadRefacciones(q=''){
  const el=document.getElementById('page-refacciones');
  if(!el)return;
  if(!cache.refacciones){ el.innerHTML=loader(); try{ const r=await fetch(API+'/refacciones',{headers:hdrs()}); cache.refacciones=r.ok?await r.json():[]; }catch{ cache.refacciones=[]; } }
  const list=(Array.isArray(cache.refacciones)?cache.refacciones:[]).filter(a=>!q||[a.numero_parte,a.descripcion,a.categoria,a.marca].some(f=>f&&String(f).toLowerCase().includes(q.toLowerCase())));
  el.innerHTML=`<div class="m-search-wrap"><i class="fas fa-search"></i><input class="m-search" id="q-refacciones" placeholder="Buscar refacción…" value="${q}" oninput="window.mSearch('refacciones',this.value)"></div>
    <p class="m-section-title">${list.length} refacciones</p>
    ${list.length?list.map(a=>{ const bajo=(a.stock||0)<=(a.stock_minimo||0); return '<div class="m-card" onclick="window.mRefDet('+a.id+')"><div class="m-card-icon '+(bajo?'red':'green')+'"><i class="fas fa-cogs"></i></div><div class="m-card-body"><div class="m-card-title">'+(a.descripcion||a.numero_parte||'—')+'</div><div class="m-card-sub">'+(a.numero_parte||'')+' · Stock: <strong>'+(a.stock??'—')+'</strong>'+(bajo?' <span style="color:var(--clr-danger)">⚠ bajo</span>':'')+'</div></div><div class="m-card-arrow"><i class="fas fa-chevron-right"></i></div></div>'; }).join(''):empty()}`;
}
window.mRefDet=id=>{
  const a=(cache.refacciones||[]).find(x=>x.id===id); if(!a)return;
  showDetail(infoBlock([['N° Parte',a.numero_parte],['Descripción',a.descripcion],['Categoría',a.categoria],['Marca',a.marca],['Proveedor',a.proveedor],['Stock',a.stock],['Stock mín.',a.stock_minimo],['Precio MXN',fmt(a.precio_venta_mxn,'$')],['Precio USD',fmt(a.precio_venta_usd,'$')],['Ubicación',a.ubicacion],['Notas',a.notas]]), a.descripcion||a.numero_parte||'Refacción');
};

/* ── COTIZACIONES ── */
async function loadCotizaciones(q=''){
  const el=document.getElementById('page-cotizaciones');
  if(!cache.cotizaciones){ el.innerHTML=loader(); try{ const r=await fetch(API+'/cotizaciones',{headers:hdrs()}); const d=r.ok?await r.json():{}; cache.cotizaciones=Array.isArray(d)?d:(d.rows||[]); }catch{ cache.cotizaciones=[]; } }
  const list=(cache.cotizaciones||[]).filter(c=>!q||[c.folio,c.cliente_nombre,c.estado].some(f=>f&&String(f).toLowerCase().includes(q.toLowerCase())));
  el.innerHTML=`<div class="m-search-wrap"><i class="fas fa-search"></i><input class="m-search" id="q-cotizaciones" placeholder="Buscar cotización…" value="${q}" oninput="window.mSearch('cotizaciones',this.value)"></div>
    <p class="m-section-title">${list.length} cotizaciones</p>
    ${list.length?list.map(c=>'<div class="m-card" onclick="window.mCotDet('+c.id+')"><div class="m-card-icon blue"><i class="fas fa-file-invoice-dollar"></i></div><div class="m-card-body"><div class="m-card-title">'+(c.folio||'#'+c.id)+' — '+(c.cliente_nombre||'—')+'</div><div class="m-card-sub">'+badge(c.estado)+' '+fmt(c.total,'$')+' '+(c.moneda||'')+'</div></div><div class="m-card-arrow"><i class="fas fa-chevron-right"></i></div></div>').join(''):empty()}`;
}
window.mCotDet=async id=>{
  let c=(cache.cotizaciones||[]).find(x=>x.id===id);
  try{ const r=await fetch(API+'/cotizaciones/'+id,{headers:hdrs()}); if(r.ok)c=await r.json(); }catch{}
  if(!c)return;
  const items=Array.isArray(c.items)?c.items:[];
  let html=infoBlock([['Folio',c.folio],['Estado',c.estado],['Cliente',c.cliente_nombre],['Total',fmt(c.total,'$')+' '+(c.moneda||'')],['IVA',fmt(c.iva,'$')],['Subtotal',fmt(c.subtotal,'$')],['Fecha',c.fecha],['Notas',c.notas]]);
  if(items.length) html+=`<p class="m-section-title mt-16">Partidas (${items.length})</p><div class="m-info-block">${items.map(it=>'<div class="m-info-row"><span class="m-info-key">'+(it.numero_parte||'').slice(0,12)||'—'+'</span><span class="m-info-val">'+(it.descripcion||'—')+'<br><span class="text-muted">Cant: '+it.cantidad+' · '+fmt(it.precio_unitario,'$')+' · '+fmt(it.importe,'$')+'</span></span></div>').join('')}</div>`;
  showDetail(html, c.folio||'#'+id);
};

/* ── GENERIC LIST ── */
async function loadGeneric(table,pageId,searchFields,labelFn,icon,col,rowsFn){
  const el=document.getElementById('page-'+pageId);
  if(!el)return;
  if(!cache[pageId]){ el.innerHTML=loader(); try{ const r=await fetch(API+'/'+table,{headers:hdrs()}); cache[pageId]=r.ok?await r.json():[]; }catch{ cache[pageId]=[]; } }
  const list=Array.isArray(cache[pageId])?cache[pageId]:[];
  el.innerHTML=`<p class="m-section-title">${list.length} registros</p>`+(list.length?list.map(r=>'<div class="m-card" onclick="window.mGenDet(\''+pageId+'\','+r.id+')"><div class="m-card-icon '+col+'"><i class="fas fa-'+icon+'"></i></div><div class="m-card-body"><div class="m-card-title">'+labelFn(r)+'</div></div><div class="m-card-arrow"><i class="fas fa-chevron-right"></i></div></div>').join(''):empty());
  window['_det_'+pageId]=rowsFn;
}
window.mGenDet=(pid,id)=>{
  const r=(cache[pid]||[]).find(x=>x.id===id); if(!r)return;
  const fn=window['_det_'+pid]; if(!fn)return;
  showDetail(infoBlock(fn(r)), String(r.razon_social||r.empresa||r.modelo||r.nombre||r.key||'#'+id));
};

/* ── REPORTES ── */
function loadReportes(){
  const el=document.getElementById('page-reportes');
  if(!el)return;
  const tables=['clientes','refacciones','maquinas','cotizaciones','ventas','prospectos','personal','garantias','viajes','bitacora_horas'];
  el.innerHTML='<p class="m-section-title">Exportar CSV</p>'+tables.map(t=>'<div class="m-card"><div class="m-card-icon blue"><i class="fas fa-file-csv"></i></div><div class="m-card-body"><div class="m-card-title">'+t.charAt(0).toUpperCase()+t.slice(1)+'</div></div><a href="/api/export/'+t+'" download class="m-btn-primary" style="margin:0 10px;padding:6px 14px;font-size:0.8rem;text-decoration:none"><i class="fas fa-download"></i> CSV</a></div>').join('');
}

/* ── SEARCH ── */
window.mSearch=(pg,val)=>{
  if(pg==='clientes')loadClientes(val);
  else if(pg==='maquinas')loadMaquinas(val);
  else if(pg==='refacciones')loadRefacciones(val);
  else if(pg==='cotizaciones')loadCotizaciones(val);
};

/* ── LOGIN ── */
function initLogin(){
  const form=document.getElementById('m-login-form');
  if(!form)return;
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const u=document.getElementById('m-login-user').value.trim();
    const p=document.getElementById('m-login-pass').value;
    const btn=document.getElementById('m-login-btn');
    const err=document.getElementById('m-login-err');
    btn.disabled=true; btn.textContent='Entrando…'; err.textContent='';
    try{
      const r=await fetch(API+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'Error');
      localStorage.setItem(TK,d.token);
      localStorage.setItem(UK,JSON.stringify(d.user||{}));
      document.getElementById('m-login').classList.add('hidden');
      initApp();
    }catch(ex){ err.textContent=ex.message; }
    finally{ btn.disabled=false; btn.textContent='Entrar'; }
  });
}

/* ── USER DRAWER ── */
function initDrawer(){
  const drawer=document.getElementById('m-user-drawer');
  const overlay=document.getElementById('m-drawer-overlay');
  const openBtn=document.getElementById('m-user-btn');
  if(!drawer)return;
  openBtn.addEventListener('click',()=>{
    const u=user();
    document.getElementById('m-drawer-name').textContent=u?(u.nombre||u.username):'—';
    document.getElementById('m-drawer-role').textContent=u?(u.role||''):'';
    drawer.classList.add('open'); overlay.classList.add('open');
  });
  overlay.addEventListener('click',()=>{ drawer.classList.remove('open'); overlay.classList.remove('open'); });
  document.getElementById('m-drawer-logout').addEventListener('click',()=>{ localStorage.removeItem(TK); localStorage.removeItem(UK); location.reload(); });
}

/* ── NAV INIT ── */
function initNav(){
  document.querySelectorAll('.m-nav-btn').forEach(btn=>btn.addEventListener('click',()=>{ stack=[]; showPage(btn.dataset.page); }));
}

/* ── BOOT ── */
function initApp(){
  const u=user();
  if(u){ document.getElementById('m-login').classList.add('hidden'); document.getElementById('m-shell').style.display=''; }
  initNav(); initDrawer(); showPage('dashboard');
}

document.addEventListener('DOMContentLoaded',()=>{
  initLogin();
  if(tok()){
    fetch(API+'/auth/me',{headers:hdrs()}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{
      if(d.user){ localStorage.setItem(UK,JSON.stringify(d.user)); document.getElementById('m-login').classList.add('hidden'); document.getElementById('m-shell').style.display=''; initApp(); }
      else showLogin();
    }).catch(showLogin);
  } else showLogin();
});
function showLogin(){ document.getElementById('m-login').classList.remove('hidden'); document.getElementById('m-shell').style.display='none'; }

})();
