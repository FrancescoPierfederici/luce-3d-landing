import gsap from 'gsap';
import { env } from '../core/env.js';
import { clamp, debounce, hexToRgba } from '../core/utils.js';

/**
 * Scrubber di una sequenza di frame su <canvas>.
 *
 * Memoria a due livelli:
 *  - download: tutti i frame restano Blob compressi (pochi MB in totale)
 *  - decode: solo `cacheSize` ImageBitmap vivi in una finestra attorno all'indice corrente,
 *    sbilanciata nella direzione dello scroll; ciò che esce dalla finestra viene liberato
 *    con bitmap.close() (per lo scrub funziona meglio di un LRU puro: serve il vicinato).
 *  - sleep()/wake(): con la sezione lontana si liberano tutte le bitmap, restano i blob.
 *
 * Nessun loop proprio: disegna dentro il ticker di GSAP, solo se qualcosa è cambiato.
 */
export class FrameSequence {
  constructor({
    canvas,
    name,
    profile = env.isMobile ? 'mobile' : 'desktop',
    cacheSize = 24,
    critical = 20,
    fetchConcurrency = 6,
    decodeConcurrency = 2,
    portraitZoom = 1.9, // in verticale mostra ~1/1.9 della larghezza del video invece del cover pieno
    focusY = 0.5,
    background = '#0B0B0C',
  }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dir = `${env.base}frames/${profile}/${name}/`;
    this.opts = { cacheSize, critical, fetchConcurrency, decodeConcurrency, portraitZoom, focusY, background };

    this.count = 0;
    this.blobs = [];
    this.cache = new Map(); // index -> ImageBitmap
    this.decoding = new Set();
    this.target = 0;
    this.direction = 1;
    this.drawnIndex = -1;
    this.dirty = true;
    this.disposed = false;
    this.stats = { downloaded: 0, decoded: 0, evicted: 0, peakBitmaps: 0 };

    this._tick = this._tick.bind(this);
    this._onResize = debounce(() => this.resize(), 150);
  }

  async init() {
    const res = await fetch(`${this.dir}manifest.json`);
    this.manifest = await res.json();
    this.count = this.manifest.count;
    this.blobs = new Array(this.count).fill(null);
    if (this.progress) this.target = Math.round(clamp(this.progress, 0, 1) * (this.count - 1));
    this.resize();
    window.addEventListener('resize', this._onResize);
    gsap.ticker.add(this._tick);
    return this;
  }

  url(i) {
    const { pad, ext } = this.manifest;
    return `${this.dir}${String(i + 1).padStart(pad, '0')}.${ext}`;
  }

  /**
   * Scarica tutta la sequenza in ordine progressivo.
   * Risolve quando i primi `critical` frame sono pronti (il resto continua in background).
   */
  load(onProgress = () => {}) {
    const { critical, fetchConcurrency } = this.opts;
    const order = progressiveOrder(this.count, critical);
    const criticalSet = new Set(order.slice(0, Math.min(critical, this.count)));
    let criticalDone = 0;

    let resolveCritical;
    const criticalReady = new Promise((r) => (resolveCritical = r));

    let cursor = 0;
    const worker = async () => {
      while (cursor < order.length && !this.disposed) {
        const i = order[cursor++];
        await this._fetchFrame(i);
        if (criticalSet.has(i)) {
          criticalDone++;
          onProgress(criticalDone / criticalSet.size);
          if (criticalDone === criticalSet.size) resolveCritical();
        }
      }
    };
    Array.from({ length: fetchConcurrency }, worker);

    // il primo frame deve essere decodificato prima di togliere il preloader
    return criticalReady.then(() => this._decode(this.target));
  }

  /** Reduced motion: un solo frame statico. */
  async loadStill(index) {
    this.target = index;
    await this._fetchFrame(index);
    await this._decode(index);
  }

  async _fetchFrame(i, retry = 1) {
    if (this.blobs[i]) return;
    try {
      const res = await fetch(this.url(i));
      if (!res.ok) throw new Error(res.status);
      this.blobs[i] = await res.blob();
      this.stats.downloaded++;
      this._schedule();
    } catch (err) {
      if (retry > 0) return this._fetchFrame(i, retry - 1);
      // frame mancante: lo scrub userà il frame decodificato più vicino
    }
  }

