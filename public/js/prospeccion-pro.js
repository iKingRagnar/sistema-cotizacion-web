/* ════════════════════════════════════════════════════════════════════════
 * PROSPECCION PRO — Inteligencia avanzada de prospectos
 *
 * Módulos:
 *   1. KPIs Bar — métricas premium (hot leads, pipeline, conversión, etc.)
 *   2. Hunter — scrapping IA con DavAI: "encuéntrame empresas X en zona Y"
 *   3. Enrich — DavAI completa info faltante de prospectos (sector, web, etc.)
 *   4. Pitch Generator — DavAI escribe mensaje personalizado por prospecto
 *   5. Insights — análisis IA del pipeline (bottlenecks, oportunidades)
 *   6. Score Explainer — por qué un prospecto tiene tal score
 *   7. Cluster Analysis — agrupar por industria/zona/score
 *   8. Funnel Visual — pipeline con conversión etapa-por-etapa
 *   9. Compare Mode — comparar 2-3 prospectos lado a lado
 *  10. Smart Filters — sugerencias de filtros basados en datos
 * ════════════════════════════════════════════════════════════════════════ */
;(function () {
  'use strict';

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
  function toast(msg, kind, opts) {
    if (window.MegaToast && window.MegaToast.show) return window.MegaToast.show(msg, kind, opts);
    if (window.showToast) return window.showToast(msg, kind);
  }
  function fetchJson(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Authorization': 'Bearer ' + getToken() }, opts.headers || {});
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  /* Streaming DavAI — devuelve string completo */
  async function askDavAI(prompt) {
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
   * STATE
   * ════════════════════════════════════════════════════════════════ */
  var ProspeccionPro = {
    cache: [],
    refreshing: false,
  };

  ProspeccionPro.refresh = async function () {
    if (ProspeccionPro.refreshing) return;
    ProspeccionPro.refreshing = true;
    try {
      ProspeccionPro.cache = await fetchJson('/api/prospectos').catch(function () { return []; });
    } finally { ProspeccionPro.refreshing = false; }
  };

  /* ════════════════════════════════════════════════════════════════
   * 1. KPIs BAR PREMIUM
   * ════════════════════════════════════════════════════════════════ */
  ProspeccionPro.renderKPIs = function () {
    var pros = ProspeccionPro.cache;
    if (!pros.length) return '';

    var hot = pros.filter(function (p) { return Number(p.score_ia) >= 70; }).length;
    var pipeline = pros.reduce(function (s, p) { return s + (Number(p.potencial_usd) || 0); }, 0);
    var won = pros.filter(function (p) { return /ganad/i.test(p.estado || ''); }).length;
    var lost = pros.filter(function (p) { return /perdid/i.test(p.estado || ''); }).length;
    var conv = (won + lost) > 0 ? (won / (won + lost) * 100).toFixed(0) + '%' : 'N/A';
    var avgScore = pros.reduce(function (s, p) { return s + (Number(p.score_ia) || 0); }, 0) / pros.length;

    var kpis = [
      { label: 'Total Prospectos', value: pros.length, icon: 'fa-users', color: '#3b82f6' },
      { label: 'Hot Leads (≥70)', value: hot, sub: 'de ' + pros.length, icon: 'fa-fire', color: '#ef4444' },
      { label: 'Pipeline Value', value: '$' + Math.round(pipeline / 1000) + 'k', sub: 'USD potencial', icon: 'fa-dollar-sign', color: '#22c55e' },
      { label: 'Conversión', value: conv, sub: won + ' ganados / ' + lost + ' perdidos', icon: 'fa-bullseye', color: '#8b5cf6' },
      { label: 'Score Promedio', value: avgScore.toFixed(0), sub: 'sobre 100', icon: 'fa-star', color: '#f59e0b' },
    ];

    return '<div class="prspro-kpis">' +
      kpis.map(function (k) {
        return '<div class="prspro-kpi" style="--kc:' + k.color + '">' +
          '<div class="prspro-kpi__icon"><i class="fas ' + k.icon + '"></i></div>' +
          '<div class="prspro-kpi__body">' +
            '<div class="prspro-kpi__label">' + k.label + '</div>' +
            '<div class="prspro-kpi__value">' + escapeHtml(String(k.value)) + '</div>' +
            (k.sub ? '<div class="prspro-kpi__sub">' + escapeHtml(k.sub) + '</div>' : '') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  };

  /* ════════════════════════════════════════════════════════════════
   * 2. ACTIONS BAR (Hunter, Enrich, Pitch, Insights, Compare, Funnel)
   * ════════════════════════════════════════════════════════════════ */
  ProspeccionPro.renderActions = function () {
    return '<div class="prspro-actions">' +
      '<button class="prspro-btn prspro-btn--hunt" data-act="hunt">' +
        '<i class="fas fa-crosshairs"></i> Cazar Leads (IA)</button>' +
      '<button class="prspro-btn" data-act="enrich">' +
        '<i class="fas fa-magic"></i> Enriquecer con DavAI</button>' +
      '<button class="prspro-btn" data-act="pitch">' +
        '<i class="fas fa-paper-plane"></i> Generar Mensajes</button>' +
      '<button class="prspro-btn" data-act="insights">' +
        '<i class="fas fa-lightbulb"></i> Insights IA</button>' +
      '<button class="prspro-btn" data-act="funnel">' +
        '<i class="fas fa-filter"></i> Funnel Pipeline</button>' +
      '<button class="prspro-btn" data-act="cluster">' +
        '<i class="fas fa-project-diagram"></i> Cluster</button>' +
      '<button class="prspro-btn" data-act="compare">' +
        '<i class="fas fa-balance-scale"></i> Comparar</button>' +
    '</div>';
  };

  /* ════════════════════════════════════════════════════════════════
   * 3. HUNTER — DavAI sugiere prospectos nuevos según criterios
   * ════════════════════════════════════════════════════════════════ */
  ProspeccionPro.openHunter = function () {
    var modal = ProspeccionPro.createModal('🎯 Cazador de Leads (IA)', `
      <p style="color:#94a3b8;font-size:0.86rem;margin:0 0 14px">
        DavAI buscará empresas que probablemente necesiten tus servicios técnicos.
      </p>
      <div class="prspro-form">
        <label>Industria / sector</label>
        <input type="text" id="hunt-industry" placeholder="Ej: Manufactura metalúrgica" value="Industria metalmecánica">
        <label>Zona / ciudad</label>
        <input type="text" id="hunt-zone" placeholder="Ej: Monterrey, NL" value="Monterrey, Nuevo León">
        <label>Criterio extra (opcional)</label>
        <input type="text" id="hunt-extra" placeholder="Ej: empresas con CNC, robótica industrial...">
        <label>Cantidad de prospectos</label>
        <input type="number" id="hunt-qty" value="5" min="3" max="15">
      </div>
      <button class="prspro-btn prspro-btn--hunt" id="hunt-go" style="width:100%;margin-top:14px">
        <i class="fas fa-rocket"></i> Buscar empresas
      </button>
      <div id="hunt-result" style="margin-top:16px"></div>
    `);
    $('#hunt-go', modal).addEventListener('click', async function () {
      var industry = $('#hunt-industry', modal).value.trim();
      var zone = $('#hunt-zone', modal).value.trim();
      var extra = $('#hunt-extra', modal).value.trim();
      var qty = parseInt($('#hunt-qty', modal).value, 10) || 5;
      if (!industry || !zone) { toast('Industria y zona requeridas', 'warning'); return; }
      var btn = $('#hunt-go', modal);
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
      var resultDiv = $('#hunt-result', modal);
      resultDiv.innerHTML = '<div class="prspro-loading"><div class="mega-spinner"></div> DavAI está analizando...</div>';
      var prompt = 'Eres un experto en prospección B2B. Sugiere ' + qty + ' empresas REALES (con nombres concretos) en ' +
        zone + ' del sector "' + industry + '"' + (extra ? ' que cumplan: ' + extra : '') +
        '. Responde SOLO en formato JSON array sin texto adicional, donde cada item tenga: ' +
        '{"empresa":"nombre","industria":"sector","ciudad":"ciudad","potencial_usd":numero_estimado,"score_ia":0-100,"razon":"breve por qué es prospecto"}.';
      try {
        var raw = await askDavAI(prompt);
        var jsonMatch = raw.match(/\[[\s\S]+\]/);
        var items = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        if (!items.length) throw new Error('Sin resultados parseables');
        resultDiv.innerHTML = '<h4 style="color:#60a5fa;margin:0 0 10px">' + items.length + ' empresas sugeridas:</h4>' +
          '<div class="prspro-hunt-list">' +
            items.map(function (it, i) {
              return '<div class="prspro-hunt-item" data-i="' + i + '">' +
                '<div class="prspro-hunt-item__head">' +
                  '<strong>' + escapeHtml(it.empresa || '?') + '</strong>' +
                  '<span class="prspro-score" style="--ks:' + (it.score_ia || 0) + '">' +
                    '★ ' + (it.score_ia || 0) + '</span>' +
                '</div>' +
                '<div class="prspro-hunt-item__meta">' +
                  '<span><i class="fas fa-industry"></i> ' + escapeHtml(it.industria || '') + '</span>' +
                  '<span><i class="fas fa-map-marker-alt"></i> ' + escapeHtml(it.ciudad || '') + '</span>' +
                  (it.potencial_usd ? '<span><i class="fas fa-dollar-sign"></i> $' + Number(it.potencial_usd).toLocaleString('es-MX') + '</span>' : '') +
                '</div>' +
                '<div class="prspro-hunt-item__why">' + escapeHtml(it.razon || '') + '</div>' +
                '<button class="prspro-btn prspro-btn--add" data-add="' + i + '">' +
                  '<i class="fas fa-plus"></i> Agregar a prospectos</button>' +
              '</div>';
            }).join('') +
          '</div>' +
          '<button class="prspro-btn prspro-btn--hunt" id="hunt-add-all" style="width:100%;margin-top:12px">' +
            '<i class="fas fa-check-double"></i> Agregar TODOS</button>';

        var addOne = async function (it) {
          try {
            await fetchJson('/api/prospectos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                empresa: it.empresa, industria: it.industria, ciudad: it.ciudad,
                estado: 'prospecto', potencial_usd: Number(it.potencial_usd) || 0,
                score_ia: Number(it.score_ia) || 50, notas: it.razon || '',
              }),
            });
            return true;
          } catch (_) { return false; }
        };

        resultDiv.querySelectorAll('[data-add]').forEach(function (b) {
          b.addEventListener('click', async function () {
            var i = parseInt(b.getAttribute('data-add'), 10);
            b.disabled = true;
            b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
            var ok = await addOne(items[i]);
            b.innerHTML = ok ? '<i class="fas fa-check"></i> Agregado' : '<i class="fas fa-times"></i> Falló';
            if (ok) toast('✓ ' + items[i].empresa + ' agregado', 'success');
          });
        });
        resultDiv.querySelector('#hunt-add-all').addEventListener('click', async function () {
          this.disabled = true;
          this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Agregando ' + items.length + '...';
          var added = 0;
          for (var i = 0; i < items.length; i++) {
            if (await addOne(items[i])) added++;
          }
          toast('✓ ' + added + '/' + items.length + ' prospectos agregados', 'success', { duration: 4000 });
          await ProspeccionPro.refresh();
          ProspeccionPro.update();
          if (window.MegaConfetti) window.MegaConfetti.fire({ count: 100 });
        });
      } catch (e) {
        resultDiv.innerHTML = '<div class="prspro-error">Error: ' + escapeHtml(e.message) +
          '<br><small>DavAI puede no estar configurado. Configura ANTHROPIC_API_KEY u OPENAI_API_KEY.</small></div>';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-rocket"></i> Buscar empresas';
      }
    });
  };

  /* ════════════════════════════════════════════════════════════════
   * 4. ENRICH — DavAI completa info faltante de prospectos
   * ════════════════════════════════════════════════════════════════ */
  ProspeccionPro.openEnrich = function () {
    var pros = ProspeccionPro.cache;
    var incomplete = pros.filter(function (p) {
      return !p.industria || !p.ciudad || !p.potencial_usd || !p.score_ia;
    });
    var modal = ProspeccionPro.createModal('🪄 Enriquecer Prospectos con DavAI', `
      <p style="color:#94a3b8;font-size:0.86rem;margin:0 0 14px">
        DavAI completará información faltante (industria, potencial, score) basándose en el nombre de la empresa.
      </p>
      <div class="prspro-stat-row">
        <div><strong style="color:#f8fafc;font-size:1.4rem">${pros.length}</strong> total</div>
        <div><strong style="color:#fcd34d;font-size:1.4rem">${incomplete.length}</strong> incompletos</div>
      </div>
      <button class="prspro-btn prspro-btn--hunt" id="enrich-go" style="width:100%;margin-top:14px"
        ${incomplete.length === 0 ? 'disabled' : ''}>
        <i class="fas fa-magic"></i> Enriquecer ${incomplete.length} prospectos
      </button>
      <div id="enrich-progress" style="margin-top:14px"></div>
    `);
    if (incomplete.length === 0) return;
    $('#enrich-go', modal).addEventListener('click', async function () {
      var btn = this;
      btn.disabled = true;
      var progress = $('#enrich-progress', modal);
      var ok = 0, fail = 0;
      for (var i = 0; i < incomplete.length; i++) {
        var p = incomplete[i];
        progress.innerHTML = '<div class="prspro-loading"><div class="mega-spinner"></div> Enriqueciendo (' + (i + 1) + '/' + incomplete.length + '): ' + escapeHtml(p.empresa || '?') + '</div>';
        try {
          var prompt = 'Para la empresa "' + (p.empresa || '?') + '" responde SOLO JSON sin texto adicional: ' +
            '{"industria":"sector","ciudad":"ciudad probable mexico","potencial_usd":numero_estimado_anual,"score_ia":0-100,"notas":"breve descripcion"}';
          var raw = await askDavAI(prompt);
          var jsonMatch = raw.match(/\{[\s\S]+\}/);
          if (!jsonMatch) { fail++; continue; }
          var data = JSON.parse(jsonMatch[0]);
          await fetchJson('/api/prospectos/' + p.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              industria: p.industria || data.industria,
              ciudad: p.ciudad || data.ciudad,
              potencial_usd: p.potencial_usd || Number(data.potencial_usd) || 0,
              score_ia: p.score_ia || Number(data.score_ia) || 50,
              notas: p.notas || data.notas,
            }),
          });
          ok++;
        } catch (_) { fail++; }
      }
      progress.innerHTML = '<div class="prspro-success">✓ Enriquecidos: ' + ok + ' · Fallidos: ' + fail + '</div>';
      toast('Enriquecimiento completado', 'success');
      await ProspeccionPro.refresh();
      ProspeccionPro.update();
    });
  };

  /* ════════════════════════════════════════════════════════════════
   * 5. PITCH GENERATOR
   * ════════════════════════════════════════════════════════════════ */
  ProspeccionPro.openPitch = function () {
    var pros = ProspeccionPro.cache.filter(function (p) {
      return Number(p.score_ia) >= 50 && !/ganad|perdid/i.test(p.estado || '');
    });
    var modal = ProspeccionPro.createModal('💌 Generador de Mensajes Iniciales', `
      <p style="color:#94a3b8;font-size:0.86rem;margin:0 0 14px">
        DavAI escribirá un mensaje inicial personalizado para cada prospecto activo (score ≥ 50).
      </p>
      <select id="pitch-prospect" style="width:100%;padding:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);color:#f8fafc;border-radius:8px;margin-bottom:10px">
        <option value="">— Elige un prospecto —</option>
        ${pros.map(function (p) { return '<option value="' + p.id + '">' + escapeHtml(p.empresa || '?') + ' (' + (p.industria || '') + ')</option>'; }).join('')}
      </select>
      <select id="pitch-channel" style="width:100%;padding:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);color:#f8fafc;border-radius:8px;margin-bottom:14px">
        <option value="email">Email formal</option>
        <option value="whatsapp">WhatsApp directo</option>
        <option value="linkedin">LinkedIn (profesional)</option>
        <option value="llamada">Script para llamada</option>
      </select>
      <button class="prspro-btn prspro-btn--hunt" id="pitch-go" style="width:100%">
        <i class="fas fa-magic"></i> Generar mensaje
      </button>
      <div id="pitch-result" style="margin-top:14px"></div>
    `);
    $('#pitch-go', modal).addEventListener('click', async function () {
      var pid = $('#pitch-prospect', modal).value;
      var channel = $('#pitch-channel', modal).value;
      if (!pid) { toast('Elige un prospecto', 'warning'); return; }
      var p = pros.find(function (x) { return String(x.id) === String(pid); });
      var btn = this;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Escribiendo...';
      var result = $('#pitch-result', modal);
      result.innerHTML = '<div class="prspro-loading"><div class="mega-spinner"></div> DavAI está redactando...</div>';
      try {
        var channelDesc = {
          email: 'email formal de presentación, máximo 150 palabras, asunto incluido',
          whatsapp: 'mensaje de WhatsApp directo, casual pero profesional, máximo 60 palabras',
          linkedin: 'mensaje de LinkedIn (InMail), profesional, máximo 100 palabras',
          llamada: 'script para llamada en frío, con apertura, gancho, pregunta y CTA',
        };
        var prompt = 'Empresa: ' + (p.empresa || '?') + ', industria: ' + (p.industria || '?') +
          '. Escribe un ' + channelDesc[channel] +
          ' para presentar nuestros servicios técnicos industriales (mantenimiento de máquinas, refacciones, asesoría). ' +
          'Tono: profesional, valor inmediato. Responde SOLO el mensaje sin explicaciones.';
        var msg = await askDavAI(prompt);
        result.innerHTML =
          '<div class="prspro-pitch-result">' +
            '<div class="prspro-pitch-result__header">' +
              '<strong>Mensaje sugerido (' + channel + '):</strong>' +
              '<button class="prspro-btn prspro-btn--small" id="pitch-copy">' +
                '<i class="fas fa-copy"></i> Copiar</button>' +
            '</div>' +
            '<pre class="prspro-pitch-result__text">' + escapeHtml(msg) + '</pre>' +
          '</div>';
        $('#pitch-copy', modal).addEventListener('click', function () {
          navigator.clipboard.writeText(msg);
          toast('Mensaje copiado', 'success');
        });
      } catch (e) {
        result.innerHTML = '<div class="prspro-error">Error: ' + escapeHtml(e.message) + '</div>';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-magic"></i> Generar mensaje';
      }
    });
  };

  /* ════════════════════════════════════════════════════════════════
   * 6. INSIGHTS
   * ════════════════════════════════════════════════════════════════ */
  ProspeccionPro.openInsights = async function () {
    var modal = ProspeccionPro.createModal('💡 Insights IA del Pipeline', `
      <div id="insights-body"><div class="prspro-loading"><div class="mega-spinner"></div> Analizando ${ProspeccionPro.cache.length} prospectos...</div></div>
    `);
    var pros = ProspeccionPro.cache;
    /* Cálculos locales rápidos */
    var byStage = {};
    pros.forEach(function (p) {
      var s = (p.estado || 'prospecto').toLowerCase();
      byStage[s] = (byStage[s] || 0) + 1;
    });
    var byIndustry = {};
    pros.forEach(function (p) {
      var i = p.industria || 'sin industria';
      byIndustry[i] = (byIndustry[i] || 0) + 1;
    });
    var topInd = Object.entries(byIndustry).sort(function (a, b) { return b[1] - a[1]; })[0];
    var stuck = pros.filter(function (p) {
      var s = (p.estado || '').toLowerCase();
      return ['contactado', 'calificado'].indexOf(s) !== -1;
    });
    var hot = pros.filter(function (p) { return Number(p.score_ia) >= 70; });

    /* Pedir a DavAI análisis profundo */
    var localSummary =
      'Total: ' + pros.length + '. Por etapa: ' + JSON.stringify(byStage) +
      '. Top industria: ' + (topInd ? topInd[0] + ' (' + topInd[1] + ')' : 'N/A') +
      '. Hot leads: ' + hot.length + '. Estancados (Contactado/Calificado): ' + stuck.length + '.';

    var aiAnalysis = '';
    try {
      var prompt = 'Analiza este pipeline B2B y dame 3-4 insights accionables en viñetas (sin introducción, solo viñetas con emojis): ' + localSummary;
      aiAnalysis = await askDavAI(prompt);
    } catch (_) { aiAnalysis = 'No se pudo conectar con DavAI.'; }

    $('#insights-body', modal).innerHTML =
      '<div class="prspro-insight-section">' +
        '<h4>📊 Resumen del Pipeline</h4>' +
        '<div class="prspro-insight-grid">' +
          '<div><strong>' + pros.length + '</strong> prospectos</div>' +
          '<div><strong>' + hot.length + '</strong> hot leads</div>' +
          '<div><strong>' + stuck.length + '</strong> estancados</div>' +
          '<div><strong>' + (topInd ? escapeHtml(topInd[0]) : 'N/A') + '</strong> top industria</div>' +
        '</div>' +
      '</div>' +
      '<div class="prspro-insight-section">' +
        '<h4>🧠 Análisis DavAI</h4>' +
        '<div class="prspro-insight-ai">' +
          aiAnalysis.split('\n').filter(Boolean).map(function (l) {
            return '<div class="prspro-insight-line">' + escapeHtml(l) + '</div>';
          }).join('') +
        '</div>' +
      '</div>';
  };

  /* ════════════════════════════════════════════════════════════════
   * 7. FUNNEL VISUAL
   * ════════════════════════════════════════════════════════════════ */
  ProspeccionPro.openFunnel = function () {
    var pros = ProspeccionPro.cache;
    var stages = ['prospecto', 'contactado', 'calificado', 'propuesta', 'negociacion', 'ganado'];
    var labels = ['Prospecto', 'Contactado', 'Calificado', 'Propuesta', 'Negociación', 'Ganado'];
    var colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#22c55e'];
    var counts = stages.map(function (s) {
      return pros.filter(function (p) { return (p.estado || '').toLowerCase() === s; }).length;
    });
    var max = Math.max.apply(null, counts.concat([1]));
    var totalUSD = pros.reduce(function (s, p) { return s + (Number(p.potencial_usd) || 0); }, 0);

    var modal = ProspeccionPro.createModal('📈 Funnel del Pipeline', `
      <div style="text-align:center;margin-bottom:14px">
        <strong style="color:#22c55e;font-size:1.4rem">$${Math.round(totalUSD / 1000)}k</strong>
        <span style="color:#94a3b8;font-size:0.86rem"> USD pipeline total</span>
      </div>
      <div class="prspro-funnel">
        ${stages.map(function (s, i) {
          var w = (counts[i] / max) * 100;
          var conv = i > 0 && counts[i - 1] > 0 ? ((counts[i] / counts[i - 1]) * 100).toFixed(0) + '%' : '';
          return '<div class="prspro-funnel-row">' +
            '<div class="prspro-funnel-bar" style="width:' + Math.max(w, 12) + '%;background:linear-gradient(90deg,' + colors[i] + 'aa,' + colors[i] + ')">' +
              '<span class="prspro-funnel-label">' + labels[i] + '</span>' +
              '<span class="prspro-funnel-count">' + counts[i] + '</span>' +
            '</div>' +
            (conv ? '<span class="prspro-funnel-conv">' + conv + ' conv.</span>' : '<span></span>') +
          '</div>';
        }).join('')}
      </div>
    `);
  };

  /* ════════════════════════════════════════════════════════════════
   * 8. CLUSTER ANALYSIS
   * ════════════════════════════════════════════════════════════════ */
  ProspeccionPro.openCluster = function () {
    var pros = ProspeccionPro.cache;
    var byInd = {}, byCity = {}, byScoreBucket = { 'Alto (70+)': 0, 'Medio (40-69)': 0, 'Bajo (<40)': 0 };
    pros.forEach(function (p) {
      var ind = p.industria || 'Sin clasificar';
      byInd[ind] = (byInd[ind] || 0) + 1;
      var city = p.ciudad || 'Sin ciudad';
      byCity[city] = (byCity[city] || 0) + 1;
      var s = Number(p.score_ia) || 0;
      if (s >= 70) byScoreBucket['Alto (70+)']++;
      else if (s >= 40) byScoreBucket['Medio (40-69)']++;
      else byScoreBucket['Bajo (<40)']++;
    });

    var topInd = Object.entries(byInd).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6);
    var topCity = Object.entries(byCity).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6);

    ProspeccionPro.createModal('🔮 Análisis de Clusters', `
      <div class="prspro-cluster-grid">
        <div class="prspro-cluster">
          <h4>Por Industria</h4>
          ${topInd.map(function (e) {
            return '<div class="prspro-cluster-row">' +
              '<span>' + escapeHtml(e[0]) + '</span>' +
              '<strong style="color:#60a5fa">' + e[1] + '</strong>' +
            '</div>';
          }).join('')}
        </div>
        <div class="prspro-cluster">
          <h4>Por Ciudad</h4>
          ${topCity.map(function (e) {
            return '<div class="prspro-cluster-row">' +
              '<span>' + escapeHtml(e[0]) + '</span>' +
              '<strong style="color:#fcd34d">' + e[1] + '</strong>' +
            '</div>';
          }).join('')}
        </div>
        <div class="prspro-cluster">
          <h4>Por Score IA</h4>
          ${Object.entries(byScoreBucket).map(function (e) {
            var c = e[0].includes('Alto') ? '#22c55e' : e[0].includes('Medio') ? '#f59e0b' : '#94a3b8';
            return '<div class="prspro-cluster-row">' +
              '<span>' + escapeHtml(e[0]) + '</span>' +
              '<strong style="color:' + c + '">' + e[1] + '</strong>' +
            '</div>';
          }).join('')}
        </div>
      </div>
    `);
  };

  /* ════════════════════════════════════════════════════════════════
   * 9. COMPARE MODE
   * ════════════════════════════════════════════════════════════════ */
  ProspeccionPro.openCompare = function () {
    var pros = ProspeccionPro.cache;
    var modal = ProspeccionPro.createModal('⚖️ Comparar Prospectos', `
      <p style="color:#94a3b8;font-size:0.84rem">Selecciona 2-3 prospectos para comparar lado a lado.</p>
      <div class="prspro-compare-pickers">
        ${[0,1,2].map(function (i) {
          return '<select class="prspro-compare-pick" data-i="' + i + '">' +
            '<option value="">— Slot ' + (i + 1) + ' —</option>' +
            pros.map(function (p) { return '<option value="' + p.id + '">' + escapeHtml(p.empresa || '?') + '</option>'; }).join('') +
          '</select>';
        }).join('')}
      </div>
      <div id="compare-result" style="margin-top:16px"></div>
    `);
    var update = function () {
      var picks = $$('.prspro-compare-pick', modal).map(function (s) {
        return s.value ? pros.find(function (p) { return String(p.id) === String(s.value); }) : null;
      }).filter(Boolean);
      if (picks.length < 2) { $('#compare-result', modal).innerHTML = ''; return; }
      var fields = ['industria', 'ciudad', 'estado', 'potencial_usd', 'score_ia', 'notas'];
      $('#compare-result', modal).innerHTML =
        '<table class="prspro-compare-table">' +
          '<thead><tr><th></th>' +
            picks.map(function (p) { return '<th>' + escapeHtml(p.empresa || '?') + '</th>'; }).join('') +
          '</tr></thead>' +
          '<tbody>' +
            fields.map(function (f) {
              return '<tr>' +
                '<td><strong>' + f + '</strong></td>' +
                picks.map(function (p) { return '<td>' + escapeHtml(p[f] != null ? String(p[f]) : '—') + '</td>'; }).join('') +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>';
    };
    $$('.prspro-compare-pick', modal).forEach(function (s) { s.addEventListener('change', update); });
  };

  /* ════════════════════════════════════════════════════════════════
   * MODAL HELPER
   * ════════════════════════════════════════════════════════════════ */
  ProspeccionPro.createModal = function (title, html) {
    var existing = $('#prspro-modal');
    if (existing) existing.remove();
    var wrap = document.createElement('div');
    wrap.id = 'prspro-modal';
    wrap.className = 'prspro-modal';
    wrap.innerHTML =
      '<div class="prspro-modal__panel">' +
        '<div class="prspro-modal__header">' +
          '<h3>' + title + '</h3>' +
          '<button class="prspro-modal__close">×</button>' +
        '</div>' +
        '<div class="prspro-modal__body">' + html + '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('is-open'); });
    var close = function () {
      wrap.classList.remove('is-open');
      setTimeout(function () { try { wrap.remove(); } catch (_) {} }, 220);
    };
    $('.prspro-modal__close', wrap).addEventListener('click', close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    return wrap;
  };

  /* ════════════════════════════════════════════════════════════════
   * UI INJECTION
   * ════════════════════════════════════════════════════════════════ */
  ProspeccionPro.update = function () {
    var panel = $('#panel-prospeccion');
    if (!panel) return;
    var existing = $('#prspro-bar');
    if (existing) existing.remove();
    var bar = document.createElement('section');
    bar.id = 'prspro-bar';
    bar.className = 'prspro-bar';
    bar.innerHTML = ProspeccionPro.renderKPIs() + ProspeccionPro.renderActions();
    /* Insertar después del primer .section-header (donde están "Pipeline comercial...") */
    var header = panel.querySelector('.section-header');
    if (header && header.nextSibling) header.parentNode.insertBefore(bar, header.nextSibling);
    else panel.insertBefore(bar, panel.firstChild);

    /* Bind actions */
    var handlers = {
      hunt: ProspeccionPro.openHunter,
      enrich: ProspeccionPro.openEnrich,
      pitch: ProspeccionPro.openPitch,
      insights: ProspeccionPro.openInsights,
      funnel: ProspeccionPro.openFunnel,
      cluster: ProspeccionPro.openCluster,
      compare: ProspeccionPro.openCompare,
    };
    bar.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-act');
        if (handlers[act]) handlers[act]();
      });
    });
  };

  ProspeccionPro.init = async function () {
    var panel = $('#panel-prospeccion');
    if (!panel) return;
    if (panel.dataset.prsproInjected) return;
    panel.dataset.prsproInjected = '1';
    await ProspeccionPro.refresh();
    ProspeccionPro.update();
  };

  /* Boot diferido */
  function boot() {
    var setup = function () {
      var panel = $('#panel-prospeccion');
      if (panel && panel.classList.contains('active')) ProspeccionPro.init();
    };
    setTimeout(setup, 1500);
    /* Re-inject cuando entra al panel */
    document.addEventListener('click', function (e) {
      var tab = e.target.closest && e.target.closest('[data-tab="prospeccion"]');
      if (tab) setTimeout(setup, 600);
    });
  }
  if (document.readyState === 'complete') setTimeout(boot, 800);
  else window.addEventListener('load', function () { setTimeout(boot, 800); });

  window.ProspeccionPro = ProspeccionPro;
})();
