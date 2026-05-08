/* ============================================================
 * DAVAI.JS — Asistente AI Chat Module
 * SSE streaming, markdown rendering, conversation management
 * Patron IIFE, vanilla JS
 * ============================================================ */
;(function () {
  'use strict';

  var API = '/api/davai';
  var conversations = [];
  var currentConvId = null;
  var messages = [];
  var isStreaming = false;
  var abortController = null;

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return (ctx || document).querySelectorAll(sel); }
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function getToken() {
    return localStorage.getItem('cotizacion-auth-token') || localStorage.getItem('token') || '';
  }

  /* ----------------------------------------------------------
   * Markdown — lightweight renderer (bold, italic, code, headers, lists, links, tables)
   * ---------------------------------------------------------- */
  function renderMarkdown(text) {
    if (!text) return '';
    var html = esc(text);

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      return '<pre><code class="lang-' + lang + '">' + code + '</code></pre>';
    });
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold + italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Unordered lists
    html = html.replace(/^[*\-] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    // Tables
    html = html.replace(/^\|(.+)\|$/gm, function (match, content) {
      var cells = content.split('|').map(function (c) { return c.trim(); });
      if (cells.every(function (c) { return /^[-:]+$/.test(c); })) return '';
      var tag = 'td';
      return '<tr>' + cells.map(function (c) { return '<' + tag + '>' + c + '</' + tag + '>'; }).join('') + '</tr>';
    });
    html = html.replace(/(<tr>.*<\/tr>\n?)+/g, '<table>$&</table>');
    // Paragraphs
    html = html.replace(/\n{2,}/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    if (!html.startsWith('<')) html = '<p>' + html + '</p>';
    return html;
  }

  /* ----------------------------------------------------------
   * Render messages
   * ---------------------------------------------------------- */
  function renderMessages() {
    var container = qs('#davai-messages');
    if (!container) return;
    var landing = qs('#davai-landing');

    if (messages.length === 0) {
      if (landing) landing.style.display = '';
      return;
    }
    if (landing) landing.style.display = 'none';

    var existingMsgs = container.querySelectorAll('.davai-msg');
    var existingCount = existingMsgs.length;

    for (var i = existingCount; i < messages.length; i++) {
      var msg = messages[i];
      var div = document.createElement('div');
      div.className = 'davai-msg davai-msg--' + msg.role;
      div.setAttribute('data-idx', i);

      var avatarText = msg.role === 'user' ? '<i class="fas fa-user"></i>' : 'D';
      var actions = msg.role === 'ai' ? '<div class="davai-msg__actions">' +
        '<button class="davai-msg__action-btn davai-copy-btn" title="Copiar"><i class="fas fa-copy"></i> Copiar</button>' +
        '</div>' : '';

      div.innerHTML =
        '<div class="davai-msg__avatar">' + avatarText + '</div>' +
        '<div class="davai-msg__content">' +
          '<div class="davai-msg__bubble">' + renderMarkdown(msg.content) + '</div>' +
          actions +
        '</div>';
      container.appendChild(div);
    }

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  function updateStreamingMessage(text) {
    var container = qs('#davai-messages');
    if (!container) return;
    var lastMsg = container.querySelector('.davai-msg:last-child .davai-msg__bubble');
    if (lastMsg) {
      lastMsg.innerHTML = renderMarkdown(text) + '<span class="davai-caret"></span>';
      container.scrollTop = container.scrollHeight;
    }
  }

  function finalizeStreamingMessage(text) {
    var container = qs('#davai-messages');
    if (!container) return;
    var lastMsg = container.querySelector('.davai-msg:last-child .davai-msg__bubble');
    if (lastMsg) lastMsg.innerHTML = renderMarkdown(text);
  }

  function showTyping() {
    var container = qs('#davai-messages');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'davai-typing';
    el.id = 'davai-typing-indicator';
    el.innerHTML = '<div class="davai-typing__dots"><span></span><span></span><span></span></div> DavAI está pensando...';
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function hideTyping() {
    var el = qs('#davai-typing-indicator');
    if (el) el.remove();
  }

  /* ----------------------------------------------------------
   * Send message with SSE streaming
   * ---------------------------------------------------------- */
  async function sendMessage(text) {
    if (!text || !text.trim() || isStreaming) return;
    text = text.trim();

    messages.push({ role: 'user', content: text });
    renderMessages();

    var input = qs('#davai-input');
    if (input) { input.value = ''; input.style.height = 'auto'; }

    isStreaming = true;
    updateSendButton();
    showTyping();

    // Add empty AI message for streaming
    messages.push({ role: 'ai', content: '' });
    var aiIdx = messages.length - 1;

    try {
      abortController = new AbortController();

      var contextPayload = await gatherContext();

      var response = await fetch(API + '/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + getToken()
        },
        body: JSON.stringify({
          message: text,
          conversationId: currentConvId,
          context: contextPayload
        }),
        signal: abortController.signal
      });

      hideTyping();
      renderMessages();

      if (!response.ok) {
        var errData = await response.json().catch(function () { return {}; });
        messages[aiIdx].content = 'Error: ' + (errData.error || response.statusText);
        finalizeStreamingMessage(messages[aiIdx].content);
        isStreaming = false;
        updateSendButton();
        return;
      }

      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var fullText = '';
      var buffer = '';

      while (true) {
        var result = await reader.read();
        if (result.done) break;

        buffer += decoder.decode(result.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (var j = 0; j < lines.length; j++) {
          var line = lines[j];
          if (line.startsWith('data: ')) {
            var data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              var parsed = JSON.parse(data);
              if (parsed.text) {
                fullText += parsed.text;
                messages[aiIdx].content = fullText;
                updateStreamingMessage(fullText);
              }
              if (parsed.conversationId) currentConvId = parsed.conversationId;
            } catch (_) {
              fullText += data;
              messages[aiIdx].content = fullText;
              updateStreamingMessage(fullText);
            }
          }
        }
      }

      messages[aiIdx].content = fullText || 'Sin respuesta.';
      finalizeStreamingMessage(messages[aiIdx].content);

    } catch (err) {
      hideTyping();
      if (err.name === 'AbortError') {
        messages[aiIdx].content = messages[aiIdx].content || '(Cancelado por el usuario)';
      } else {
        messages[aiIdx].content = 'Error de conexión: ' + err.message;
      }
      finalizeStreamingMessage(messages[aiIdx].content);
    }

    isStreaming = false;
    abortController = null;
    updateSendButton();
    saveConversationLocal();
  }

  function updateSendButton() {
    var btn = qs('#davai-send');
    if (!btn) return;
    if (isStreaming) {
      btn.innerHTML = '<i class="fas fa-stop"></i>';
      btn.title = 'Detener';
    } else {
      btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
      btn.title = 'Enviar';
    }
  }

  /* ----------------------------------------------------------
   * Context gathering — pulls live data from current session
   * ---------------------------------------------------------- */
  async function gatherContext() {
    var ctx = { app: 'Sistema de Cotización Industrial', timestamp: new Date().toISOString() };
    try {
      var resp = await fetch('/api/dashboard-stats', {
        headers: { 'Authorization': 'Bearer ' + getToken() }
      });
      if (resp.ok) {
        var stats = await resp.json();
        ctx.totalClientes = (stats.clientes || []).length;
        ctx.totalCotizaciones = (stats.cotizaciones || []).length;
        ctx.totalBitacoras = (stats.bitacoras || []).length;
      }
    } catch (_) {}
    try {
      var resp2 = await fetch('/api/prospectos', {
        headers: { 'Authorization': 'Bearer ' + getToken() }
      });
      if (resp2.ok) {
        var prospectos = await resp2.json();
        ctx.totalProspectos = Array.isArray(prospectos) ? prospectos.length : 0;
        ctx.prospectosResumen = (Array.isArray(prospectos) ? prospectos : []).slice(0, 5).map(function (p) {
          return { empresa: p.empresa, estado: p.estado, potencial: p.potencial_usd, score: p.score_ia };
        });
      }
    } catch (_) {}
    return ctx;
  }

  /* ----------------------------------------------------------
   * Local conversation persistence
   * ---------------------------------------------------------- */
  function saveConversationLocal() {
    try {
      var key = 'davai_conv_' + (currentConvId || 'temp');
      localStorage.setItem(key, JSON.stringify({ id: currentConvId, messages: messages, updated: Date.now() }));
      updateConversationsList();
    } catch (_) {}
  }

  function loadConversationLocal(id) {
    try {
      var data = JSON.parse(localStorage.getItem('davai_conv_' + id));
      if (data && data.messages) {
        messages = data.messages;
        currentConvId = data.id;
        var container = qs('#davai-messages');
        if (container) {
          var existingMsgs = container.querySelectorAll('.davai-msg');
          existingMsgs.forEach(function (el) { el.remove(); });
        }
        renderMessages();
      }
    } catch (_) {}
  }

  function newConversation() {
    currentConvId = 'local-' + Date.now();
    messages = [];
    var container = qs('#davai-messages');
    if (container) {
      var existingMsgs = container.querySelectorAll('.davai-msg');
      existingMsgs.forEach(function (el) { el.remove(); });
    }
    var landing = qs('#davai-landing');
    if (landing) landing.style.display = '';
    updateConversationsList();
  }

  function updateConversationsList() {
    var list = qs('#davai-conversations');
    if (!list) return;
    var convs = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.startsWith('davai_conv_')) {
        try {
          var d = JSON.parse(localStorage.getItem(k));
          if (d && d.messages && d.messages.length > 0) {
            var firstUser = d.messages.find(function (m) { return m.role === 'user'; });
            convs.push({
              id: k.replace('davai_conv_', ''),
              title: firstUser ? firstUser.content.substring(0, 50) : 'Conversación',
              updated: d.updated || 0
            });
          }
        } catch (_) {}
      }
    }
    convs.sort(function (a, b) { return b.updated - a.updated; });

    list.innerHTML = convs.map(function (c) {
      var active = (currentConvId === c.id) ? ' active' : '';
      return '<div class="davai-conv-item' + active + '" data-conv-id="' + esc(c.id) + '">' +
        '<i class="fas fa-comment" style="margin-right:0.4rem;opacity:0.4;font-size:0.7rem;"></i>' +
        esc(c.title) + '</div>';
    }).join('');

    list.querySelectorAll('.davai-conv-item').forEach(function (el) {
      el.addEventListener('click', function () {
        loadConversationLocal(this.getAttribute('data-conv-id'));
        updateConversationsList();
      });
    });
  }

  /* ----------------------------------------------------------
   * Auto-resize textarea
   * ---------------------------------------------------------- */
  function autoResize(textarea) {
    textarea.style.height = 'auto';
    var maxH = window.innerHeight < 700 ? 80 : 120;
    textarea.style.height = Math.min(textarea.scrollHeight, maxH) + 'px';
  }

  /* ----------------------------------------------------------
   * Event binding
   * ---------------------------------------------------------- */
  function bindEvents() {
    var form = qs('#davai-form');
    var input = qs('#davai-input');
    var sendBtn = qs('#davai-send');
    var newBtn = qs('#davai-new-chat');
    var toggleBtn = qs('#davai-toggle-sidebar');

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (isStreaming) {
          if (abortController) abortController.abort();
          return;
        }
        sendMessage(input ? input.value : '');
      });
    }

    if (input) {
      input.addEventListener('input', function () { autoResize(this); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (!isStreaming) sendMessage(this.value);
        }
      });
    }

    if (newBtn) newBtn.addEventListener('click', newConversation);

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        var sidebar = qs('.davai-sidebar');
        if (sidebar) sidebar.classList.toggle('open');
      });
    }

    // Quick actions
    qsa('.davai-quick-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var prompt = this.getAttribute('data-prompt');
        if (prompt) sendMessage(prompt);
      });
    });

    // Copy buttons (delegated)
    var msgContainer = qs('#davai-messages');
    if (msgContainer) {
      msgContainer.addEventListener('click', function (e) {
        var copyBtn = e.target.closest('.davai-copy-btn');
        if (copyBtn) {
          var bubble = copyBtn.closest('.davai-msg__content');
          if (bubble) {
            var text = bubble.querySelector('.davai-msg__bubble').textContent;
            navigator.clipboard.writeText(text).then(function () {
              copyBtn.innerHTML = '<i class="fas fa-check"></i> Copiado';
              setTimeout(function () { copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copiar'; }, 1500);
            });
          }
        }
      });
    }
  }

  /* ----------------------------------------------------------
   * Init
   * ---------------------------------------------------------- */
  function init() {
    bindEvents();
    newConversation();
    updateConversationsList();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DavAI = { init: init, newConversation: newConversation };
})();
