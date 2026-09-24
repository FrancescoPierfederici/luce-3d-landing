import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import gsap from 'gsap';
import { env } from '../core/env.js';

/**
 * Unico renderer WebGL del sito, su un canvas fixed a tutto schermo.
 * Le sezioni 3D (bottiglia, finale) lo attivano quando sono in vista;
 * quando nessuna è attiva il render si ferma e il canvas si nasconde.
 */
export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.quality = env.isMobile ? 'low' : 'high';
    // risoluzione adattiva: il vetro con transmission è limitato dal fill-rate.
    // Si parte prudenti (max 1.5) e il governor sale fino a 2 o scende fino a 0.6×.
    this.maxDpr = Math.min(window.devicePixelRatio || 1, 2);
    this.minDpr = Math.max(0.6, this.maxDpr * 0.5);
    this.dpr = Math.min(this.maxDpr, 1.5);
    this.governor = { samples: [], cooldown: 0 };

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.maxDpr < 2,
      alpha: false,
      powerPreference: 'high-performance',
    });
    // GPU integrata: si parte da 1, così il primo secondo non gira a 30 fps mentre il governor si adatta
    // (su telefono si parte da 1 comunque: vetro con transmission e schermi densi)
    if (env.isMobile || isIntegratedGPU(this.renderer.getContext())) this.dpr = Math.min(this.dpr, 1);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(new THREE.Color('#0B0B0C'), 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    this.camera.position.set(0, 0, 7);

    // environment immediato e leggero; l'HDRI da studio lo sostituisce quando arriva
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.users = new Set(); // sezioni che chiedono il render
    this.frameCallbacks = new Set();
    this.needsRender = true;
    this.continuous = !env.reducedMotion;
    this.stats = { frames: 0 };

    this._tick = this._tick.bind(this);
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._onResize();
    gsap.ticker.add(this._tick);
  }

  async loadHDRI(url, { intensity = 1, rotationY = 0 } = {}) {
    if (this._hdriLoading) return this._hdriLoading;
    this._hdriLoading = (async () => {
      const tex = await new RGBELoader().setDataType(THREE.HalfFloatType).loadAsync(url);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envMap = pmrem.fromEquirectangular(tex).texture;
      tex.dispose();
      pmrem.dispose();
      this.scene.environment?.dispose();
      this.scene.environment = envMap;
      this.scene.environmentIntensity = intensity;
      this.scene.environmentRotation.set(0, rotationY, 0);
      this.invalidate();
    })();
    return this._hdriLoading;
  }

  /**
   * Precompila gli shader (in parallelo se il driver lo supporta) e fa un render a canvas nascosto:
   * così la prima attivazione non paga compilazione e allocazione del buffer di trasmissione.
   */
  async warmUp() {
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  /** Una sezione dichiara di essere (o non essere più) in vista. */
  setActive(user, active) {
    if (active) this.users.add(user);
    else this.users.delete(user);
    const visible = this.users.size > 0;
    // opacità, non visibility: il layer del canvas resta creato e la prima comparsa non paga
    // allocazione e compositing (misurato: un frame da ~50 ms all'ingresso della sezione)
    if (!visible) this.canvas.style.opacity = '0';
    else this.invalidate();
  }

  get active() {
    return this.users.size > 0;
  }

  onFrame(fn) {
    this.frameCallbacks.add(fn);
    return () => this.frameCallbacks.delete(fn);
  }

  invalidate() {
    this.needsRender = true;
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.resizeCallbacks?.forEach((fn) => fn(w, h));
    this.invalidate();
  }

  onResize(fn) {
    (this.resizeCallbacks ??= new Set()).add(fn);
    fn(this.width, this.height);
  }

  _tick(time, deltaMs) {
    if (!this.active) return;
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    this.frameCallbacks.forEach((fn) => fn(dt, time));
    if (!this.continuous && !this.needsRender) return;
    this.renderer.render(this.scene, this.camera);
    this.needsRender = false;
    this.stats.frames++;
    if (this.continuous) this._govern(deltaMs);
  }

  /**
   * Governor della risoluzione, a finestre di 45 frame (la prima di 15):
   *  - media > 18.5 ms (frame persi) → scende del 12–30%, e quel livello diventa il tetto
   *  - 3 finestre di fila a vsync (≤ 17.2 ms) → prova a salire del 10%, mai oltre il tetto
   * I delta > 100 ms (tab in background, finestra coperta) non contano.
   */
  _govern(deltaMs) {
    const g = this.governor;
    if (deltaMs > 100) return;
    if (g.cooldown > 0) {
      g.cooldown--;
      return;
    }
    g.samples.push(deltaMs);
    // la prima finestra è corta: se il dispositivo è lento lo scopriamo in ~0.5 s
    if (g.samples.length < (g.warm ? 45 : 15)) return;
    g.warm = true;
    const avg = g.samples.reduce((a, b) => a + b, 0) / g.samples.length;
    g.samples.length = 0;
    g.ceiling ??= this.maxDpr;

    let next = this.dpr;
    if (avg > 18.5) {
      g.ceiling = Math.min(g.ceiling, this.dpr * 0.99);
      // passo proporzionale: il costo scala con i pixel (dpr²), quindi √(16.7/avg)
      next = Math.max(this.minDpr, this.dpr * gsap.utils.clamp(0.7, 0.88, Math.sqrt(16.7 / avg)));
      g.good = 0;
    } else if (avg <= 17.2 && ++g.good >= 3) {
      next = Math.min(g.ceiling, this.dpr * 1.1);
      g.good = 0;
    }
    if (Math.abs(next - this.dpr) < 0.01) return;

    this.dpr = next;
    this.renderer.setPixelRatio(next);
    this.renderer.setSize(this.width, this.height, false);
    this.stats.dpr = +next.toFixed(2);
    g.cooldown = 20; // lascia assestare prima di misurare di nuovo
  }
}

function isIntegratedGPU(gl) {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  // niente "Apple GPU": sui Mac con chip M è una GPU potente
  return /intel|uhd|iris|mali|adreno|powervr|swiftshader|llvmpipe/i.test(name);
}

