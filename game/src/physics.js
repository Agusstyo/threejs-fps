// Collision and ray tests against the map's axis-aligned boxes. Actors are
// cylinders (feet position, radius, height); the world is a flat list of
// AABBs {x0,x1,z0,z1,y0,y1}. Movement resolves one axis at a time and steps up
// onto anything at most STEP high, which is what makes stairs and the catwalk
// walkable with no special cases.
import * as THREE from 'three';

export const STEP = 0.55;
const GRAVITY = 24;

// Does the actor's body overlap this box vertically in a way that should
// block horizontal movement? Low boxes are step-on-able; slabs whose bottom
// is above the head are duck-under-able (crouch lowers height).
function blocksHorizontally(box, feetY, height) {
  return box.y1 > feetY + STEP && box.y0 < feetY + height - 0.05;
}

export function moveActor(world, actor, dx, dz, dt) {
  const p = actor.pos;
  const r = actor.radius;

  // --- X axis ---
  if (dx !== 0) {
    let nx = p.x + dx;
    for (const b of world.colliders) {
      if (!blocksHorizontally(b, p.y, actor.height)) continue;
      if (nx + r > b.x0 && nx - r < b.x1 && p.z + r > b.z0 && p.z - r < b.z1) {
        nx = dx > 0 ? b.x0 - r - 0.001 : b.x1 + r + 0.001;
      }
    }
    p.x = nx;
  }
  // --- Z axis ---
  if (dz !== 0) {
    let nz = p.z + dz;
    for (const b of world.colliders) {
      if (!blocksHorizontally(b, p.y, actor.height)) continue;
      if (p.x + r > b.x0 && p.x - r < b.x1 && nz + r > b.z0 && nz - r < b.z1) {
        nz = dz > 0 ? b.z0 - r - 0.001 : b.z1 + r + 0.001;
      }
    }
    p.z = nz;
  }
  // --- Vertical: gravity, ground support, head bumps ---
  const prevY = p.y;
  actor.vy -= GRAVITY * dt;
  p.y += actor.vy * dt;
  let ground = 0;
  for (const b of world.colliders) {
    if (p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1) {
      if (b.y1 <= prevY + STEP && b.y1 > ground) ground = b.y1;
      // ceiling: a box bottom just above the head stops a jump
      if (actor.vy > 0 && b.y0 >= prevY + actor.height - 0.02 && b.y0 < p.y + actor.height) {
        p.y = b.y0 - actor.height;
        actor.vy = 0;
      }
    }
  }
  if (p.y <= ground) {
    p.y = ground;
    actor.vy = 0;
    actor.onGround = true;
  } else {
    actor.onGround = p.y - ground < 0.02;
  }
  return actor.onGround;
}

// Nearest AABB hit along a ray. Returns {dist, nx, ny, nz} or null.
const _inv = new THREE.Vector3();
export function rayHit(world, o, d, maxDist) {
  let best = null;
  for (const b of world.colliders) {
    let tmin = 0, tmax = maxDist, nx = 0, ny = 0, nz = 0;
    // X slab
    if (Math.abs(d.x) < 1e-9) { if (o.x < b.x0 || o.x > b.x1) continue; }
    else {
      _inv.x = 1 / d.x;
      let t1 = (b.x0 - o.x) * _inv.x, t2 = (b.x1 - o.x) * _inv.x;
      let s = -Math.sign(d.x);
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) { tmin = t1; nx = s; ny = 0; nz = 0; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // Y slab
    if (Math.abs(d.y) < 1e-9) { if (o.y < b.y0 || o.y > b.y1) continue; }
    else {
      _inv.y = 1 / d.y;
      let t1 = (b.y0 - o.y) * _inv.y, t2 = (b.y1 - o.y) * _inv.y;
      let s = -Math.sign(d.y);
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) { tmin = t1; nx = 0; ny = s; nz = 0; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // Z slab
    if (Math.abs(d.z) < 1e-9) { if (o.z < b.z0 || o.z > b.z1) continue; }
    else {
      _inv.z = 1 / d.z;
      let t1 = (b.z0 - o.z) * _inv.z, t2 = (b.z1 - o.z) * _inv.z;
      let s = -Math.sign(d.z);
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) { tmin = t1; nx = 0; ny = 0; nz = s; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (!best || tmin < best.dist) best = { dist: tmin, nx, ny, nz };
  }
  return best;
}

const _ab = new THREE.Vector3();
export function losClear(world, a, b) {
  const dist = _ab.subVectors(b, a).length();
  if (dist < 0.001) return true;
  _ab.divideScalar(dist);
  const hit = rayHit(world, a, _ab, dist - 0.05);
  return hit === null;
}

// Ray vs sphere: returns distance along the ray or -1.
export function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}
