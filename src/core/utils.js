// Piccole utility condivise.

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** Damping indipendente dal framerate: stessa sensazione a 60 e a 144 Hz. */
export const damp = (current, target, ease, dt) => current + (target - current) * (1 - Math.pow(1 - ease, dt * 60));

export function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
