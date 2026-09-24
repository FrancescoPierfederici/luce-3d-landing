import { gsap, ScrollTrigger } from '../core/scroll.js';
import { env } from '../core/env.js';

/**
 * Le note: scroll orizzontale pinnato.
 * Ogni pannello: immagine con reveal a clip-path + parallax interno, numero grande,
 * e lo sfondo della sezione che vira verso il colore della nota.
 */
export function createNotes(root) {
  const track = root.querySelector('.notes__track');
  const panels = [...root.querySelectorAll('.note')];
  const images = [...root.querySelectorAll('.note img')];

  // le immagini sono fuori viewport in orizzontale: le forziamo quando la sezione si avvicina
  ScrollTrigger.create({
    trigger: root,
    start: 'top bottom+=100%',
    once: true,
    // e le decodifichiamo prima che servano: niente decode sincrono al primo paint
    onEnter: () =>
      images.forEach((img) => {
        img.loading = 'eager';
        img.decode().catch(() => {});
      }),
  });

  if (env.reducedMotion) return;

  const distance = () => track.scrollWidth - window.innerWidth;
  const colors = panels.map((p) => p.dataset.bg);

  const scroll = gsap.to(track, {
    x: () => -distance(),
    ease: 'none', // obbligatorio con containerAnimation: scroll e posizione 1:1
    scrollTrigger: {
      trigger: root,
      start: 'top top',
      end: () => `+=${distance()}`,
      pin: true,
      scrub: true,
      invalidateOnRefresh: true,
    },
  });

  // sfondo: dal colore di partenza a quello di ogni nota, mentre il pannello arriva al centro
  const bg = gsap.timeline({
    scrollTrigger: { trigger: root, start: 'top top', end: () => `+=${distance()}`, scrub: true },
  });
  colors.forEach((c, i) => bg.to(root, { backgroundColor: c, duration: 1, ease: 'none' }, i === 0 ? 0 : '>'));

  panels.forEach((panel) => {
    const frame = panel.querySelector('.note__media');
    const img = panel.querySelector('img');
    const number = panel.querySelector('.note__number');
    const copy = panel.querySelectorAll('.note__title, .note__accord, .note__text');

    // reveal: la finestra dell'immagine si apre dal basso quando il pannello entra
    gsap.fromTo(
      frame,
      { clipPath: 'inset(100% 0% 0% 0%)' },
      {
        clipPath: 'inset(0% 0% 0% 0%)',
        ease: 'power3.out',
        scrollTrigger: {
          trigger: panel,
          containerAnimation: scroll,
          start: 'left 85%',
          end: 'left 30%',
          scrub: true,
        },
      },
    );

    // parallax interno: l'immagine scorre più lenta della sua finestra
    gsap.fromTo(
      img,
      { xPercent: -8, scale: 1.18 },
      {
        xPercent: 8,
        scale: 1.18,
        ease: 'none',
        scrollTrigger: { trigger: panel, containerAnimation: scroll, start: 'left right', end: 'right left', scrub: true },
      },
    );

    // il numero va in senso opposto: profondità
    gsap.fromTo(
      number,
      { xPercent: 30 },
      {
        xPercent: -30,
        ease: 'none',
        scrollTrigger: { trigger: panel, containerAnimation: scroll, start: 'left right', end: 'right left', scrub: true },
      },
    );

    gsap.from(copy, {
      y: 40,
      autoAlpha: 0,
      stagger: 0.08,
      ease: 'power3.out',
      scrollTrigger: { trigger: panel, containerAnimation: scroll, start: 'left 60%', end: 'left 25%', scrub: true },
    });
  });
}
