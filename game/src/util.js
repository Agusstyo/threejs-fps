// Small shared helpers: a seeded RNG (so screenshot scenes and bot choices are
// reproducible), numeric clamps, and angle tools. No module here touches the DOM.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Shortest-path angle lerp, for bot turning.
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// A tiny event queue: the simulation pushes plain objects, the HUD and audio
// layers drain it once per frame. Keeps sim modules free of DOM/audio imports.
export function makeQueue() {
  const items = [];
  return {
    push: (e) => items.push(e),
    drain: () => items.splice(0, items.length),
    get length() { return items.length; },
  };
}
