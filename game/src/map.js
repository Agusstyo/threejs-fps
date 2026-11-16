// The Ashworks Yard: an original dusk smelting yard. Ember Squad spawns south,
// the Warden Line north. Site A is the furnace hall in the west, Site B the
// container depot in the east; mid is an open yard crossed by a catwalk.
// Three lanes (west hall, mid, east alley) plus north and centre connectors
// give the waypoint graph its routes. Every solid is an AABB collider and a
// scaled unit-box mesh sharing one geometry and a handful of materials.
import * as THREE from 'three';
import { makeTextures } from './textures.js';
import { losClear } from './physics.js';

export function buildMap(scene) {
  const tex = makeTextures();
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const mats = {
    concrete: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.95 }),
    darkMetal: new THREE.MeshStandardMaterial({ map: tex.darkMetal, roughness: 0.7, metalness: 0.35 }),
    crate: new THREE.MeshStandardMaterial({ map: tex.crate, roughness: 0.9 }),
    hazard: new THREE.MeshStandardMaterial({ map: tex.hazard, roughness: 0.8 }),
    rust: new THREE.MeshStandardMaterial({ map: tex.containerRust, roughness: 0.75, metalness: 0.25 }),
    teal: new THREE.MeshStandardMaterial({ map: tex.containerTeal, roughness: 0.75, metalness: 0.25 }),
    ochre: new THREE.MeshStandardMaterial({ map: tex.containerOchre, roughness: 0.75, metalness: 0.25 }),
    emberGlow: new THREE.MeshStandardMaterial({ color: 0x2a1a12, emissive: 0xff6a22, emissiveIntensity: 1.6, roughness: 0.6 }),
    lampGlow: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd9a0, emissiveIntensity: 2.2 }),
  };
  const colliders = [];
  const group = new THREE.Group();

  // x,z = centre; w,d = footprint; h = height from y0.
  function box(x, z, w, d, h, mat, y0 = 0, collide = true) {
    const m = new THREE.Mesh(unitBox, mat);
    m.position.set(x, y0 + h / 2, z);
    m.scale.set(w, h, d);
    m.castShadow = h > 0.8;
    m.receiveShadow = true;
    group.add(m);
    if (collide) colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, y1: y0 + h });
    return m;
  }

  // ---- ground, sky, light ----
  colliders.push({ x0: -60, x1: 60, z0: -60, z1: 60, y0: -1, y1: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 1 }));
  tex.asphalt.repeat.set(10, 10);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 16, 12),
    new THREE.MeshBasicMaterial({ map: tex.sky, side: THREE.BackSide, fog: false }));
  group.add(sky);
  scene.fog = new THREE.Fog(0x584a3c, 34, 110);
  scene.background = new THREE.Color(0x2b3442);

  const sun = new THREE.DirectionalLight(0xffb37a, 2.4);
  sun.position.set(-38, 17, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -46; sun.shadow.camera.right = 46;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 130; sun.shadow.bias = -0.0006;
  group.add(sun);
  group.add(new THREE.HemisphereLight(0x8fa3c7, 0x4a3a2c, 0.98));

  // ---- perimeter ----
  box(0, -26.5, 70, 1, 5.5, mats.darkMetal); box(0, 26.5, 70, 1, 5.5, mats.darkMetal);
  box(-34.5, 0, 1, 54, 5.5, mats.darkMetal); box(34.5, 0, 1, 54, 5.5, mats.darkMetal);

  // ---- Furnace Hall (Site A), centre (-22,-8) ----
  box(-30.5, -8, 1, 15, 4.6, mats.concrete);                    // west wall
  box(-22, -15.5, 18, 1, 4.6, mats.concrete);                   // north wall
  box(-26.5, -0.5, 8, 1, 4.6, mats.concrete);                   // south wall west of door
  box(-16.5, -0.5, 5, 1, 4.6, mats.concrete);                   // south wall east of door (door x -22.5..-19)
  box(-13.5, -11.5, 1, 7, 4.6, mats.concrete);                  // east wall north of door
  box(-13.5, -1.8, 1, 2.6, 4.6, mats.concrete);                 // east wall south of door (door z -4.6..-3.2... widened below)
  box(-22, -12.5, 17, 6, 0.3, mats.darkMetal, 4.4, false);      // partial roof, shade only
  const furnace = box(-22, -9, 5.5, 3.4, 3.1, mats.darkMetal); // the furnace block
  box(-22, -9, 4.6, 2.6, 0.35, mats.emberGlow, 3.1, false);     // glowing furnace mouth deck
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 5.5, 10), mats.rust);
  chimney.position.set(-23.5, 5.8, -10); chimney.castShadow = true; group.add(chimney);
  colliders.push({ x0: -24.4, x1: -22.6, z0: -10.9, z1: -9.1, y0: 3.1, y1: 8.6 });
  box(-27.5, -6, 1.4, 1.4, 1.2, mats.crate);                     // hall cover crates
  box(-17, -12, 1.4, 1.4, 1.2, mats.crate);
  box(-18.5, -5.5, 2.6, 1.3, 1.25, mats.darkMetal);              // workbench cover

  // ---- Container Depot (Site B), centre (23,-7) ----
  box(17.5, -13, 6.4, 2.6, 2.6, mats.rust);                     // container row north
  box(17.5, -13, 6.4, 2.6, 2.6, mats.ochre, 2.6);               // stacked second level
  box(28.5, -12, 2.6, 6.4, 2.6, mats.teal);
  box(29, -1, 6.4, 2.6, 2.6, mats.rust);
  box(19, 0.5, 2.6, 5.2, 2.6, mats.teal);
  box(24.5, -6.5, 1.4, 1.4, 1.2, mats.crate);                   // site cover
  box(21, -10.5, 1.4, 1.4, 1.2, mats.crate);
  box(26, -3.5, 2.8, 1.4, 1.25, mats.darkMetal);
  // crate steps up to a low perch west of B
  box(13.5, -9, 1.3, 1.3, 0.6, mats.crate);
  box(14.8, -9, 1.3, 1.3, 1.25, mats.crate);
  box(16.1, -9, 2.2, 2.2, 1.9, mats.crate);

  // ---- Mid yard and catwalk ----
  box(-6, 4, 2.8, 1.4, 1.25, mats.darkMetal);                   // mid cover
  box(5, -1, 1.4, 1.4, 1.2, mats.crate);
  box(-2, -8, 1.4, 2.8, 1.2, mats.crate);
  box(7, 8, 2.8, 1.4, 1.25, mats.hazard);                       // striped barrier
  box(-9, 12, 1.4, 1.4, 1.2, mats.crate);
  box(0, -2, 22, 3, 0.3, mats.darkMetal, 2.5);                  // catwalk deck
  box(-10.5, -2, 0.5, 2.6, 2.5, mats.darkMetal);                // pillars
  box(10.5, -2, 0.5, 2.6, 2.5, mats.darkMetal);
  box(0, -2, 0.5, 2.6, 2.5, mats.darkMetal);
  box(0, -3.6, 22, 0.18, 0.9, mats.hazard, 2.8);                // railings
  box(0, -0.4, 22, 0.18, 0.9, mats.hazard, 2.8);
  for (let i = 0; i < 5; i++) {                                 // stairs, both ends
    box(-11.5 - i, -2, 1, 3, 0.5 * (5 - i), mats.concrete);
    box(11.5 + i, -2, 1, 3, 0.5 * (5 - i), mats.concrete);
  }

  // ---- lanes: cover and chicanes ----
  box(-17, 9, 1.4, 2.8, 1.2, mats.crate);                       // west lane
  box(-24, 12, 2.8, 1.4, 1.25, mats.darkMetal);
  box(-19, 19, 1.4, 1.4, 1.2, mats.crate);
  box(16, 10, 2.6, 6, 2.6, mats.teal);                          // east alley container wall
  box(24, 14, 1.4, 1.4, 1.2, mats.crate);
  box(27, 7, 1.4, 2.8, 1.2, mats.crate);
  box(-8, -18, 6, 2.6, 2.6, mats.ochre);                        // north connector cover
  box(9, -18, 1.4, 1.4, 1.2, mats.crate);
  box(-4, 20, 1.4, 1.4, 1.2, mats.crate);                       // spawn-yard cover
  box(6, 17, 2.8, 1.4, 1.25, mats.darkMetal);

  // ---- lamps (visual + real point lights, kept few for frame rate) ----
  const lampAt = (x, z, color, intensity) => {
    box(x, z, 0.25, 0.25, 4.4, mats.darkMetal, 0, false);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mats.lampGlow);
    bulb.position.set(x, 4.5, z); group.add(bulb);
    const l = new THREE.PointLight(color, intensity, 26, 1.6);
    l.position.set(x, 4.4, z); group.add(l);
  };
  lampAt(-22, -2, 0xff8c42, 60);
  lampAt(23, -14, 0x9fd8ff, 45);
  lampAt(0, 6, 0xffd9a0, 40);
  lampAt(13, -16.5, 0x9fd8ff, 38);

  // ---- dressing: barrels, slag, pipes, lit windows, slicks ----
  const barrelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.95, 12);
  const barrel = (x, z, mat) => {
    const m = new THREE.Mesh(barrelGeo, mat);
    m.position.set(x, 0.475, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    colliders.push({ x0: x - 0.34, x1: x + 0.34, z0: z - 0.34, z1: z + 0.34, y0: 0, y1: 0.95 });
  };
  barrel(-6.5, -13.5, mats.rust); barrel(-5.7, -12.8, mats.darkMetal); barrel(-6.2, -12.2, mats.rust);
  barrel(12, 16.5, mats.ochre); barrel(12.8, 15.9, mats.rust);
  barrel(-28, 3, mats.teal); barrel(31, -16, mats.darkMetal);
  barrel(8, -13, mats.ochre);
  // a channel of molten slag runs from the furnace toward the hall door,
  // sharing the furnace material so the flicker animation drives both
  box(-22, -5.8, 0.55, 4.6, 0.07, mats.emberGlow, 0, false);
  const slagPool = new THREE.Mesh(new THREE.CircleGeometry(1.15, 18), mats.emberGlow);
  slagPool.rotation.x = -Math.PI / 2; slagPool.position.set(-22, 0.045, -3.0);
  group.add(slagPool);
  // steam pipes run the length of the hall's north wall, up out of the way
  const pipeGeo = new THREE.CylinderGeometry(0.09, 0.09, 16, 8);
  for (const [py, r] of [[3.6, 0.09], [3.28, 0.06]]) {
    const pipe = new THREE.Mesh(r === 0.09 ? pipeGeo : new THREE.CylinderGeometry(r, r, 16, 8), mats.darkMetal);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(-22, py, -14.85);
    pipe.castShadow = true;
    group.add(pipe);
  }
  // lit windows high on the perimeter's north wall
  for (const wx of [-18, -6, 6, 18]) box(wx, -25.92, 3.2, 0.14, 0.55, mats.lampGlow, 3.6, false);
  // dark oil slicks that catch the light
  const slickMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.16, metalness: 0.55 });
  for (const [sx, sz, sr] of [[4, 12, 2.2], [-11, -13, 1.7], [26, 10, 2.4], [-3, -19, 1.5]]) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(sr, 16), slickMat);
    s.rotation.x = -Math.PI / 2; s.position.set(sx, 0.015, sz);
    s.receiveShadow = true;
    group.add(s);
  }
  // a second, shorter chimney over the hall roof
  const chimney2 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 4.2, 10), mats.darkMetal);
  chimney2.position.set(-19, 5.2, -12); chimney2.castShadow = true; group.add(chimney2);
  colliders.push({ x0: -19.8, x1: -18.2, z0: -12.8, z1: -11.2, y0: 3.1, y1: 7.3 });
  // one crate left askew on the depot perch stack
  const askew = new THREE.Mesh(unitBox, mats.crate);
  askew.scale.set(1.3, 1.3, 1.3);
  askew.position.set(16.1, 2.55, -9);
  askew.rotation.set(0.05, 0.4, 0.15);
  askew.castShadow = true;
  group.add(askew);

  // ---- site decals ----
  const decal = (texSite, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({ map: texSite, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z);
    group.add(m);
  };
  decal(tex.siteA, -22, -8);
  decal(tex.siteB, 23, -7);

  scene.add(group);

  // ---- gameplay data ----
  const sites = {
    A: { name: 'Furnace Hall', x: -22, z: -8, r: 6.5 },
    B: { name: 'Depot', x: 23, z: -7, r: 6.5 },
  };
  const spawns = {
    atk: [{ x: 0, z: 22 }, { x: -3.5, z: 23 }, { x: 3.5, z: 23 }, { x: 0, z: 24.5 }],
    def: [{ x: -2, z: -22 }, { x: 2, z: -22 }, { x: -5.5, z: -20.5 }, { x: 5.5, z: -20.5 }],
  };
  const nodes = [
    [0, 20], [-8, 15], [8, 15], [-16, 11], [13, 12], [-22, 5], [-21, 1.5], [-22, -4.2],
    [-16, -4], [-22, -14], [-22, -19], [-12.5, -16], [0, 10], [0, 3], [-4, -7], [5, -6],
    [0, -13], [0, -19], [11, -16], [20, -15], [23, -7], [24.5, 1.5], [20, 4], [14, -4],
    [-13, 3], [12, 6], [-6, -16], [7, -11], [24, -16], [-27, -3], [29, -6],
  ].map(([x, z]) => ({ x, z }));
  // Edges join nodes that are close and can see each other at knee height:
  // the graph follows the lanes the geometry leaves open.
  const edges = nodes.map(() => []);
  const va = new THREE.Vector3(), vb = new THREE.Vector3();
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x, dz = nodes[i].z - nodes[j].z;
      if (dx * dx + dz * dz > 15.5 * 15.5) continue;
      va.set(nodes[i].x, 1.0, nodes[i].z); vb.set(nodes[j].x, 1.0, nodes[j].z);
      if (losClear({ colliders }, va, vb)) { edges[i].push(j); edges[j].push(i); }
    }
  }
  const posts = {
    A: [{ x: -27, z: -12.5, face: -2.15 }, { x: -17.5, z: -13, face: 2.87 }, { x: -15.5, z: -3.4, face: -1.49 }],
    B: [{ x: 27.5, z: -11, face: 2.06 }, { x: 18.5, z: -15.5, face: -2.65 }, { x: 26.5, z: 1.5, face: 0.32 }],
    mid: [{ x: -3.5, z: -10, face: -2.9 }, { x: 5.5, z: -9, face: 2.68 }],
  };
  return { colliders, sites, spawns, nodes, edges, posts,
           dynamics: { furnaceMat: mats.emberGlow, smokeAt: new THREE.Vector3(-23.5, 8.6, -10) } };
}

// Breadth-first path over the waypoint graph; returns node indices or [].
export function findPath(world, fromIdx, toIdx) {
  if (fromIdx === toIdx) return [fromIdx];
  const prev = new Array(world.nodes.length).fill(-1);
  const queue = [fromIdx]; prev[fromIdx] = fromIdx;
  while (queue.length) {
    const cur = queue.shift();
    for (const n of world.edges[cur]) {
      if (prev[n] === -1) { prev[n] = cur; queue.push(n); }
    }
    if (prev[toIdx] !== -1) break;
  }
  if (prev[toIdx] === -1) return [];
  const path = [toIdx];
  while (path[0] !== fromIdx) path.unshift(prev[path[0]]);
  return path;
}

export function nearestNode(world, x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < world.nodes.length; i++) {
    const d = (world.nodes[i].x - x) ** 2 + (world.nodes[i].z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
