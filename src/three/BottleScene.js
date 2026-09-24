import * as THREE from 'three';
import { createBottle } from './Bottle.js';
import { damp, hexToRgba } from '../core/utils.js';
import { env } from '../core/env.js';

const TAU = Math.PI * 2;
const START_ANGLE = -0.55; // tre quarti, come nella foto di riferimento

/**
 * La bottiglia in scena. Tutto ciò che si muove passa per un damping:
 * scroll, mouse e trascinamento impostano solo i target.
 */
export class BottleScene {
  constructor(stage) {
    this.stage = stage;
    const { scene } = stage;

    this.root = new THREE.Group(); // segue la posizione della sezione nella pagina
    scene.add(this.root);

    this.backdrop = createBackdrop();
    this.backdrop.position.z = -4;
    this.root.add(this.backdrop);

    this.bottle = createBottle({ quality: stage.quality });
    this.pivot = new THREE.Group(); // inclinazione mouse
    this.pivot.add(this.bottle.group);
    this.root.add(this.pivot);

    this.shadow = createContactShadow();
    this.shadow.position.y = -this.bottle.height / 2 - 0.005;
    this.root.add(this.shadow);

    const key = new THREE.DirectionalLight('#ffb867', 2.4); // luce calda da sinistra, come nella foto
    key.position.set(-4, 2.5, 3);
    const rim = new THREE.DirectionalLight('#a9c6ff', 1.1);
    rim.position.set(3.5, 2, -4);
    scene.add(key, rim);

    // target (scritti da scroll / puntatore) e valori correnti (smorzati)
    this.target = { spin: 0, tiltX: 0, tiltZ: 0, yaw: 0, drag: 0 };
    this.current = { ...this.target };
    this.progress = 0;

    stage.onResize((w, h) => this.layout(w, h));
  }