  /** progress 0..1 dallo ScrollTrigger */
  setProgress(p) {
    this.progress = p;
    if (!this.count) return; // sequenza non ancora inizializzata: il valore si applica in init()
    const i = Math.round(clamp(p, 0, 1) * (this.count - 1));
    if (i === this.target) return;
    this.direction = i > this.target ? 1 : -1;
    this.target = i;
    this.dirty = true;
    this._schedule();
  }

  /**
   * Finestra di decode: più frame avanti nella direzione di scroll che dietro,
   * ordinata per priorità. Ha esattamente `cacheSize` elementi: la stessa finestra
   * decide cosa decodificare e cosa espellere, così i due non si contraddicono.
   */
  _window() {
    const { cacheSize } = this.opts;
    const ahead = Math.round(cacheSize * 0.6);
    const behind = cacheSize - ahead - 1;
    const list = [this.target];
    for (let d = 1; d <= ahead; d++) {
      list.push(this.target + d * this.direction);
      if (d <= behind) list.push(this.target - d * this.direction);
    }
    return list;
  }

  /**
   * Sezione lontana: libera tutte le bitmap (restano i blob compressi).
   * Il canvas conserva i pixel dell'ultimo frame, quindi al ritorno non c'è un lampo nero.
   */
  sleep() {
    if (this.asleep) return;
    this.asleep = true;
    // chiudere ~200 MB di bitmap in un solo frame costa 40–60 ms: 3 per frame, fuori dal percorso critico
    const release = () => {
      if (!this.asleep) return gsap.ticker.remove(release); // risvegliata nel frattempo: si tiene il resto
      let n = 0;
      for (const [i, bmp] of this.cache) {
        bmp.close();
        this.cache.delete(i);
        this.stats.evicted++;
        if (++n === 3) break;
      }
      if (!this.cache.size) gsap.ticker.remove(release);
    };
    gsap.ticker.add(release);
  }

  wake() {
    if (!this.asleep) return;
    this.asleep = false;
    this.dirty = true;
    this._schedule();
  }

  _schedule() {
    if (this.disposed || this.asleep || !this.count) return;
    const { decodeConcurrency } = this.opts;
    if (this.decoding.size >= decodeConcurrency) return;

    for (const i of this._window()) {
      if (this.decoding.size >= decodeConcurrency) break;
      if (i < 0 || i >= this.count) continue;
      if (!this.blobs[i] || this.cache.has(i) || this.decoding.has(i)) continue;
      this._decode(i);
    }
  }

  async _decode(i) {
    if (this.cache.has(i) || this.decoding.has(i) || !this.blobs[i]) return;
    this.decoding.add(i);
    try {
      const bmp = await createImageBitmap(this.blobs[i]);
      this.stats.decoded++;
      // arrivato troppo tardi: lo scroll è andato altrove
      if (this.disposed || this.asleep || (i !== this.target && !this._window().includes(i))) {
        bmp.close();
      } else {
        this.cache.set(i, bmp);
        this._evict();
        this.stats.peakBitmaps = Math.max(this.stats.peakBitmaps, this.cache.size);
        if (i === this.target || this.drawnIndex !== this.target) this.dirty = true;
      }
    } catch (err) {
      // blob corrotto: ignorato
    } finally {
      this.decoding.delete(i);
      this._schedule();
    }
  }

  /**
   * Espelle solo frame fuori dalla finestra corrente (il più lontano per primo).
   * Il frame a schermo non si tocca mai: nel caso peggiore la cache è cacheSize + 1.
   */
  _evict() {
    if (this.cache.size <= this.opts.cacheSize) return;
    const keep = new Set(this._window());
    while (this.cache.size > this.opts.cacheSize) {
      let far = -1;
      let farDist = -1;
      for (const k of this.cache.keys()) {
        if (k === this.drawnIndex || keep.has(k)) continue;
        const d = Math.abs(k - this.target);
        if (d > farDist) (farDist = d), (far = k);
      }
      if (far < 0) return;
      this.cache.get(far).close();
      this.cache.delete(far);
      this.stats.evicted++;
    }
  }

