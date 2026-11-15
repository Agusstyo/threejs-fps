// Pooled visual effects: nothing here allocates in the hot loop. Tracers,
// muzzle flashes, impact puffs and explosion flashes all recycle fixed pools;
// the furnace smoke is one Points cloud whose particles cycle forever.
import * as THREE from 'three';

function glowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

let scene, camera;
let tracers, puffs, flashes, boom, smoke, smokePos;
let muzzleLight, boomLight;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

function pool(n, make) {
  const items = [];
  for (let i = 0; i < n; i++) { const it = make(); it.ttl = 0; items.push(it); }
  return { items, next: 0, take() { const it = this.items[this.next]; this.next = (this.next + 1) % this.items.length; return it; } };
}

export function initFx(s, cam) {
  scene = s; camera = cam;
  const softTex = glowTexture('rgba(255,220,170,1)', 'rgba(255,140,50,0)');
  const dustTex = glowTexture('rgba(200,190,175,0.85)', 'rgba(200,190,175,0)');

  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffc37a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
  tracers = pool(28, () => { const m = new THREE.Mesh(tracerGeo, tracerMat.clone()); m.visible = false; scene.add(m); return { m, ttl: 0 }; });

  const puffMat = () => new THREE.SpriteMaterial({ map: dustTex, transparent: true, opacity: 0, depthWrite: false });
  puffs = pool(36, () => { const m = new THREE.Sprite(puffMat()); m.visible = false; scene.add(m); return { m, ttl: 0, max: 0.35, grow: 1 }; });

  const flashMat = () => new THREE.SpriteMaterial({ map: softTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  flashes = pool(10, () => { const m = new THREE.Sprite(flashMat()); m.visible = false; scene.add(m); return { m, ttl: 0, max: 0.06 }; });
  muzzleLight = new THREE.PointLight(0xffa050, 0, 13, 1.8); scene.add(muzzleLight);

  boom = pool(3, () => { const m = new THREE.Sprite(flashMat()); m.visible = false; scene.add(m); return { m, ttl: 0, max: 0.5 }; });
  boomLight = new THREE.PointLight(0xff8040, 0, 30, 1.5); scene.add(boomLight);

  // Furnace smoke: particles rise, swell and loop.
  const N = 42;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: dustTex, size: 5.5, transparent: true, opacity: 0.16, depthWrite: false, color: 0x9a938c, sizeAttenuation: true });
  smoke = new THREE.Points(geo, mat);
  smoke.frustumCulled = false;
  smokePos = pos;
  scene.add(smoke);
}

export function fxTracer(from, to) {
  const it = tracers.take();
  _v1.addVectors(from, to).multiplyScalar(0.5);
  it.m.position.copy(_v1);
  it.m.lookAt(to);
  it.m.scale.set(1, 1, from.distanceTo(to));
  it.m.material.opacity = 0.85;
  it.m.visible = true;
  it.ttl = 0.055;
}

export function fxImpact(p, big = false) {
  const it = puffs.take();
  it.m.position.copy(p);
  const s = big ? 1.5 : 0.45 + Math.random() * 0.3;
  it.m.scale.set(s, s, 1);
  it.grow = big ? 6 : 2.2;
  it.max = big ? 0.6 : 0.32;
  it.m.material.opacity = big ? 0.9 : 0.65;
  it.m.visible = true;
  it.ttl = it.max;
}

export function fxMuzzle(p) {
  const it = flashes.take();
  it.m.position.copy(p);
  const s = 0.5 + Math.random() * 0.35;
  it.m.scale.set(s, s, 1);
  it.m.material.rotation = Math.random() * Math.PI;
  it.m.material.opacity = 0.95;
  it.m.visible = true;
  it.ttl = it.max;
  muzzleLight.position.copy(p);
  muzzleLight.intensity = 26;
}

export function fxExplosion(p) {
  const it = boom.take();
  it.m.position.copy(p).y += 0.8;
  it.m.scale.set(3, 3, 1);
  it.m.material.opacity = 1;
  it.m.visible = true;
  it.ttl = it.max;
  for (let i = 0; i < 5; i++) {
    _v2.set(p.x + (Math.random() - 0.5) * 3, p.y + Math.random() * 1.6, p.z + (Math.random() - 0.5) * 3);
    fxImpact(_v2, true);
  }
  boomLight.position.copy(p).y += 1.2;
  boomLight.intensity = 320;
}

export function updateFx(dt, t, smokeOrigin, furnaceMat) {
  for (const it of tracers.items) {
    if (it.ttl <= 0) continue;
    it.ttl -= dt;
    it.m.material.opacity = Math.max(0, it.ttl / 0.055) * 0.85;
    if (it.ttl <= 0) it.m.visible = false;
  }
  for (const it of puffs.items) {
    if (it.ttl <= 0) continue;
    it.ttl -= dt;
    const k = Math.max(0, it.ttl / it.max);
    it.m.material.opacity = k * 0.65;
    it.m.scale.x += it.grow * dt; it.m.scale.y += it.grow * dt;
    it.m.position.y += dt * 0.7;
    if (it.ttl <= 0) it.m.visible = false;
  }
  for (const it of flashes.items) {
    if (it.ttl <= 0) continue;
    it.ttl -= dt;
    if (it.ttl <= 0) it.m.visible = false;
  }
  for (const it of boom.items) {
    if (it.ttl <= 0) continue;
    it.ttl -= dt;
    const k = 1 - Math.max(0, it.ttl / it.max);
    const s = 3 + k * 11;
    it.m.scale.set(s, s, 1);
    it.m.material.opacity = 1 - k;
    if (it.ttl <= 0) it.m.visible = false;
  }
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 500);
  boomLight.intensity = Math.max(0, boomLight.intensity - dt * 900);
  if (furnaceMat) furnaceMat.emissiveIntensity = 1.45 + Math.sin(t * 7.3) * 0.25 + Math.sin(t * 17.7) * 0.12;
  if (smoke && smokeOrigin) {
    const pos = smokePos, N = pos.length / 3;
    for (let i = 0; i < N; i++) {
      const cycle = ((t * 0.14 + i / N) % 1);
      pos[i * 3] = smokeOrigin.x + Math.sin(i * 7.1 + t * 0.4) * (0.4 + cycle * 2.4) + cycle * 3.2;
      pos[i * 3 + 1] = smokeOrigin.y + cycle * 9;
      pos[i * 3 + 2] = smokeOrigin.z + Math.cos(i * 5.3) * (0.4 + cycle * 2.0);
    }
    smoke.geometry.attributes.position.needsUpdate = true;
  }
}