  /**
   * Inquadrature: 'showcase' (sezione bottiglia) e 'finale' (più piccola e più alta, sotto c'è la CTA).
   * I due fondali sono dipinti e caricati in anticipo: cambiare modalità è solo uno scambio di riferimenti
   * (ridisegnare una texture 1024² nel frame del cambio costava ~50 ms).
   */
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    const palette = PALETTES[mode];
    this.stage.renderer.setClearColor(palette.bg, 1);
    this.backdrop.material.map = this.backdrop.userData.textures[mode];
    const glass = this.bottle.materials.glass;
    const g = GLASS[mode];
    glass.userData.envDefault ??= glass.envMapIntensity;
    glass.envMapIntensity = g.envMapIntensity ?? glass.userData.envDefault;
    glass.attenuationColor.set(g.attenuationColor);
    glass.attenuationDistance = g.attenuationDistance;
    this.applyFrame();
  }

  /** Carica sulla GPU le texture di entrambi i fondali (da chiamare a pagina ferma). */
  prepare() {
    Object.values(this.backdrop.userData.textures).forEach((t) => this.stage.renderer.initTexture(t));
  }

  /** Calcola l'inquadratura di una modalità, senza applicarla. */
  frameFor(mode, w, h) {
    const FRAMING = {
      showcase: { desktop: { h: 0.6, w: 0.42, y: 0 }, portrait: { h: 0.42, w: 0.74, y: 0.13 } },
      // tilt: la camera guarda un po' dall'alto, così su avorio l'ombra di contatto è un'ellisse e non una riga
      finale: { desktop: { h: 0.44, w: 0.32, y: 0.09, tilt: 0.14 }, portrait: { h: 0.34, w: 0.6, y: 0.15, tilt: 0.14 } },
    };
    const aspect = w / h;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.stage.camera.fov / 2));
    const bottleW = 1.9; // diagonale in pianta: la larghezza massima durante la rotazione
    const f = FRAMING[mode][aspect < 0.9 ? 'portrait' : 'desktop'];

    const visH = Math.max(this.bottle.height / f.h, bottleW / f.w / aspect);
    const distance = visH / 2 / tanHalf;
    const tilt = f.tilt ?? 0;
    const cy = Math.sin(tilt) * distance;
    const cz = Math.cos(tilt) * distance;
    // il fondale copre il viewport alla sua profondità, con margine per lo scorrimento
    const atDepth = (visH * (distance + 4)) / distance;
    const sx = (atDepth * Math.max(aspect, 1) * 1.6) / 10;
    const sy = (atDepth * 1.6) / 10;
    // dove la retta camera → base della bottiglia incontra il fondale (z = -4): lì va la linea d'orizzonte
    const by = -this.bottle.height / 2;
    const horizonY = cy + (by - cy) * ((cz + 4) / cz);
    return {
      distance, cy, cz, sx, sy,
      worldPerPx: visH / h,
      baseY: visH * f.y, // su mobile la bottiglia sta nella metà alta, i testi sotto
      bandV: 0.5 - horizonY / (10 * sy),
      aspect: sx / sy,
    };
  }

  /** Al resize: ricalcola entrambe le inquadrature e ridipinge i due fondali. */
  layout(w, h) {
    this.frames = { showcase: this.frameFor('showcase', w, h), finale: this.frameFor('finale', w, h) };
    for (const [mode, fr] of Object.entries(this.frames)) {
      this.backdrop.userData.paint(mode, { bandV: fr.bandV, aspect: fr.aspect });
    }
    this.applyFrame();
  }

  applyFrame() {
    const fr = this.frames[this.mode ?? 'showcase'];
    const cam = this.stage.camera;
    this.distance = fr.distance;
    cam.position.set(0, fr.cy, fr.cz);
    cam.lookAt(0, 0, 0);
    this.worldPerPx = fr.worldPerPx;
    this.baseY = fr.baseY;
    this.backdrop.scale.set(fr.sx, fr.sy, 1);
    this.stage.invalidate();
  }

  setProgress(p) {
    this.progress = p;
    // un giro completo durante il pin
    this.target.spin = p * TAU;
  }

  setSpin(radians) {
    this.target.spin = radians;
  }

  /** Coordinate del puntatore normalizzate in -1..1 */
  setPointer(nx, ny) {
    this.target.tiltX = ny * 0.16;
    this.target.tiltZ = -nx * 0.08;
    this.target.yaw = nx * 0.28;
  }

  addDrag(dxPx) {
    this.target.drag += dxPx * 0.009;
  }

  /** sectionTop: posizione della sezione nel viewport, così il 3D scorre con lei */
  update(dt, sectionTop) {
    const t = this.target;
    const c = this.current;
    const e = env.reducedMotion ? 1 : 0.075;
    c.spin = damp(c.spin, t.spin, e, dt);
    c.drag = damp(c.drag, t.drag, 0.09, dt);
    c.tiltX = damp(c.tiltX, t.tiltX, 0.06, dt);
    c.tiltZ = damp(c.tiltZ, t.tiltZ, 0.06, dt);
    c.yaw = damp(c.yaw, t.yaw, 0.06, dt);

    this.bottle.group.rotation.y = START_ANGLE + c.spin + c.drag + c.yaw;
    this.pivot.rotation.x = c.tiltX;
    this.pivot.rotation.z = c.tiltZ;
    // sezione più in basso sullo schermo (top > 0) → bottiglia più in basso (y del mondo < 0)
    this.root.position.y = this.baseY - sectionTop * this.worldPerPx;

    // un filo di galleggiamento: la bottiglia non è mai perfettamente ferma
    if (!env.reducedMotion) this.pivot.position.y = Math.sin(performance.now() * 0.0009) * 0.025;
  }

  /** Posizione a schermo (px CSS) di un punto d'ancoraggio */
  project(name, out = { x: 0, y: 0 }) {
    const v = (this._v ??= new THREE.Vector3());
    const a = this.bottle.anchors[name];
    a.updateWorldMatrix(true, false);
    v.setFromMatrixPosition(a.matrixWorld).project(this.stage.camera);
    out.x = (v.x + 1) * 0.5 * this.stage.width;
    out.y = (1 - v.y) * 0.5 * this.stage.height;
    return out;
  }
}

