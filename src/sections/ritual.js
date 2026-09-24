import { gsap, ScrollTrigger } from '../core/scroll.js';
import { env } from '../core/env.js';
import { splitLines } from '../core/splitText.js';

/**
 * Il rituale: l'immagine si apre da un riquadro centrale fino a tutto schermo,
 * poi arriva la citazione. Pin ~200vh.
 */
export function createRitual(root) {
  const frame = root.querySelector('.ritual__frame');
  const img = root.querySelector('.ritual__frame img');
  const intro = root.querySelector('.ritual__intro');
  const quote = root.querySelector('.ritual__quote');
  const lines = splitLines(quote.querySelector('blockquote p'));

  // immagine scaricata e decodificata prima di arrivare: l'apertura non deve aspettare il decode
  ScrollTrigger.create({
    trigger: root,
    start: 'top bottom+=120%',
    once: true,
    onEnter: () => {
      img.loading = 'eager';
      img.decode().catch(() => {});
    },
  });

  if (env.reducedMotion) return;

  const mobile = window.innerWidth < 768;
  // riquadro di partenza: verticale su mobile, orizzontale su desktop
  const start = mobile ? 'inset(26% 12% 26% 12% round 6px)' : 'inset(24% 33% 24% 33% round 6px)';

  const scrim = root.querySelector('.ritual__scrim');
  gsap.set(lines, { yPercent: 110 });
  gsap.set([quote.querySelector('figcaption'), scrim], { autoAlpha: 0 });

  gsap
    .timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: root,
        start: 'top top',
        end: '+=120%',
        pin: true,
        scrub: true,
      },
    })
    .fromTo(frame, { clipPath: start }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', duration: 0.6, ease: 'power2.inOut' }, 0)
    .fromTo(img, { scale: 1.3 }, { scale: 1, duration: 0.6, ease: 'power2.inOut' }, 0)
    .to(intro, { autoAlpha: 0, y: -30, duration: 0.2, ease: 'power2.in' }, 0.05)
    .to(scrim, { autoAlpha: 1, duration: 0.15 }, 0.55)
    .to(lines, { yPercent: 0, duration: 0.2, stagger: 0.05, ease: 'power3.out' }, 0.62)
    .to(quote.querySelector('figcaption'), { autoAlpha: 1, duration: 0.12 }, 0.8)
    .to({}, { duration: 0.08 }, 0.92);
}
