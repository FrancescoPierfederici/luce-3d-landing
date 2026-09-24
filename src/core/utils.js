// Piccole utility condivise.

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** Damping indipendente dal framerate: stessa sensazione a 60 e a 144 Hz. */
export const damp = (current, target, ease, dt) => current + (target - current) * (1 - Math.pow(1 - ease, dt * 60));

export function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Cede il main thread tra due blocchi di lavoro: nessun task lungo, input sempre reattivo. */
export const yieldToMain = () =>
  globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((r) => setTimeout(r, 0));

/** Si risolve dopo `ms` senza eventi di scroll: il momento giusto per lavoro pesante e invisibile. */
export function whenScrollIdle(ms = 250) {
  return new Promise((resolve) => {
    let t = setTimeout(done, ms);
    function onScroll() {
      clearTimeout(t);
      t = setTimeout(done, ms);
    }
    function done() {
      window.removeEventListener('scroll', onScroll);
      resolve();
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  });
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
