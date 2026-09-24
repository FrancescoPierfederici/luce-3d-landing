/**
 * LUCE — landing scroll-driven per un profumo fittizio.
 *
 * Avvio:
 *  1. scroll (Lenis + ScrollTrigger su un solo RAF) bloccato e preloader visibile
 *  2. preloader legato al caricamento reale: primi 20 frame dell'hero + font
 *  3. sezioni create nell'ordine della pagina (l'ordine conta per i pin di ScrollTrigger)
 *  4. uscita a tendina, intro dell'hero, poi Three.js scaricato a pagina ferma
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/preloader.css';
import './styles/hero.css';
import './styles/manifesto.css';
import './styles/bottle.css';
import './styles/notes.css';
import './styles/essence.css';
import './styles/ritual.css';
import './styles/finale.css';

import { env } from './core/env.js';
import { initScroll, lockScroll, unlockScroll, ScrollTrigger } from './core/scroll.js';
import { FrameSequence } from './components/FrameSequence.js';
import { Preloader } from './components/Preloader.js';
import { createHero } from './sections/hero.js';
import { createManifesto } from './sections/manifesto.js';
import { createBottleSection } from './sections/bottle.js';
import { createNotes } from './sections/notes.js';
import { createEssence } from './sections/essence.js';
import { createRitual } from './sections/ritual.js';
import { createFinale } from './sections/finale.js';
import { createHeader } from './components/header.js';
import { createCursor } from './components/cursor.js';
import { createTheme } from './core/theme.js';

// frame del video con la bottiglia pienamente illuminata (per reduced-motion)
const STILL_PROGRESS = 0.6;

async function boot() {
  initScroll();
  lockScroll();

  const preloader = new Preloader(document.querySelector('.preloader'));

  const heroRoot = document.querySelector('.hero');
  const heroSeq = new FrameSequence({
    canvas: heroRoot.querySelector('.hero__canvas'),
    name: 'hero',
    focusY: 0.34,
  });

  // font: 15% del contatore, frame critici: 85%
  let fontsP = 0;
  let framesP = 0;
  const report = () => preloader.setProgress(fontsP * 0.15 + framesP * 0.85);
  document.fonts.ready.then(() => ((fontsP = 1), report()));

  await heroSeq.init();
  if (env.reducedMotion) {
    const still = Math.round(STILL_PROGRESS * (heroSeq.count - 1));
    await heroSeq.loadStill(still);
    framesP = 1;
  } else {
    await heroSeq.load((p) => ((framesP = p), report()));
  }
  report();
  await document.fonts.ready;

  // split-text dopo i font: le righe dipendono dalle metriche reali
  // ScrollTrigger creati nell'ordine della pagina
  const hero = createHero(heroRoot, heroSeq);
  hero.scroll();
  createManifesto(document.querySelector('.manifesto'));
  const bottle = createBottleSection(document.querySelector('.bottle'), {
    canvas: document.querySelector('.webgl'),
  });
  createNotes(document.querySelector('.notes'));
  const essence = createEssence(document.querySelector('.essence'));
  createRitual(document.querySelector('.ritual'));
  createFinale(document.querySelector('.finale'), { getBottle: bottle.load });
  // tema e header dopo le sezioni: si appoggiano ai loro pin
  createTheme({ ritual: document.querySelector('.ritual') });
  createHeader(document.querySelector('.site-header'));
  createCursor();
  ScrollTrigger.refresh();

  if (env.dev) {
    window.__luce = { ...window.__luce, heroSeq, essenceSeq: essence.seq, stats: () => heroSeq.getStats() };
  }

  await preloader.finish();
  unlockScroll();
  hero.intro();

  // Three.js si scarica a pagina ferma, dopo l'intro: non pesa sul primo caricamento
  const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1200));
  idle(() => bottle.load(), { timeout: 4000 });
}

boot().catch((err) => {
  // qualunque errore all'avvio: mai lasciare la pagina coperta dal preloader
  console.error(err);
  document.querySelector('.preloader')?.remove();
  unlockScroll();
});
