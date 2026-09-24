import { gsap } from '../core/scroll.js';
import { env } from '../core/env.js';
import { splitWords } from '../core/splitText.js';

/**
 * Manifesto: le parole si accendono una alla volta con lo scroll (15% → 100%).
 * Le parole in <em> si accendono in ambra.
 */
export function createManifesto(root) {
  const text = root.querySelector('.manifesto__text');
  const words = splitWords(text);

  if (env.reducedMotion) return;

  gsap.set(words, { opacity: 0.15 });

  gsap
    .timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: root,
        start: 'top top',
        end: '+=160%',
        pin: true,
        scrub: true,
      },
    })
    .to(words, { opacity: 1, duration: 0.25, stagger: 0.75 / words.length }, 0)
    // piccola pausa a frase completa prima di sganciare il pin
    .to({}, { duration: 0.1 });
}
