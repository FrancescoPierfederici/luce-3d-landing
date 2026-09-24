import { gsap } from './scroll.js';

/**
 * Notte → ambra → alba.
 * Il tema vive in poche variabili CSS su :root (--bg, --ink, --accent, --vignette);
 * tutto il resto ne deriva (color-mix in tokens.css), header compreso.
 * Un'unica timeline con un solo ScrollTrigger: nessun conflitto tra tween, e risalendo si torna alla notte.
 */
export const THEMES = {
  night: { '--bg': '#0B0B0C', '--ink': '#F5EFE6', '--accent': '#F2B35B', '--vignette': 0.45 },
  amber: { '--bg': '#F2B35B', '--ink': '#0B0B0C', '--accent': '#7A430A', '--vignette': 0.2 },
  dawn: { '--bg': '#F5EFE6', '--ink': '#0B0B0C', '--accent': '#9A5A12', '--vignette': 0 },
};

// in unità di viewport: il rituale sale dal basso (1) poi l'immagine si apre (0.72 = 60% del pin di 120%)
const ENTER = 1;
const OPEN = 0.72;

export function createTheme({ ritual }) {
  const root = document.documentElement;
  gsap.set(root, THEMES.night);

  gsap
    .timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: ritual,
        start: 'top bottom',
        end: () => `+=${window.innerHeight * (ENTER + OPEN)}`,
        scrub: true,
      },
    })
    // 1. il cielo si scalda mentre il rituale sale
    .to(root, { '--bg': THEMES.amber['--bg'], '--vignette': THEMES.amber['--vignette'], duration: ENTER }, 0)
    // l'inchiostro cambia in un tratto breve a metà: niente grigio-su-grigio
    .to(root, { '--ink': THEMES.amber['--ink'], '--accent': THEMES.amber['--accent'], duration: 0.2 }, ENTER * 0.4)
    // 2. mentre l'immagine si apre: dall'ambra all'avorio
    .to(root, { '--bg': THEMES.dawn['--bg'], '--accent': THEMES.dawn['--accent'], '--vignette': THEMES.dawn['--vignette'], duration: OPEN }, ENTER);
}