/** Palette del fondale per inquadratura: il bordo coincide sempre con lo sfondo della pagina. */
const PALETTES = {
  showcase: { bg: '#0B0B0C', glow: 0.85, band: 0.75, bandRGB: '255, 190, 110' },
  // l'alba: bagliore dosato e un orizzonte bruno (il "tavolo"), che dà al vetro qualcosa di scuro da rifrangere
  finale: { bg: '#F5EFE6', glow: 0.55, band: 0.55, bandRGB: '120, 72, 30' },
};

/** Il vetro cambia un po' con la luce: su avorio meno riflessi bianchi e più colore in profondità. */
const GLASS = {
  showcase: { envMapIntensity: null, attenuationColor: '#fff6e8', attenuationDistance: 4 },
  finale: { envMapIntensity: 0.7, attenuationColor: '#e9c48c', attenuationDistance: 1.4 },
};


/**
 * Fondale: bagliore ambra dietro la bottiglia + una linea d'orizzonte calda
 * all'altezza della base. È ciò che il vetro rifrange: senza, la base spessa diventa nera.
 */
function createBackdrop() {
  const size = 1024;
  const layers = {};
  for (const mode of Object.keys(PALETTES)) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    layers[mode] = { g: c.getContext('2d'), tex };
  }

  const paint = (mode, { bandV = 0.62, aspect = 1 } = {}) => {
    const { g, tex } = layers[mode];
    const palette = PALETTES[mode];
    const clear = hexToRgba(palette.bg, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = palette.bg;
    g.fillRect(0, 0, size, size);

    // bagliore: cerchio nello spazio del mondo (la texture è stirata di `aspect` in orizzontale)
    g.setTransform(1 / aspect, 0, 0, 1, (size * (1 - 1 / aspect)) / 2, 0);
    const glow = g.createRadialGradient(size * 0.47, size * 0.46, 0, size * 0.5, size * 0.5, size * 0.3);
    glow.addColorStop(0, `rgba(250, 196, 118, ${palette.glow})`);
    glow.addColorStop(0.45, `rgba(176, 104, 38, ${palette.glow * 0.35})`);
    glow.addColorStop(1, clear);
    g.fillStyle = glow;
    g.fillRect(0, 0, size, size);

    // orizzonte: fascia sottile, più intensa a sinistra (la luce della foto viene da lì)
    const y = bandV * size;
    g.setTransform(1, 0, 0, 0.06, 0, y * (1 - 0.06));
    const band = g.createRadialGradient(size * 0.44, y, 0, size * 0.5, y, size * 0.34);
    band.addColorStop(0, `rgba(${palette.bandRGB}, ${palette.band})`);
    band.addColorStop(0.5, `rgba(190, 110, 40, ${palette.band * 0.37})`);
    band.addColorStop(1, clear);
    g.fillStyle = band;
    g.fillRect(0, y - size, size, size * 2); // in coordinate locali: copre ±(0.06·size) attorno a y
    tex.needsUpdate = true;
  };

  const textures = Object.fromEntries(Object.entries(layers).map(([m, l]) => [m, l.tex]));
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    // toneMapped false: i bordi devono coincidere esattamente con il colore della pagina
    new THREE.MeshBasicMaterial({ map: textures.showcase, toneMapped: false, depthWrite: false }),
  );
  mesh.name = 'backdrop';
  mesh.userData = { paint, textures };
  return mesh;
}

/** Ombra di contatto morbida: fa "appoggiare" la bottiglia su un piano invisibile. */
function createContactShadow() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.6),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
