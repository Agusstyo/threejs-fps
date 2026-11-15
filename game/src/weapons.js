// Weapon definitions and the shared shooting model. Player and bots fire
// through the same code path: spread grows with the shooter's movement and
// sustained fire, damage falls off with distance, heads pay a multiplier,
// armour absorbs a share while it lasts. Grenades are simulated projectiles
// with an area effect checked by line of sight.
import * as THREE from 'three';
import { G, feed } from './state.js';
import { rayHit, raySphere, losClear } from './physics.js';
import { fxTracer, fxImpact, fxMuzzle, fxExplosion } from './fx.js';
import { sfx } from './audio.js';
import { clamp } from './util.js';

export const WEAPONS = {
  kestrel: { id: 'kestrel', name: 'Kestrel P9', slot: 'sidearm', price: 0, auto: false, rpm: 360, mag: 12, reserve: 48,
             damage: 26, headMult: 3.4, spread: 0.010, bloom: 0.006, recoil: 0.012, reload: 1.3, pellets: 1, falloff: 46 },
  badger:  { id: 'badger', name: 'Badger SMG', slot: 'primary', price: 1400, auto: true, rpm: 800, mag: 30, reserve: 90,
             damage: 19, headMult: 2.6, spread: 0.020, bloom: 0.005, recoil: 0.007, reload: 1.9, pellets: 1, falloff: 34 },
  longarm: { id: 'longarm', name: 'Longarm R5', slot: 'primary', price: 2500, auto: true, rpm: 600, mag: 30, reserve: 90,
             damage: 33, headMult: 3.2, spread: 0.007, bloom: 0.004, recoil: 0.011, reload: 2.2, pellets: 1, falloff: 60 },
  mule:    { id: 'mule', name: 'Mule Scatter', slot: 'primary', price: 1100, auto: false, rpm: 68, mag: 6, reserve: 24,
             damage: 11, headMult: 1.8, spread: 0.052, bloom: 0.0, recoil: 0.05, reload: 2.6, pellets: 8, falloff: 16 },
};
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;

export function makeWeapon(id) {
  const def = WEAPONS[id];
  return { def, mag: def.mag, reserve: def.reserve, reloadingUntil: 0, nextShotAt: 0, bloomHeat: 0 };
}

// Where a ray meets an actor: three spheres (head, chest, legs) whose
// heights follow the actor's stance. Returns {t, zone} or null.
const ZONES = [
  { name: 'head', dy: 1.52, cd: 1.04, r: 0.20 },
  { name: 'chest', dy: 1.06, cd: 0.74, r: 0.38 },
  { name: 'legs', dy: 0.44, cd: 0.30, r: 0.30 },
];
export function rayActor(o, d, actor) {
  let best = null;
  for (const z of ZONES) {
    const cy = actor.pos.y + (actor.crouching ? z.cd : z.dy);
    const t = raySphere(o, d, actor.pos.x, cy, actor.pos.z, z.r);
    if (t >= 0 && (!best || t < best.t)) best = { t, zone: z.name };
  }
  return best;
}

export function damageActor(target, raw, zone, attacker) {
  if (!target.alive) return;
  let dmg = raw * (zone === 'head' ? 1 : zone === 'legs' ? 0.72 : 1);
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, dmg * 0.55);
    target.armor -= absorbed;
    dmg -= absorbed;
  }
  target.hp -= dmg;
  target.lastAttacker = attacker;
  target.lastHitAt = G.time;
  if (target.isPlayer) G.events.push({ k: 'playerHurt', from: attacker ? attacker.pos : null });
  if (attacker && attacker.isPlayer) G.events.push({ k: 'hit', head: zone === 'head', killed: target.hp <= 0 });
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.deadAt = G.time;
    if (attacker && attacker !== target) {
      attacker.money = Math.min(16000, attacker.money + G.pay.kill);
      if (attacker.isPlayer) G.stats.kills++;
    }
    feed(`${attacker ? attacker.name : 'The yard'} ▸ ${target.name}${zone === 'head' ? ' (headshot)' : ''}`);
    G.events.push({ k: 'kill', attacker, victim: target, head: zone === 'head' });
    if (G.bomb.carrier === target) {
      G.bomb.carrier = null;
      G.bomb.state = 'dropped';
      G.bomb.pos = { x: target.pos.x, z: target.pos.z };
      G.events.push({ k: 'bombDropped' });
    }
  }
}

const _dir = new THREE.Vector3(), _end = new THREE.Vector3(), _muzzle = new THREE.Vector3();

