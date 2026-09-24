import { gsap, ScrollTrigger } from '../core/scroll.js';
import { env, isStacked } from '../core/env.js';
import { whenScrollIdle, yieldToMain } from '../core/utils.js';

// momenti (progress del pin) in cui compaiono i tre callout
const CALLOUT_AT = { glass: 0.14, cap: 0.4, liquid: 0.66 };
const CALLOUT_SPAN = 0.26; // su mobile ogni callout resta visibile per questo tratto

/**
 * Sezione "La bottiglia".
 * Il pin e i callout esistono subito (servono al layout di ScrollTrigger);
 * Three.js viene importato in modo pigro, poco prima che la sezione arrivi.
 */
export function createBottleSection(root, { canvas }) {
  const callouts = [...root.querySelectorAll('[data-anchor]')].map((el) => ({
    el,
    name: el.dataset.anchor,
    at: CALLOUT_AT[el.dataset.anchor],
    line: root.querySelector(`[data-line="${el.dataset.anchor}"]`),
    dot: root.querySelector(`[data-dot="${el.dataset.anchor}"]`),
    text: el.querySelector('.callout__text'),
    from: { x: 0, y: 0 },
    to: { x: 0, y: 0 },
    last: {},
  }));
  const intro = root.querySelector('.bottle__intro');
  const sequential = isStacked; // telefoni e tablet in verticale: un callout alla volta

  let scene = null;
  let stage = null;
  let progress = env.reducedMotion ? 0.12 : 0;

  // ── pin ───────────────────────────────────────────────
  let pin = null;
  if (!env.reducedMotion) {
    pin = ScrollTrigger.create({
      trigger: root,
      start: 'top top',
      end: '+=250%',
      pin: true,
      onUpdate: (self) => {
        progress = self.progress;
        scene?.setProgress(progress);
      },
    });
    gsap.fromTo(
      intro,
      { autoAlpha: 1 },
      {
        autoAlpha: 0,
        y: -30,
        ease: 'power2.in',
        // l'introduzione lascia spazio prima del primo callout
        scrollTrigger: { trigger: root, start: () => pin.start + innerHeight * 0.02, end: () => pin.start + innerHeight * 0.3, scrub: true },
      },
    );
  }

  // ── attivazione del render: solo con la sezione (quasi) in vista ──
  const visibility = ScrollTrigger.create({
    trigger: root,
    start: pin ? () => pin.start - innerHeight : 'top bottom',
    end: pin ? () => pin.end + innerHeight : 'bottom top',
    onToggle: (self) => {
      frame.lastTop = null; // al rientro la dissolvenza del canvas va ricalcolata
      if (self.isActive) scene?.setMode('showcase');
      stage?.setActive('bottle', self.isActive);
    },
  });

  // ── caricamento pigro di Three.js + HDRI ──
  // I passi pesanti (renderer, HDRI, primo render con compilazione: ~220 ms non divisibili)
  // aspettano una pausa nello scroll, così non interrompono lo scrub dell'hero.
  // Se la sezione è ormai vicina il caricamento diventa urgente e non aspetta più.
  let makeUrgent;
  const urgent = new Promise((r) => (makeUrgent = r));
  const quietMoment = () => Promise.race([whenScrollIdle(250), urgent]).then(yieldToMain);
  let loading = null;
  const loadNow = () => {
    makeUrgent();
    return load();
  };
  const load = () =>
    (loading ??= (async () => {
      const [{ Stage }, { BottleScene }] = await Promise.all([
        import('../three/Stage.js'),
        import('../three/BottleScene.js'),
      ]);
      await quietMoment();
      const s = new Stage(canvas);
      await quietMoment();
      const sc = new BottleScene(s);
      sc.setProgress(progress);
      await quietMoment();
      // HDRI prima della compilazione: cambiare environment dopo può ricompilare gli shader.
      // 512 px bastano per riflessi sfumati da studio e il parsing costa ~4 volte meno dell'1k
      await Promise.race([
        s.loadHDRI(`${env.base}hdri/studio_small_08_512.hdr`, { intensity: 0.95, rotationY: -0.6 }).catch(() => {}),
        new Promise((r) => setTimeout(r, 5000)),
      ]);
      await quietMoment();
      await s.warmUp(); // shader e buffer di trasmissione pronti prima che la sezione arrivi
      await quietMoment();
      sc.prepare(); // entrambi i fondali (notte e alba) già sulla GPU
      stage = s;
      scene = sc;
      stage.onFrame(frame);
      stage.setActive('bottle', visibility.isActive);
      measure();
      bindPointer();
      if (env.dev) window.__luce = { ...window.__luce, stage, bottleScene: scene };
      return { stage, scene };
    })());

  ScrollTrigger.create({
    trigger: root,
    start: pin ? () => pin.start - innerHeight * 2.5 : 'top bottom+=250%',
    once: true,
    onEnter: () => loadNow(),
  });

  // ── callout: punto di partenza delle linee, misurato dal layout ──
  function measure() {
    const r = root.getBoundingClientRect();
    callouts.forEach((c) => {
      const b = c.el.querySelector('.callout__title').getBoundingClientRect();
      const side = sequential() ? 'bottom' : c.el.dataset.side;
      c.from.x = (side === 'left' ? b.right + 16 : side === 'right' ? b.left - 16 : b.left + b.width / 2) - r.left;
      c.from.y = (side === 'bottom' ? b.top - 12 : b.top + b.height / 2) - r.top;
    });
  }
  ScrollTrigger.addEventListener('refresh', () => measure());

  // ── frame: rotazione, proiezione ancore, disegno linee ──
  function frame(dt) {
    if (!stage.users.has('bottle')) return; // la scena può essere del finale
    const rect = root.getBoundingClientRect();
    scene.update(dt, rect.top);
    const seq = sequential();

    callouts.forEach((c) => {
      const local = (progress - c.at) / 0.1;
      let reveal = env.reducedMotion ? 1 : gsap.utils.clamp(0, 1, local);
      if (seq && !env.reducedMotion) {
        const out = gsap.utils.clamp(0, 1, (progress - c.at - CALLOUT_SPAN + 0.06) / 0.06);
        reveal = Math.min(reveal, 1 - out);
      }
      const draw = env.reducedMotion ? 1 : gsap.utils.clamp(0, 1, (local - 0.25) / 0.75);
      const eased = 1 - Math.pow(1 - Math.min(draw, reveal), 3);

      // tutto in coordinate locali della sezione (l'SVG scorre con lei)
      scene.project(c.name, c.to);
      const tx = c.to.x - rect.left;
      const ty = c.to.y - rect.top;
      const { x: x1, y: y1 } = c.from;
      const x2 = x1 + (tx - x1) * eased;
      const y2 = y1 + (ty - y1) * eased;

      setAttrs(c.line, c.last, { x1, y1, x2, y2, opacity: eased > 0.001 ? 1 : 0 });
      setAttrs(c.dot, c.last, { cx: tx, cy: ty, r: eased > 0.98 ? 3.5 : 0 }, 'dot');
      const key = reveal.toFixed(3);
      if (c.last.reveal !== key) {
        c.last.reveal = key;
        // il titolo resta fermo (da lì parte la linea), scorre solo il testo
        c.el.style.opacity = reveal;
        c.text.style.transform = `translate3d(0, ${(1 - reveal) * 14}px, 0)`;
      }
    });

    // in reduced-motion il render è su richiesta: ridisegna solo se la sezione si è mossa
    if (rect.top !== frame.lastTop) {
      frame.lastTop = rect.top;
      stage.invalidate();
      // la scena si accende entrando e si spegne uscendo: niente bordi netti col resto della pagina
      const vh = window.innerHeight;
      const fade = gsap.utils.clamp(0, 1, (vh - rect.top) / (vh * 0.8)) * gsap.utils.clamp(0, 1, rect.bottom / (vh * 0.8));
      canvas.style.opacity = fade.toFixed(3);
    }
  }

  // ── mouse: inclinazione + trascinamento (solo puntatori fini) ──
  function bindPointer() {
    if (env.isTouch || env.reducedMotion) return;
    const hit = root.querySelector('.bottle__hit');
    let dragging = false;
    let lastX = 0;
    window.addEventListener('pointermove', (e) => {
      if (!stage.active) return;
      scene.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
      if (dragging) {
        scene.addDrag(e.clientX - lastX);
        lastX = e.clientX;
      }
    });
    hit.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      root.classList.add('is-dragging');
      hit.setPointerCapture(e.pointerId);
    });
    const end = () => {
      dragging = false;
      root.classList.remove('is-dragging');
    };
    hit.addEventListener('pointerup', end);
    hit.addEventListener('pointercancel', end);
  }

  return { load, loadNow };
}

/** Scrive attributi SVG solo quando cambiano (niente lavoro inutile a ogni frame). */
function setAttrs(el, cache, attrs, prefix = 'line') {
  for (const k in attrs) {
    const v = typeof attrs[k] === 'number' ? Math.round(attrs[k] * 10) / 10 : attrs[k];
    const ck = prefix + k;
    if (cache[ck] !== v) {
      cache[ck] = v;
      el.setAttribute(k, v);
    }
  }
}
