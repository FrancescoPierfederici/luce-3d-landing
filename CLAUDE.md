# Case study – Landing prodotto 3D scroll-driven

## Obiettivo
Case study da pubblicare su GitHub: landing page per un profumo INVENTATO ("LUCE"),
livello Awwwards. Mostra due tecniche: hero con video scrubbato allo scroll + sezioni 3D real-time.
Nessun brand reale, loghi o marchi esistenti.

## Stack
- Vite + JavaScript vanilla (niente React)
- Three.js r170, GSAP 3.12 + ScrollTrigger, Lenis
- Sezioni 3D: skill awwwards-3d. Animazioni: skill gsap-*. Design: impeccable / ui-ux-pro-max

## Hero video
- Sorgente: assets/video/hero.mp4
- Frame con ffmpeg: public/frames/desktop (1920px, WebP q80, 120-180 frame) e public/frames/mobile (960px, metà frame)
- Canvas scrubber legato allo scroll, preload progressivo (prima i primi 20 frame)

## Regole
- Rispetta prefers-reduced-motion
- Mobile: meno frame, 3D semplificato, niente post-processing pesante
- Obiettivo 60fps. Testi del sito in italiano
- Non installare librerie extra senza chiedermelo

## GitHub
- Deploy su GitHub Pages con GitHub Actions (imposta il "base" di Vite sul nome del repo)
- README da case study: obiettivo, sfida, soluzione tecnica, stack, performance, screenshot/GIF, link al sito live

## Verifica
Dopo ogni modifica importante: avvia il dev server, apri con Playwright, scrolla tutta la pagina
a 1440px e 390px, fai screenshot e correggi i problemi PRIMA di dirmi che è fatto.
