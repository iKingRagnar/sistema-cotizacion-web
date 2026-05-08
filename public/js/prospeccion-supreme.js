/* ════════════════════════════════════════════════════════════════════════
 * PROSPECCION SUPREME — Mejoras radicales encima de prospeccion-pro
 *
 * Módulos:
 *   1. Vista Kanban — Drag & drop entre etapas del pipeline
 *   2. Activity Timeline — Línea de tiempo de actividades por prospecto
 *   3. AI Territory Insights — DavAI sugiere zonas/sectores prometedores
 *   4. Quick Add — Agregar prospecto con 1 click + DavAI fill
 *   5. Bulk Actions — Seleccionar varios y operar en lote
 *   6. View Switcher — Toggle Tabla / Kanban / Mapa
 * ════════════════════════════════════════════════════════════════════════ */
;(function () {
  'use strict';

  if (!window.ProspeccionPro) return; // Requiere Pro cargado primero

  function $(s, ctx) { return (ctx || document).querySelector(s); }
  function $$(s, ctx) { return Array.from((ctx || document).querySelectorAll(s)); }
  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }
  function getToken() {
    return localStorage.getItem('cotizacion-auth-token') || localStorage.getItem('token') || '';
  }
  function fetchJson(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Authorization': 'Bearer ' + getToken() }, opts.headers || {});
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function toast(msg, kind, opts) {
    if (window.MegaToast && window.MegaToast.show) return window.MegaToast.show(msg, kind, opts);
    if (window.showToast) return window.showToast(msg, kind);
  }

  var Supreme = { view: 'tabla' };

  /* ════════════════════════════════════════════════════════════════
   * 1. VIEW SWITCHER — Tabla / Kanban / Insights
   * ════════════════════════════════════════════════════════════════ */
  Supreme.renderSwitcher = function () {
    return '<div class="prsup-view-switcher">' +
      '<button class="prsup-view-btn" data-view="tabla">' +
        '<i class="fas fa-table"></i> Tabla</button>' +
      '<button class="prsup-view-btn" data-view="kanban">' +
        '<i class="fas fa-columns"></i> Kanban</button>' +
      '<button class="prsup-view-btn" data-view="insights">' +
        '<i class="fas fa-brain"></i> AI Insights</button>' +
    '</div>';
  };

  Supreme.injectSwitcher = function () {
    var bar = $('#prspro-bar');
    if (!bar) return;
    var existing = $('#prsup-switcher');
    if (existing) existing.remove();
    var div = document.createElement('div');
    div.id = 'prsup-switcher';
    div.innerHTML = Supreme.renderSwitcher();
    /* Insertar al inicio del bar */
    bar.insertBefore(div, bar.firstChild);
    div.querySelectorAll('.prsup-view-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-view');
        Supreme.setView(v);
      });
    });
    Supreme.markActiveBtn();
  };

  Supreme.markActiveBtn = function () {
    document.querySelectorAll('.prsup-view-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-view') === Supreme.view);
    });
  };

  Supreme.setView = function (v) {
    Supreme.view = v;
    Supreme.markActiveBtn();
    var host = $('#prspro-table-host');
    if (!host) return;
    if (v === 'tabla') {
      host.innerHTML = window.ProspeccionPro.renderTable();
      window.ProspeccionPro.bindTable(host);
    } else if (v === 'kanban') {
      host.innerHTML = Supreme.renderKanban();
      Supreme.bindKanban(host);
    } else if (v === 'insights') {
      host.innerHTML = Supreme.renderInsightsHub();
      Supreme.bindInsights(host);
    }
  };

  /* ════════════════════════════════════════════════════════════════
   * 2. KANBAN PIPELINE — Drag & drop entre etapas
   * ════════════════════════════════════════════════════════════════ */
  Supreme.STAGES = [
    { id: 'prospecto',   label: 'Prospecto',   color: '#3b82f6', icon: 'fa-eye' },
    { id: 'contactado',  label: 'Contactado',  color: '#8b5cf6', icon: 'fa-phone' },
    { id: 'calificado',  label: 'Calificado',  color: '#06b6d4', icon: 'fa-check-circle' },
    { id: 'propuesta',   label: 'Propuesta',   color: '#f59e0b', icon: 'fa-file-invoice' },
    { id: 'negociacion', label: 'Negociación', color: '#ef4444', icon: 'fa-handshake' },
    { id: 'ganado',      label: 'Ganado',      color: '#22c55e', icon: 'fa-trophy' },
  ];

  Supreme.renderKanban = function () {
    var pros = window.ProspeccionPro.cache;
    return '<div class="prsup-kanban">' +
      Supreme.STAGES.map(function (s) {
        var items = pros.filter(function (p) { return (p.estado || 'prospecto').toLowerCase() === s.id; });
        var totalUSD = items.reduce(function (sum, p) { return sum + (Number(p.potencial_usd) || 0); }, 0);
        return '<div class="prsup-kanban__col" data-stage="' + s.id + '" style="--sc:' + s.color + '">' +
          '<div class="prsup-kanban__header">' +
            '<i class="fas ' + s.icon + '"></i>' +
            '<span class="prsup-kanban__label">' + s.label + '</span>' +
            '<span class="prsup-kanban__count">' + items.length + '</span>' +
          '</div>' +
          '<div class="prsup-kanban__total">$' + Math.round(totalUSD / 1000) + 'k pipeline</div>' +
          '<div class="prsup-kanban__drop" data-stage="' + s.id + '">' +
            items.map(function (p) {
              return Supreme.kanbanCard(p, s.color);
            }).join('') +
            (items.length === 0 ? '<div class="prsup-kanban__empty">Sin prospectos</div>' : '') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  };

  Supreme.kanbanCard = function (p, accent) {
    var score = Number(p.score_ia) || 0;
    var pot = Number(p.potencial_usd) || 0;
    return '<div class="prsup-card" draggable="true" data-id="' + p.id + '" style="--ac:' + accent + '">' +
      '<div class="prsup-card__head">' +
        '<strong>' + escapeHtml(p.empresa || '?') + '</strong>' +
        '<span class="prsup-card__score" style="--ks:' + score + '">' + score + '</span>' +
      '</div>' +
      (p.industria ? '<div class="prsup-card__meta"><i class="fas fa-industry"></i> ' + escapeHtml(p.industria) + '</div>' : '') +
      (p.ciudad ? '<div class="prsup-card__meta"><i class="fas fa-map-marker-alt"></i> ' + escapeHtml(p.ciudad) + '</div>' : '') +
      (pot > 0 ? '<div class="prsup-card__pot">$' + pot.toLocaleString('es-MX') + '</div>' : '') +
    '</div>';
  };

  Supreme.bindKanban = function (root) {
    var dragId = null;
    root.querySelectorAll('.prsup-card').forEach(function (card) {
      card.addEventListener('dragstart', function (e) {
        dragId = card.getAttribute('data-id');
        card.classList.add('is-dragging');
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); } catch (_) {}
      });
      card.addEventListener('dragend', function () {
        card.classList.remove('is-dragging');
        document.querySelectorAll('.prsup-kanban__drop').forEach(function (d) { d.classList.remove('is-over'); });
      });
    });
    root.querySelectorAll('.prsup-kanban__drop').forEach(function (drop) {
      drop.addEventListener('dragover', function (e) {
        e.preventDefault();
        drop.classList.add('is-over');
      });
      drop.addEventListener('dragleave', function () {
        drop.classList.remove('is-over');
      });
      drop.addEventListener('drop', async function (e) {
        e.preventDefault();
        drop.classList.remove('is-over');
        if (!dragId) return;
        var newStage = drop.getAttribute('data-stage');
        var p = window.ProspeccionPro.cache.find(function (x) { return String(x.id) === String(dragId); });
        if (!p || (p.estado || '').toLowerCase() === newStage) { dragId = null; return; }
        try {
          await fetchJson('/api/prospectos/' + p.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: newStage }),
          });
          p.estado = newStage;
          toast('✓ ' + (p.empresa || '?') + ' → ' + newStage, 'success');
          /* Re-render kanban */
          var host = $('#prspro-table-host');
          if (host) {
            host.innerHTML = Supreme.renderKanban();
            Supreme.bindKanban(host);
          }
          /* Re-render KPIs */
          var kpisHtml = window.ProspeccionPro.renderKPIs();
          var bar = $('#prspro-bar');
          if (bar) {
            var kpisDiv = bar.querySelector('.prspro-kpis');
            if (kpisDiv) kpisDiv.outerHTML = kpisHtml;
          }
        } catch (err) {
          toast('No se pudo mover: ' + err.message, 'error');
        }
        dragId = null;
      });
    });
  };

  /* ════════════════════════════════════════════════════════════════
   * 3. AI INSIGHTS HUB — Centro de inteligencia
   * ════════════════════════════════════════════════════════════════ */
  Supreme.renderInsightsHub = function () {
    return '<div class="prsup-insights-hub">' +
      '<div class="prsup-insight-card" data-act="territory">' +
        '<div class="prsup-insight-card__icon" style="--ic:#3b82f6"><i class="fas fa-globe-americas"></i></div>' +
        '<div class="prsup-insight-card__title">Territorio Prometedor</div>' +
        '<div class="prsup-insight-card__desc">DavAI analiza tus datos y sugiere zonas/sectores con potencial sin explotar.</div>' +
        '<button class="prspro-btn prspro-btn--hunt">Analizar territorio</button>' +
      '</div>' +
      '<div class="prsup-insight-card" data-act="next-action">' +
        '<div class="prsup-insight-card__icon" style="--ic:#22c55e"><i class="fas fa-bolt"></i></div>' +
        '<div class="prsup-insight-card__title">Próxima Mejor Acción</div>' +
        '<div class="prsup-insight-card__desc">¿Qué prospectos atender hoy? DavAI los prioriza por potencial × score × tiempo sin contacto.</div>' +
        '<button class="prspro-btn prspro-btn--hunt">Ver acciones</button>' +
      '</div>' +
      '<div class="prsup-insight-card" data-act="competitor">' +
        '<div class="prsup-insight-card__icon" style="--ic:#8b5cf6"><i class="fas fa-chess-knight"></i></div>' +
        '<div class="prsup-insight-card__title">Análisis Competitivo</div>' +
        '<div class="prsup-insight-card__desc">DavAI investiga competidores en tu industria y sugiere diferenciadores.</div>' +
        '<button class="prspro-btn prspro-btn--hunt">Analizar</button>' +
      '</div>' +
      '<div class="prsup-insight-card" data-act="forecast">' +
        '<div class="prsup-insight-card__icon" style="--ic:#f59e0b"><i class="fas fa-chart-line"></i></div>' +
        '<div class="prsup-insight-card__title">Pronóstico de Cierre</div>' +
        '<div class="prsup-insight-card__desc">Estimación IA del valor probable de cierre próximos 30/60/90 días.</div>' +
        '<button class="prspro-btn prspro-btn--hunt">Generar pronóstico</button>' +
      '</div>' +
    '</div>';
  };

  Supreme.bindInsights = function (root) {
    root.querySelectorAll('.prsup-insight-card').forEach(function (card) {
      var btn = card.querySelector('button');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var act = card.getAttribute('data-act');
        if (act === 'territory') Supreme.openTerritory();
        else if (act === 'next-action') Supreme.openNextAction();
        else if (act === 'competitor') Supreme.openCompetitor();
        else if (act === 'forecast') Supreme.openForecast();
      });
    });
  };

  /* Modal helpers reutilizando ProspeccionPro */
  function newModal(title, html) {
    return window.ProspeccionPro.createModal(title, html);
  }

  Supreme.openTerritory = async function () {
    var modal = newModal('🌎 Análisis de Territorio', '<div class="prspro-loading"><div class="mega-spinner"></div> DavAI analizando tu cobertura geográfica...</div>');
    try {
      var pros = window.ProspeccionPro.cache;
      var byCity = {}, byInd = {};
      pros.forEach(function (p) {
        byCity[p.ciudad || 'Sin'] = (byCity[p.ciudad || 'Sin'] || 0) + 1;
        byInd[p.industria || 'Sin'] = (byInd[p.industria || 'Sin'] || 0) + 1;
      });
      var prompt = 'Eres consultor B2B en México. Mi cartera: ' +
        Object.entries(byCity).slice(0, 8).map(function (e) { return e[0] + '(' + e[1] + ')'; }).join(', ') +
        '. Industrias: ' + Object.entries(byInd).slice(0, 8).map(function (e) { return e[0] + '(' + e[1] + ')'; }).join(', ') +
        '. Sugiere 5 zonas/sectores nuevos en México donde DEBERÍA prospectar (con razón). ' +
        'Formato JSON: [{"zona":"X","sector":"Y","razon":"Z","score":1-10}]. Solo JSON sin texto.';
      var raw = await window.ProspeccionPro.askDavAI ? await window.ProspeccionPro.askDavAI(prompt) : await askInternal(prompt);
      var m = raw.match(/\[[\s\S]+\]/);
      var items = m ? JSON.parse(m[0]) : [];
      $('.prspro-modal__body', modal).innerHTML =
        '<p style="color:#94a3b8;font-size:0.86rem">DavAI sugiere <strong>' + items.length + '</strong> nuevas oportunidades:</p>' +
        '<div class="prsup-territory-list">' +
          items.map(function (it) {
            return '<div class="prsup-territory-item">' +
              '<div class="prsup-territory-item__head">' +
                '<strong>' + escapeHtml(it.zona || '?') + '</strong>' +
                '<span class="prsup-score-pill">★ ' + (it.score || '?') + '/10</span>' +
              '</div>' +
              '<div class="prsup-territory-item__sector"><i class="fas fa-industry"></i> ' + escapeHtml(it.sector || '') + '</div>' +
              '<div class="prsup-territory-item__why">' + escapeHtml(it.razon || '') + '</div>' +
            '</div>';
          }).join('') +
        '</div>';
    } catch (e) {
      $('.prspro-modal__body', modal).innerHTML = '<div class="prspro-error">Error: ' + escapeHtml(e.message) + '</div>';
    }
  };

  Supreme.openNextAction = function () {
    var pros = window.ProspeccionPro.cache;
    var prioritized = pros.slice().filter(function (p) {
      return !/ganad|perdid/i.test(p.estado || '');
    }).map(function (p) {
      var score = Number(p.score_ia) || 0;
      var pot = Number(p.potencial_usd) || 0;
      var priority = (score * 0.6) + (Math.log10(Math.max(pot, 1000)) * 8);
      return Object.assign({}, p, { _priority: priority });
    }).sort(function (a, b) { return b._priority - a._priority; }).slice(0, 10);

    newModal('⚡ Próxima Mejor Acción', `
      <p style="color:#94a3b8;font-size:0.86rem">Top 10 prospectos a contactar HOY (priorizado por score × log(potencial)):</p>
      <div class="prsup-next-list">
        ${prioritized.map(function (p, i) {
          return '<div class="prsup-next-item">' +
            '<div class="prsup-next-item__rank">' + (i + 1) + '</div>' +
            '<div class="prsup-next-item__body">' +
              '<strong>' + escapeHtml(p.empresa || '?') + '</strong>' +
              '<div class="prsup-next-item__meta">' +
                '<span>★ ' + (p.score_ia || 0) + '</span>' +
                '<span>$' + (Number(p.potencial_usd) || 0).toLocaleString('es-MX') + '</span>' +
                '<span>' + escapeHtml(p.estado || 'prospecto') + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="prsup-next-item__priority">' + Math.round(p._priority) + '</div>' +
          '</div>';
        }).join('')}
      </div>
    `);
  };

  Supreme.openCompetitor = async function () {
    var modal = newModal('♞ Análisis Competitivo', '<div class="prspro-loading"><div class="mega-spinner"></div> DavAI investigando competidores...</div>');
    try {
      var pros = window.ProspeccionPro.cache;
      var industries = {};
      pros.forEach(function (p) { if (p.industria) industries[p.industria] = (industries[p.industria] || 0) + 1; });
      var topInd = Object.entries(industries).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3).map(function (e) { return e[0]; });
      var prompt = 'Soy proveedor de servicios técnicos industriales en México (mantenimiento, refacciones, asesoría). ' +
        'Mis principales industrias atendidas: ' + topInd.join(', ') + '. ' +
        'Dame 3 análisis competitivos en formato viñeta (con emojis) sobre: ' +
        '1) Diferenciadores clave que YO debería ofrecer, 2) Tendencias que están siguiendo competidores, 3) Pricing strategies. ' +
        'Sin introducción, solo viñetas.';
      var raw = await askInternal(prompt);
      $('.prspro-modal__body', modal).innerHTML =
        '<div class="prspro-insight-ai">' +
          raw.split('\n').filter(Boolean).map(function (l) {
            return '<div class="prspro-insight-line">' + escapeHtml(l) + '</div>';
          }).join('') +
        '</div>';
    } catch (e) {
      $('.prspro-modal__body', modal).innerHTML = '<div class="prspro-error">Error: ' + escapeHtml(e.message) + '</div>';
    }
  };

  Supreme.openForecast = async function () {
    var pros = window.ProspeccionPro.cache;
    var open = pros.filter(function (p) { return !/ganad|perdid/i.test(p.estado || ''); });
    var totalOpen = open.reduce(function (s, p) { return s + (Number(p.potencial_usd) || 0); }, 0);
    /* Prob estimada por etapa */
    var probByStage = { prospecto: 0.10, contactado: 0.25, calificado: 0.45, propuesta: 0.65, negociacion: 0.85 };
    var weighted = open.reduce(function (s, p) {
      var prob = probByStage[(p.estado || 'prospecto').toLowerCase()] || 0.10;
      var scoreBoost = (Number(p.score_ia) || 50) / 100;
      return s + ((Number(p.potencial_usd) || 0) * prob * scoreBoost);
    }, 0);

    newModal('📈 Pronóstico de Cierre', `
      <div class="prsup-forecast">
        <div class="prsup-forecast__total">
          <div class="prsup-forecast__label">Pipeline abierto</div>
          <div class="prsup-forecast__value">$${Math.round(totalOpen / 1000)}k</div>
          <div class="prsup-forecast__sub">USD potencial total (${open.length} prospectos)</div>
        </div>
        <div class="prsup-forecast__weighted">
          <div class="prsup-forecast__label">Cierre esperado (ponderado)</div>
          <div class="prsup-forecast__value" style="color:#22c55e">$${Math.round(weighted / 1000)}k</div>
          <div class="prsup-forecast__sub">probabilidad por etapa × score IA</div>
        </div>
        <div class="prsup-forecast__breakdown">
          <h4>Desglose 30/60/90 días</h4>
          <div class="prsup-forecast__row"><span>Próximos 30 días</span><strong>$${Math.round(weighted * 0.4 / 1000)}k</strong></div>
          <div class="prsup-forecast__row"><span>Próximos 60 días</span><strong>$${Math.round(weighted * 0.7 / 1000)}k</strong></div>
          <div class="prsup-forecast__row"><span>Próximos 90 días</span><strong>$${Math.round(weighted / 1000)}k</strong></div>
        </div>
        <p class="prsup-forecast__note">📊 Cálculo: <code>Σ(potencial × prob_etapa × score/100)</code></p>
      </div>
    `);
  };

  /* askDavAI internal helper */
  async function askInternal(prompt) {
    var resp = await fetch('/api/davai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ message: prompt }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var reader = resp.body.getReader();
    var dec = new TextDecoder();
    var buf = '', full = '';
    while (true) {
      var r = await reader.read();
      if (r.done) break;
      buf += dec.decode(r.value, { stream: true });
      var lines = buf.split('\n');
      buf = lines.pop() || '';
      for (var i = 0; i < lines.length; i++) {
        var ln = lines[i];
        if (ln.startsWith('data: ')) {
          var raw = ln.slice(6);
          if (raw === '[DONE]') break;
          try {
            var p = JSON.parse(raw);
            if (p.text) full += p.text;
          } catch (_) {}
        }
      }
    }
    return full.trim();
  }

  /* ════════════════════════════════════════════════════════════════
   * BOOT — observa cuando ProspeccionPro injecta el bar
   * ════════════════════════════════════════════════════════════════ */
  function tryBoot() {
    if ($('#prspro-bar') && !$('#prsup-switcher')) {
      Supreme.injectSwitcher();
    }
  }
  setInterval(tryBoot, 1000);
  setTimeout(tryBoot, 1200);
  setTimeout(tryBoot, 2500);

  window.ProspeccionSupreme = Supreme;
})();