// Fire one trigger pull (all pellets) for an actor. origin/dir are the eye
// ray; spreadScale folds in stance and movement. Returns true if it fired.
export function shootHitscan(shooter, w, origin, dir, spreadScale, muzzlePos) {
  const def = w.def;
  if (G.time < w.nextShotAt || G.time < w.reloadingUntil) return false;
  if (w.mag <= 0) { sfx.dry(); w.nextShotAt = G.time + 0.3; return false; }
  w.mag--;
  w.nextShotAt = G.time + 60 / def.rpm;
  w.bloomHeat = Math.min(1, w.bloomHeat + def.bloom * 22);
  if (shooter.isPlayer) G.stats.shots++;
  const spread = (def.spread + w.bloomHeat * 0.012) * spreadScale;
  let anyHit = false;
  for (let p = 0; p < def.pellets; p++) {
    _dir.copy(dir);
    _dir.x += (G.rng() - 0.5) * 2 * spread;
    _dir.y += (G.rng() - 0.5) * 2 * spread;
    _dir.z += (G.rng() - 0.5) * 2 * spread;
    _dir.normalize();
    const wall = rayHit(G.world, origin, _dir, 120);
    const wallDist = wall ? wall.dist : 120;
    let bestActor = null, bestT = wallDist, bestZone = null;
    for (const a of G.bots) {
      if (a === shooter || !a.alive || a.team === shooter.team) continue;
      const hit = rayActor(origin, _dir, a);
      if (hit && hit.t < bestT) { bestT = hit.t; bestActor = a; bestZone = hit.zone; }
    }
    const pl = G.player;
    if (pl && pl !== shooter && pl.alive && pl.team !== shooter.team) {
      const hit = rayActor(origin, _dir, pl);
      if (hit && hit.t < bestT) { bestT = hit.t; bestActor = pl; bestZone = hit.zone; }
    }
    _end.copy(_dir).multiplyScalar(bestT).add(origin);
    if (muzzlePos) fxTracer(muzzlePos, _end);
    if (bestActor) {
      const fall = bestT <= 18 ? 1 : Math.max(0.5, 1 - (bestT - 18) / def.falloff * 0.5);
      let dmg = def.damage * fall;
      if (bestZone === 'head') dmg *= def.headMult;
      damageActor(bestActor, dmg, bestZone, shooter);
      anyHit = true;
      fxImpact(_end);
    } else if (wall) {
      fxImpact(_end);
    }
  }
  if (muzzlePos) fxMuzzle(muzzlePos);
  if (def.pellets > 1) sfx.scatter(origin); else sfx.shot(origin, def.damage >= 30);
  G.events.push({ k: 'gunshot', pos: { x: origin.x, z: origin.z }, team: shooter.team });
  G.recentShots.push({ x: origin.x, z: origin.z, team: shooter.team, t: G.time });
  if (G.recentShots.length > 10) G.recentShots.shift();
  return anyHit;
}

export function startReload(actor, w) {
  if (w.mag >= w.def.mag || w.reserve <= 0 || G.time < w.reloadingUntil) return false;
  w.reloadingUntil = G.time + w.def.reload;
  if (actor.isPlayer) sfx.reload();
  return true;
}

export function finishReload(w) {
  const take = Math.min(w.def.mag - w.mag, w.reserve);
  w.mag += take; w.reserve -= take;
}

// ---- grenades ----
const grenadeGeo = new THREE.SphereGeometry(0.13, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.5, metalness: 0.4, emissive: 0xff5a2a, emissiveIntensity: 0.7 });

export function throwGrenade(actor, origin, dir) {
  if (actor.grenades <= 0) return false;
  actor.grenades--;
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.position.copy(origin);
  G.scene.add(mesh);
  const vel = dir.clone().multiplyScalar(17);
  vel.y += 4.5;
  G.grenades.push({ pos: mesh.position, vel, fuse: 1.6, mesh, thrower: actor });
  sfx.grenadeThrow();
  return true;
}

