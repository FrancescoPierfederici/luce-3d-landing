import { ScrollTrigger } from '../core/scroll.js';

/**
 * Header: sparisce scendendo (non si sovrappone ai testi che scorrono),
 * ricompare appena si risale o in cima alla pagina.
 */
export function createHeader(el) {
  let hidden = false;
  const set = (h) => {
    if (h === hidden) return;
    hidden = h;
    el.classList.toggle('is-hidden', h);
  };

  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => {
      const y = self.scroll();
      if (y < window.innerHeight * 0.5) set(false);
      else if (Math.abs(self.getVelocity()) > 30) set(self.direction === 1);
    },
  });

  // il focus da tastiera deve sempre poter raggiungere il logo
  el.addEventListener('focusin', () => set(false));
}
