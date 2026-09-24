import { defineConfig } from 'vite';

// Content Security Policy della build: solo risorse del sito + Google Fonts.
// 'unsafe-inline' serve solo per gli stili: GSAP anima scrivendo attributi style.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const csp = () => ({
  name: 'luce-csp',
  apply: 'build', // in dev Vite inietta script inline (HMR)
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serve il sito da /luce-3d-landing/ (anche `vite preview`, per provare la build reale)
  base: command === 'build' || isPreview ? '/luce-3d-landing/' : '/',
  plugins: [csp()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    // il chunk di three (~500 kB, 129 kB gzip) è caricato in modo pigro: l'avviso non serve
    chunkSizeWarningLimit: 600,
  },
}));
