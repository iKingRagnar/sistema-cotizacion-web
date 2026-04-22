/**
 * bg-animation.js — Fondo animado premium
 * Constelación de partículas en sidebar + paralaje de gradiente en contenido principal
 * Inspirado en experimentos de UI Google / Material You
 */
(function premiumBg() {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     1. CONSTELACIÓN DE PARTÍCULAS — sidebar dark
     Partículas que flotan y se apartan suavemente cuando el
     cursor se acerca (efecto "anti-gravedad" invertido).
     ═══════════════════════════════════════════════════════════ */
  function initSidebarParticles() {
    const sidebar = document.querySelector('.sidebar-nav');
    if (!sidebar) return;

    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position: 'absolute', inset: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '0', opacity: '0.6',
    });
    sidebar.style.position = 'relative';
    sidebar.insertBefore(canvas, sidebar.firstChild);

    // Todo el contenido del sidebar sube por encima del canvas
    Array.from(sidebar.children).forEach(c => {
      if (c !== canvas) {
        c.style.position = 'relative';
        c.style.zIndex = '1';
      }
    });

    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, animId = null;
    const MOUSE = { x: -9999, y: -9999 };

    // ── Particle ──────────────────────────────────────────────
    const N_PARTICLES = 68;
    const CONNECT_DIST = 90;
    const REPEL_DIST = 130;
    const REPEL_STRENGTH = 0.022;

    // Paleta alineada al brand: azul zafiro + teal + cian + índigo
    const PALETTE_HUES = [210, 195, 220, 185, 230, 200];

    class Particle {
      constructor() { this.randomize(); }
      randomize() {
        this.x  = Math.random() * W;
        this.y  = Math.random() * H;
        this.vx = (Math.random() - .5) * .5;
        this.vy = (Math.random() - .5) * .5;
        this.r  = Math.random() * 1.8 + .6;
        this.a  = Math.random() * .5 + .25;
        this.h  = PALETTE_HUES[Math.floor(Math.random() * PALETTE_HUES.length)];
        this.s  = 65 + Math.random() * 30;
        this.l  = 55 + Math.random() * 28;
        // pulso de brillo
        this.pulseSpeed = Math.random() * .015 + .005;
        this.pulsePhase = Math.random() * Math.PI * 2;
      }
      update(t) {
        // Anti-gravedad: repulsión suave cuando el cursor se acerca
        const dx = this.x - MOUSE.x;
        const dy = this.y - MOUSE.y;
        const d  = Math.hypot(dx, dy);
        if (d < REPEL_DIST && d > .1) {
          const f = ((REPEL_DIST - d) / REPEL_DIST) * REPEL_STRENGTH;
          this.vx += (dx / d) * f;
          this.vy += (dy / d) * f;
        }

        // Amortiguamiento
        this.vx *= .982;
        this.vy *= .982;
        this.x  += this.vx;
        this.y  += this.vy;

        // Wrap edges
        if (this.x < -12) this.x = W + 12;
        if (this.x > W + 12) this.x = -12;
        if (this.y < -12) this.y = H + 12;
        if (this.y > H + 12) this.y = -12;

        // Pulso de opacidad
        this.curAlpha = this.a * (.7 + .3 * Math.sin(t * this.pulseSpeed + this.pulsePhase));
      }
      draw() {
        // Halo luminoso (glow)
        const gr = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 7);
        gr.addColorStop(0, `hsla(${this.h},${this.s}%,${this.l}%,${this.curAlpha * .7})`);
        gr.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r * 7, 0, Math.PI * 2);
        ctx.fillStyle = gr;
        ctx.fill();

        // Núcleo brillante
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${this.h},${this.s}%,${Math.min(this.l + 18, 96)}%,${this.curAlpha})`;
        ctx.fill();
      }
    }

    function resize() {
      W = canvas.width  = sidebar.offsetWidth;
      H = canvas.height = sidebar.offsetHeight;
    }

    const particles = [];
    function createParticles() {
      particles.length = 0;
      for (let i = 0; i < N_PARTICLES; i++) particles.push(new Particle());
    }

    function drawEdges() {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const pi = particles[i], pj = particles[j];
          const dx = pi.x - pj.x, dy = pi.y - pj.y;
          const d  = Math.hypot(dx, dy);
          if (d < CONNECT_DIST) {
            const alpha = (1 - d / CONNECT_DIST) * .22;
            ctx.beginPath();
            ctx.moveTo(pi.x, pi.y);
            ctx.lineTo(pj.x, pj.y);
            ctx.strokeStyle = `rgba(147,197,253,${alpha})`;
            ctx.lineWidth = .55;
            ctx.stroke();
          }
        }
      }
    }

    let t = 0;
    function loop() {
      ctx.clearRect(0, 0, W, H);
      t++;
      particles.forEach(p => { p.update(t); p.draw(); });
      drawEdges();
      animId = requestAnimationFrame(loop);
    }

    function init() {
      resize();
      createParticles();
      loop();
    }

    // Posición del mouse relativa al canvas del sidebar
    document.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      MOUSE.x = e.clientX - r.left;
      MOUSE.y = e.clientY - r.top;
    }, { passive: true });

    // Touch support
    document.addEventListener('touchmove', e => {
      if (!e.touches.length) return;
      const r = canvas.getBoundingClientRect();
      MOUSE.x = e.touches[0].clientX - r.left;
      MOUSE.y = e.touches[0].clientY - r.top;
    }, { passive: true });

    const ro = new ResizeObserver(() => { resize(); });
    ro.observe(sidebar);

    // Pausa cuando la pestaña no está visible (ahorro de CPU)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(animId); animId = null;
      } else if (!animId) {
        loop();
      }
    });

    init();
  }

  /* ═══════════════════════════════════════════════════════════
     2. PARALAJE DE GRADIENTE — contenido principal
     El gradiente de fondo del área main se desplaza con el
     cursor, dando profundidad y sensación de gravedad.
     ═══════════════════════════════════════════════════════════ */
  function initParallaxGradient() {
    // Target suavizado con lerp
    let tx = 50, ty = 50;   // target
    let cx = 50, cy = 50;   // current
    const LERP = .065;
    let rAfId = null;

    function tick() {
      cx += (tx - cx) * LERP;
      cy += (ty - cy) * LERP;
      document.documentElement.style.setProperty('--pmx', cx.toFixed(2));
      document.documentElement.style.setProperty('--pmy', cy.toFixed(2));
      rAfId = requestAnimationFrame(tick);
    }

    document.addEventListener('mousemove', e => {
      tx = (e.clientX / window.innerWidth)  * 100;
      ty = (e.clientY / window.innerHeight) * 100;
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!e.touches.length) return;
      tx = (e.touches[0].clientX / window.innerWidth)  * 100;
      ty = (e.touches[0].clientY / window.innerHeight) * 100;
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(rAfId); rAfId = null; }
      else if (!rAfId) tick();
    });

    tick();
  }

  /* ═══════════════════════════════════════════════════════════
     3. CURSOR SPOTLIGHT — tabla
     Un brillo semitransparente que sigue el cursor sobre las
     tablas, resaltando la zona apuntada.
     ═══════════════════════════════════════════════════════════ */
  function initTableSpotlight() {
    document.addEventListener('mousemove', e => {
      const tables = document.querySelectorAll('table.data-table tbody');
      tables.forEach(tbody => {
        const r = tbody.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        tbody.style.setProperty('--tx', mx + 'px');
        tbody.style.setProperty('--ty', my + 'px');
      });
    }, { passive: true });
  }

  /* ─── Bootstrap ─────────────────────────────────────────── */
  function boot() {
    initSidebarParticles();
    initParallaxGradient();
    initTableSpotlight();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
