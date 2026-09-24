import { gsap, ScrollTrigger } from '../core/scroll.js';
import { env } from '../core/env.js';
import { FrameSequence } from '../components/FrameSequence.js';

// frame della sequenza per reduced-motion: ingredienti in volo attorno alla bottiglia
const STILL_PROGRESS = 0.7;

/**
 * L'essenza: canvas che scrubba ingredients.mp4 (pin ~250vh) con testi che entrano dai lati.
 * La sequenza si scarica solo quando la sezione si avvicina, non all'avvio.
 */
export function createEssence(root) {
  const seq = new FrameSequence({
    canvas: root.querySelector('.essence__canvas'),
    name: 'ingredients',
    focusY: 0.3,
  });

  let loading = null;
  const load = () =>
    (loading ??= seq.init().then(() => {
      if (env.reducedMotion) return seq.loadStill(Math.round(STILL_PROGRESS * (seq.count - 1)));
      return seq.load();
    }));

  ScrollTrigger.create({
    trigger: root,
    start: 'top bottom+=150%',
    once: true,
    onEnter: load,
  });

  if (env.reducedMotion) return { seq };

  const lines = [...root.querySelectorAll('.essence__line')];
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: root,
      start: 'top top',
      end: '+=150%', // 100vh + 150% ≈ 250vh
      pin: true,
      scrub: true,
      onUpdate: (self) => seq.setProgress(self.progress),
    },
  });

  tl.to(root.querySelector('.essence__intro'), { autoAlpha: 0, y: -24, duration: 0.12, ease: 'power2.in' }, 0.06);

  // ogni riga entra dal suo lato, resta, poi si dissolve
  const slots = [0.12, 0.4, 0.68];
  lines.forEach((line, i) => {
    const fromLeft = line.dataset.side === 'left';
    const at = slots[i];
    tl.fromTo(
      line,
      { autoAlpha: 0, xPercent: fromLeft ? -40 : 40 },
      { autoAlpha: 1, xPercent: 0, duration: 0.1, ease: 'power3.out' },
      at,
    ).to(line, { autoAlpha: 0, xPercent: fromLeft ? -12 : 12, duration: 0.08, ease: 'power2.in' }, at + 0.2);
  });
  tl.to({}, { duration: 0.04 }, 0.96); // durata totale 1

  // lontano dalla sezione: bitmap liberate (restano i blob)
  ScrollTrigger.create({
    trigger: root,
    start: 'top bottom',
    end: () => tl.scrollTrigger.end + window.innerHeight,
    onToggle: (self) => (self.isActive ? seq.wake() : seq.sleep()),
  });

  return { seq };
}