  _nearest(i) {
    if (this.cache.has(i)) return i;
    let best = -1;
    let bestDist = Infinity;
    for (const k of this.cache.keys()) {
      const d = Math.abs(k - i);
      if (d < bestDist) (bestDist = d), (best = k);
    }
    return best;
  }

  _tick() {
    if (!this.dirty || this.disposed || this.asleep) return;
    const i = this._nearest(this.target);
    if (i < 0) return;
    this._draw(i);
    // se abbiamo disegnato un sostituto, riprova al prossimo frame
    this.dirty = i !== this.target;
  }

  _draw(i) {
    const bmp = this.cache.get(i);
    if (!bmp) return;
    const { ctx, canvas, fit } = this;
    if (fit.letterbox) {
      ctx.fillStyle = this.opts.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bmp, fit.x, fit.y, fit.w, fit.h);
    // in letterbox sfuma i bordi del video nel colore di fondo, niente stacchi netti
    if (fit.letterbox) {
      for (const g of fit.edges) {
        ctx.fillStyle = g.gradient;
        ctx.fillRect(g.x, g.y, g.w, g.h);
      }
    }
    this.drawnIndex = i;
  }

  resize() {
    const { canvas } = this;
    const cw = Math.round(canvas.clientWidth * env.dpr);
    const ch = Math.round(canvas.clientHeight * env.dpr);
    if (!cw || !ch) return;
    // su touch ignora i piccoli cambi di altezza dovuti alla barra dell'indirizzo
    if (env.isTouch && canvas.width === cw && Math.abs(canvas.height - ch) < 160 * env.dpr) return;
    canvas.width = cw;
    canvas.height = ch;

    const iw = this.manifest.width;
    const ih = this.manifest.height;
    const cover = Math.max(cw / iw, ch / ih);
    const portrait = cw / ch < 1;
    const scale = portrait ? Math.min(cover, (cw * this.opts.portraitZoom) / iw) : cover;
    const w = iw * scale;
    const h = ih * scale;
    const x = (cw - w) / 2;
    const y = (ch - h) * (portrait ? this.opts.focusY : 0.5);
    const letterbox = h < ch - 1 || w < cw - 1;
    const edges = [];
    if (letterbox) {
      const bg = this.opts.background;
      const band = h * 0.22;
      const top = this.ctx.createLinearGradient(0, y, 0, y + band);
      top.addColorStop(0, bg);
      top.addColorStop(1, hexToRgba(bg, 0));
      const bottom = this.ctx.createLinearGradient(0, y + h - band, 0, y + h);
      bottom.addColorStop(0, hexToRgba(bg, 0));
      bottom.addColorStop(1, bg);
      edges.push({ gradient: top, x: 0, y: y - 1, w: cw, h: band + 1 });
      edges.push({ gradient: bottom, x: 0, y: y + h - band, w: cw, h: band + 1 });
    }
    this.fit = { w, h, x, y, letterbox, edges };
    this.dirty = true;
    this.drawnIndex = -1;
  }

  getStats() {
    return { ...this.stats, bitmaps: this.cache.size, blobs: this.blobs.filter(Boolean).length, target: this.target };
  }

  dispose() {
    this.disposed = true;
    gsap.ticker.remove(this._tick);
    window.removeEventListener('resize', this._onResize);
    this.cache.forEach((b) => b.close());
    this.cache.clear();
    this.blobs = [];
  }
}

/** Primi `critical` frame in fila, poi raffinamento: ogni 8°, 4°, 2°, resto. */
function progressiveOrder(count, critical) {
  const seen = new Set();
  const order = [];
  const push = (i) => {
    if (i < count && !seen.has(i)) seen.add(i), order.push(i);
  };
  for (let i = 0; i < Math.min(critical, count); i++) push(i);
  for (const step of [8, 4, 2, 1]) for (let i = 0; i < count; i += step) push(i);
  push(count - 1);
  return order;
}

