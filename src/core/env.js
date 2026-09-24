// Flag d'ambiente letti una volta sola all'avvio.
const mq = (q) => window.matchMedia(q).matches;

export const env = {
  reducedMotion: mq('(prefers-reduced-motion: reduce)'),
  isTouch: mq('(hover: none), (pointer: coarse)'),
  // il set di frame si sceglie sulla larghezza del viewport, non sullo user agent
  isMobile: Math.min(window.innerWidth, window.screen.width) < 768,
  dpr: Math.min(window.devicePixelRatio || 1, 2),
  base: import.meta.env.BASE_URL,
  dev: import.meta.env.DEV,
};

/**
 * Layout "impilato": telefoni e tablet in verticale. Deve coincidere con la media query
 * usata in bottle.css, notes.css ed essence.css.
 */
export const STACKED_QUERY = '(max-width: 767px), (orientation: portrait) and (max-width: 1100px)';
export const isStacked = () => window.matchMedia(STACKED_QUERY).matches;

document.documentElement.classList.toggle('is-touch', env.isTouch);
document.documentElement.classList.toggle('is-reduced', env.reducedMotion);