const _blast = new THREE.Vector3(), _chest = new THREE.Vector3();
export function updateGrenades(dt) {
  for (let i = G.grenades.length - 1; i >= 0; i--) {
    const g = G.grenades[i];
    g.fuse -= dt;
    g.vel.y -= 22 * dt;
    g.pos.addScaledVector(g.vel, dt);
    if (g.pos.y < 0.13) { g.pos.y = 0.13; g.vel.y *= -0.42; g.vel.x *= 0.72; g.vel.z *= 0.72; }
    // Bounce out of any solid the centre entered, along the shallowest axis.
    for (const b of G.world.colliders) {
      if (g.pos.x > b.x0 - 0.13 && g.pos.x < b.x1 + 0.13 && g.pos.z > b.z0 - 0.13 && g.pos.z < b.z1 + 0.13 &&
          g.pos.y > b.y0 - 0.13 && g.pos.y < b.y1 + 0.13) {
        const dxl = g.pos.x - (b.x0 - 0.13), dxr = (b.x1 + 0.13) - g.pos.x;
        const dzl = g.pos.z - (b.z0 - 0.13), dzr = (b.z1 + 0.13) - g.pos.z;
        const dyt = (b.y1 + 0.13) - g.pos.y;
        const m = Math.min(dxl, dxr, dzl, dzr, dyt);
        if (m === dyt) { g.pos.y = b.y1 + 0.13; g.vel.y = Math.abs(g.vel.y) * 0.42; g.vel.x *= 0.72; g.vel.z *= 0.72; }
        else if (m === dxl) { g.pos.x = b.x0 - 0.13; g.vel.x = -Math.abs(g.vel.x) * 0.45; }
        else if (m === dxr) { g.pos.x = b.x1 + 0.13; g.vel.x = Math.abs(g.vel.x) * 0.45; }
        else if (m === dzl) { g.pos.z = b.z0 - 0.13; g.vel.z = -Math.abs(g.vel.z) * 0.45; }
        else { g.pos.z = b.z1 + 0.13; g.vel.z = Math.abs(g.vel.z) * 0.45; }
      }
    }
    if (g.fuse <= 0) {
      G.scene.remove(g.mesh);
      G.grenades.splice(i, 1);
      fxExplosion(g.pos);
      sfx.explosion(g.pos);
      _blast.copy(g.pos); _blast.y += 0.6;
      const hurt = (a) => {
        if (!a || !a.alive) return;
        _chest.set(a.pos.x, a.pos.y + 1.0, a.pos.z);
        const d = _blast.distanceTo(_chest);
        if (d > 6.5) return;
        if (!losClear(G.world, _blast, _chest)) return;
        let dmg = 95 * (1 - d / 6.5) + 8;
        if (a === g.thrower) dmg *= 0.5;
        damageActor(a, dmg, 'chest', g.thrower);
      };
      for (const a of G.bots) hurt(a);
      hurt(G.player);
      G.events.push({ k: 'explosion', pos: { x: g.pos.x, z: g.pos.z } });
    }
  }
}

// ---- first-person view models (also reused, simplified, for bots) ----
const vmMats = {
  body: new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.55, metalness: 0.45 }),
  grip: new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.85 }),
  accentAtk: new THREE.MeshStandardMaterial({ color: 0xff7847, roughness: 0.5 }),
  accentDef: new THREE.MeshStandardMaterial({ color: 0x37c8b4, roughness: 0.5 }),
};
function vmBox(parent, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
export function buildViewModel(defId, team) {
  const g = new THREE.Group();
  const accent = team === 'atk' ? vmMats.accentAtk : vmMats.accentDef;
  if (defId === 'kestrel') {
    vmBox(g, vmMats.body, 0, 0, -0.1, 0.07, 0.11, 0.24);
    vmBox(g, vmMats.grip, 0, -0.09, 0.02, 0.06, 0.12, 0.08);
    vmBox(g, accent, 0, 0.045, -0.16, 0.075, 0.02, 0.1);
  } else if (defId === 'mule') {
    vmBox(g, vmMats.body, 0, 0, -0.2, 0.09, 0.1, 0.52);
    vmBox(g, vmMats.grip, 0, -0.05, -0.28, 0.07, 0.05, 0.2);
    vmBox(g, vmMats.grip, 0, -0.09, 0.06, 0.06, 0.12, 0.08);
  } else if (defId === 'badger') {
    vmBox(g, vmMats.body, 0, 0, -0.18, 0.08, 0.12, 0.44);
    vmBox(g, vmMats.body, 0, 0.01, -0.44, 0.045, 0.045, 0.16);
    vmBox(g, vmMats.grip, 0, -0.11, -0.1, 0.05, 0.14, 0.06);
    vmBox(g, accent, 0, -0.02, 0.08, 0.085, 0.06, 0.1);
  } else { // longarm
    vmBox(g, vmMats.body, 0, 0, -0.22, 0.08, 0.11, 0.56);
    vmBox(g, vmMats.body, 0, 0.01, -0.56, 0.04, 0.04, 0.22);
    vmBox(g, vmMats.grip, 0, -0.11, -0.16, 0.05, 0.15, 0.06);
    vmBox(g, vmMats.grip, 0, -0.07, 0.14, 0.07, 0.09, 0.16);
    vmBox(g, accent, 0, 0.075, -0.3, 0.02, 0.035, 0.12);
    vmBox(g, vmMats.body, 0, 0.09, -0.05, 0.05, 0.05, 0.05); // rear sight block
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, defId === 'kestrel' ? -0.24 : defId === 'mule' ? -0.48 : defId === 'badger' ? -0.54 : -0.68);
  g.add(muzzle);
  return { group: g, muzzle };
}
