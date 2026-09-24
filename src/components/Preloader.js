import gsap from 'gsap';
import { env } from '../core/env.js';
import { splitChars } from '../core/splitText.js';

const MIN_DURATION = 1.6; // secondi: il wordmark deve avere il tempo di comparire

/**
 * Contatore 0→100 legato al caricamento reale.
 * Il valore mostrato insegue quello reale con un lerp indipendente dal framerate,
 * così non salta a gradini quando arrivano più frame insieme.
 */
export class Preloader {
  constructor(root) {
    this.root = root;
    this.counter = root.querySelector('[data-preloader-count]');
    this.bar = root.querySelector('[data-preloader-bar]');
    this.wordmark = root.querySelector('[data-preloader-wordmark]');
    this.target = 0;
    this.shown = 0;
    this.start = performance.now();
    this._tick = this._tick.bind(this);

    this.chars = splitChars(this.wordmark);
    if (env.reducedMotion) {
      gsap.set(this.root, { autoAlpha: 1 });
    } else {
      gsap.fromTo(
        this.chars,
        { yPercent: 115 },
        { yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: 0.09, delay: 0.15 },
      );
    }
    gsap.ticker.add(this._tick);
  }

  setProgress(p) {
    this.target = Math.max(this.target, Math.min(1, p));
  }

  _tick(_time, deltaMs) {
    const k = 1 - Math.pow(1 - 0.08, (deltaMs / 1000) * 60);
    this.shown += (this.target - this.shown) * k;
    if (this.target - this.shown < 0.002) this.shown = this.target;
    const value = Math.round(this.shown * 100);
    if (value !== this._last) {
      this.counter.textContent = String(value).padStart(3, '0');
      this._last = value;
    }
    this.bar.style.transform = `scaleX(${this.shown})`;
  }

  /** Attende che il contatore arrivi a 100, poi esce a tendina. Risolve quando l'hero può iniziare. */
  async finish() {
    await new Promise((resolve) => {
      const check = () => {
        const elapsed = (performance.now() - this.start) / 1000;
        if (this.shown >= 1 && (elapsed >= MIN_DURATION || env.reducedMotion)) {
          gsap.ticker.remove(check);
          resolve();
        }
      };
      gsap.ticker.add(check);
    });
    gsap.ticker.remove(this._tick);

    return new Promise((resolve) => {
      if (env.reducedMotion) {
        gsap.to(this.root, {
          autoAlpha: 0,
          duration: 0.5,
          onStart: resolve,
          onComplete: () => this.root.remove(),
        });
        return;
      }

      gsap
        .timeline({ onComplete: () => this.root.remove() })
        .to(this.root.querySelector('.preloader__meta'), { autoAlpha: 0, duration: 0.4, ease: 'power2.in' })
        .to(this.chars, { yPercent: -115, duration: 0.7, ease: 'power3.in', stagger: 0.05 }, 0.1)
        // tendina: il pannello si ritira verso l'alto
        .to(this.root, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.15, ease: 'expo.inOut' }, 0.55)
        .call(resolve, null, 0.95);
    });
  }
}
