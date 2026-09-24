import { gsap, ScrollTrigger } from '../core/scroll.js';
import { env } from '../core/env.js';
import { splitLines } from '../core/splitText.js';

/**
 * Hero: canvas che scrubba hero.mp4, sezione pinnata per ~300vh.
 * Due strati d'ombra separati così intro e scroll non litigano sulla stessa proprietà:
 *  - .hero__night  → coperto dall'intro (1 → 0)
 *  - .hero__shade  → pilotato dallo scroll (0.82 → 0): la bottiglia emerge dal buio
 */
export function createHero(root, seq) {
  const q = (s) => root.querySelector(s);
  const title = q('.hero__title');
  const lines = splitLines(title);
  const intros = [q('.hero__sub'), q('.hero__cue-inner'), document.querySelector('.site-header__inner')];

  if (!env.reducedMotion) {
    gsap.set(lines, { yPercent: 110 });
    gsap.set(intros, { autoAlpha: 0, y: 14 });
  }

  function intro() {
    if (env.reducedMotion) {
      gsap.to(q('.hero__night'), { autoAlpha: 0, duration: 0.8, ease: 'power2.out' });
      return;
    }
    gsap
      .timeline()
      .to(q('.hero__night'), { autoAlpha: 0, duration: 2.4, ease: 'power2.out' }, 0)
      .to(lines, { yPercent: 0, duration: 1.5, ease: 'expo.out', stagger: 0.12 }, 0.2)
      .to(intros, { autoAlpha: 1, y: 0, duration: 1.2, ease: 'power3.out', stagger: 0.1 }, 0.7);
  }

  function scroll() {
    if (env.reducedMotion) return;

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: root,
        start: 'top top',
        end: '+=200%', // 100vh di sezione + 200% di pin ≈ 300vh
        pin: true,
        scrub: true, // Lenis smussa già lo scroll: niente doppio lerp
        onUpdate: (self) => seq.setProgress(self.progress),
      },
    });

    tl.to(q('.hero__shade'), { opacity: 0, duration: 0.2, ease: 'power1.in' }, 0)
      .fromTo(q('.hero__vignette'), { scale: 1 }, { scale: 1.7, duration: 0.4, ease: 'power2.out' }, 0)
      .to(q('.hero__cue'), { autoAlpha: 0, duration: 0.05 }, 0)
      .to(q('.hero__copy'), { yPercent: -18, autoAlpha: 0, duration: 0.25, ease: 'power2.in' }, 0.3)
      .fromTo(q('.hero__aside'), { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.15, ease: 'power3.out' }, 0.55)
      .to(q('.hero__aside'), { autoAlpha: 0, y: -30, duration: 0.12, ease: 'power2.in' }, 0.84)
      // la bottiglia rientra nel buio: passaggio morbido verso il manifesto
      .to(q('.hero__shade'), { opacity: 0.9, duration: 0.1, ease: 'power1.in' }, 0.9);
    // durata totale 1: progress timeline = progress scroll

    // hero lontano (un viewport oltre la fine del pin): via le bitmap, ~200 MB liberati per il 3D
    const pin = tl.scrollTrigger;
    ScrollTrigger.create({
      start: () => pin.start,
      end: () => pin.end + window.innerHeight,
      onLeave: () => seq.sleep(),
      onEnterBack: () => seq.wake(),
    });
    return tl;
  }

  return { intro, scroll };
}
