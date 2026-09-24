import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Flacone LUCE costruito in codice. Proporzioni ricavate da assets/images/anchor.png:
 * corpo quasi quadrato (L:A ≈ 1.07), profondità ≈ metà della larghezza,
 * base di vetro spessa (~20% dell'altezza), tappo largo ~0.76 del corpo.
 * Scala: 1 unità ≈ 3,1 cm → corpo 5 × 4,7 × 2,8 cm; pareti 0.25 ≈ 8 mm
 * (la cavità risulta ~0.69 della larghezza, come nella foto).
 */
export const DIM = {
  W: 1.6, // larghezza corpo
  H: 1.5, // altezza corpo
  D: 0.9, // profondità corpo
  R: 0.09, // raggio spigoli
  wall: 0.25, // spessore pareti: 8 mm
  base: 0.32, // spessore del fondo
  headroom: 0.3, // aria sopra il liquido
  capW: 1.22,
  capH: 0.5,
  capD: 0.64,
};

export function createBottle({ quality = 'high' } = {}) {
  const hi = quality === 'high';
  const seg = hi ? 6 : 3;
  const { W, H, D, R, wall, base, headroom, capW, capH, capD } = DIM;

  const materials = {
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 1,
      // spessore ottico basso: rifrange ciò che sta subito dietro, non il buio ai lati
      thickness: 0.4,
      roughness: 0.02,
      ior: 1.5,
      dispersion: hi ? 0.7 : 0, // mobile: niente dispersion (3 campioni in meno)
      attenuationColor: new THREE.Color('#fff6e8'),
      attenuationDistance: 4,
      specularIntensity: 1,
      // riflessi dei softbox presenti ma non dominanti (da vicino, su mobile, coprivano il liquido)
      envMapIntensity: hi ? 1.3 : 1,
      // desktop: le facce interne finiscono nel buffer di trasmissione → spigoli più "pieni"
      side: hi ? THREE.DoubleSide : THREE.FrontSide,
    }),
    liquid: new THREE.MeshPhysicalMaterial({
      color: 0xffffff, // il colore vero arriva dai vertici (sfumatura verticale)
      vertexColors: true,
      roughness: 0.12,
      metalness: 0,
      // riflessi contenuti: con lo studio bianco i lati diventerebbero grigi
      clearcoat: 0.35,
      clearcoatRoughness: 0.08,
      emissive: new THREE.Color('#6b3406'),
      emissiveIntensity: 0.22,
      envMapIntensity: 0.45,
    }),
    tube: new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f3e6cf'),
      roughness: 0.35,
      emissive: new THREE.Color('#6b3a10'),
      emissiveIntensity: 0.25,
    }),
    brassPolished: new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#c59650'),
      metalness: 1,
      roughness: 0.16,
      envMapIntensity: 1.2,
    }),
    brassBrushed: new THREE.MeshPhysicalMaterial({
      // ottone più scuro: il metallo tinge i riflessi, un colore chiaro li lascia bianchi
      color: new THREE.Color('#a47a3a'),
      metalness: 1,
      roughness: 0.38,
      // spazzolatura verticale: riflessi stirati lungo l'asse
      anisotropy: hi ? 0.75 : 0,
      anisotropyRotation: Math.PI / 2,
      envMapIntensity: 0.95,
    }),
  };

  const group = new THREE.Group();
  group.name = 'bottle';
  const inner = new THREE.Group(); // centrato verticalmente sull'origine
  group.add(inner);
  const totalH = H + 0.22 + capH;
  inner.position.y = -totalH / 2;

  // Corpo in vetro
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, seg, R), materials.glass);
  body.position.y = H / 2;
  inner.add(body);

  // Spalla in vetro sotto la ghiera
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.06, hi ? 48 : 24), materials.glass);
  shoulder.position.y = H + 0.03;
  inner.add(shoulder);

  // Liquido: cavità con fondo arrotondato, opaco così viene rifratto dal vetro
  // (in three un materiale con transmission non vede altri materiali con transmission)
  const liqH = H - base - headroom;
  // raggio piccolo: superficie piatta che tocca le pareti, non un cuscino
  const liquidGeo = new RoundedBoxGeometry(W - wall * 2, liqH, D - wall * 2, seg, 0.07);
  paintVertical(liquidGeo, liqH, '#7a4210', '#d9a24c'); // fondo ambra scuro → superficie dorata
  const liquid = new THREE.Mesh(liquidGeo, materials.liquid);
  liquid.position.y = base + liqH / 2;
  inner.add(liquid);

  // Pescante: curva a S dalla ghiera all'angolo del fondo, appoggiato sulla faccia del liquido
  const zFront = (D - wall * 2) / 2 + 0.006;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.02, H - 0.02, 0),
    new THREE.Vector3(0.03, H - headroom, zFront * 0.7),
    new THREE.Vector3(0.0, base + liqH * 0.62, zFront),
    new THREE.Vector3(-0.24, base + liqH * 0.28, zFront),
    new THREE.Vector3(-(W / 2 - wall) + 0.08, base + 0.06, zFront * 0.9),
  ]);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, hi ? 64 : 24, 0.011, 8), materials.tube);
  inner.add(tube);

  // Ghiera in ottone lucido con filettatura
  const collarY = H + 0.06;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.16, hi ? 64 : 32), materials.brassPolished);
  collar.position.y = collarY + 0.08;
  inner.add(collar);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.238, 0.011, 8, hi ? 64 : 32), materials.brassPolished);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = collarY + 0.035 + i * 0.045;
    inner.add(ring);
  }

  // Tappo in ottone spazzolato
  const capY = H + 0.22 + capH / 2;
  const cap = new THREE.Mesh(new RoundedBoxGeometry(capW, capH, capD, seg, 0.035), materials.brassBrushed);
  cap.position.y = capY;
  inner.add(cap);

  // Punti d'ancoraggio dei callout (sull'asse: restano visibili mentre ruota)
  const anchors = {
    glass: new THREE.Object3D(),
    cap: new THREE.Object3D(),
    liquid: new THREE.Object3D(),
  };
  anchors.glass.position.set(-W * 0.36, base * 0.5, D * 0.5); // spigolo anteriore sinistro della base
  anchors.cap.position.set(0, capY + capH * 0.2, 0);
  anchors.liquid.position.set(0, base + liqH * 0.5, 0);
  Object.values(anchors).forEach((a) => inner.add(a));

  const dispose = () => {
    group.traverse((o) => o.geometry?.dispose());
    Object.values(materials).forEach((m) => m.dispose());
  };

  return { group, materials, anchors, height: totalH, dispose };
}

/** Colore per vertice da `bottom` a `top` lungo l'altezza (geometria centrata in y). */
function paintVertical(geo, height, bottom, top) {
  const a = new THREE.Color(bottom);
  const b = new THREE.Color(top);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / height + 0.5, 0, 1);
    c.lerpColors(a, b, Math.pow(t, 1.4));
    c.toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
