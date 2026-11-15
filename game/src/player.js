// The human player: pointer-lock look, acceleration-based movement with
// crouch and a jump, stance-aware spread, recoil that kicks and settles,
// aim-down-sights, weapon switching, the buy list, and holding E to plant.
import * as THREE from 'three';
import { G, START_MONEY } from './state.js';
import { moveActor } from './physics.js';
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE, makeWeapon, shootHitscan, startReload, finishReload, throwGrenade } from './weapons.js';
import { sfx, initAudio } from './audio.js';
import { clamp, lerp } from './util.js';

const keys = {};
let mouseDown = false, adsHeld = false, locked = false;
let swayX = 0, swayY = 0;

export function createPlayer(spawn) {
  const p = {
    isPlayer: true, team: 'atk', name: 'You',
    pos: new THREE.Vector3(spawn.x, 0, spawn.z), radius: 0.35, height: 1.7,
    vy: 0, onGround: true, velX: 0, velZ: 0,
    hp: 100, armor: 0, money: START_MONEY, alive: true, deadAt: 0,
    yaw: 0, pitch: 0, crouching: false, eyeSmooth: 1.58,
    weapons: { primary: null, sidearm: makeWeapon('kestrel') },
    current: 'sidearm', grenades: 0,
    drawUntil: 0, recoilP: 0, recoilY: 0, kick: 0, plantT: 0, speed2d: 0,
    vm: {}, vmGroup: null, lastAttacker: null, lastHitAt: -9,
  };
  return p;
}

export function currentWeapon(p) { return p.weapons[p.current]; }

export function eyePos(p, out) {
  return out.set(p.pos.x, p.pos.y + p.eyeSmooth, p.pos.z);
}

export function initInput(canvas, onFirstClick) {
  document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['Space', 'ControlLeft', 'Tab'].includes(e.code)) e.preventDefault();
    const p = G.player;
    if (p && G.mode === 'play') {
      if (G.phase === 'buy') handleBuyKey(e.code);
      else if (e.code === 'Digit1' && p.weapons.primary) switchTo(p, 'primary');
      else if (e.code === 'Digit2') switchTo(p, 'sidearm');
      if (e.code === 'KeyR') { const w = currentWeapon(p); if (w) startReload(p, w); }
      if (e.code === 'KeyG' && p.alive && (G.phase === 'live' || G.phase === 'planted')) {
        const eye = eyePos(p, new THREE.Vector3());
        const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'));
        throwGrenade(p, eye, dir);
      }
    }
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; });
  document.addEventListener('mousemove', (e) => {
    if (!locked || !G.player || !G.player.alive) return;
    const p = G.player;
    p.yaw -= e.movementX * 0.0021;
    p.pitch = clamp(p.pitch - e.movementY * 0.0021, -1.45, 1.45);
    swayX = clamp(swayX - e.movementX * 0.0006, -0.05, 0.05);
    swayY = clamp(swayY + e.movementY * 0.0006, -0.05, 0.05);
  });
  document.addEventListener('mousedown', (e) => {
    if (!locked) return;
    if (e.button === 0) mouseDown = true;
    if (e.button === 2) adsHeld = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
    if (e.button === 2) adsHeld = false;
  });
  document.addEventListener('contextmenu', (e) => { if (locked) e.preventDefault(); });
  document.addEventListener('wheel', (e) => {
    const p = G.player;
    if (!locked || !p || G.phase === 'buy') return;
    if (p.weapons.primary) switchTo(p, p.current === 'primary' ? 'sidearm' : 'primary');
  });
  canvas.addEventListener('click', () => {
    initAudio();
    if (G.mode === 'play' && !locked) canvas.requestPointerLock();
    if (onFirstClick) onFirstClick();
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement != null;
    if (!locked) { mouseDown = false; adsHeld = false; }
    G.events.push({ k: 'lock', locked });
  });
}

export function isLocked() { return locked; }

export function switchTo(p, slot) {
  if (p.current === slot || !p.weapons[slot]) return;
  p.current = slot;
  p.drawUntil = G.time + 0.32;
  showViewModel(p);
}

const SHOP = [
  { key: 'Digit1', item: 'longarm' }, { key: 'Digit2', item: 'badger' },
  { key: 'Digit3', item: 'mule' }, { key: 'Digit4', item: 'frag' }, { key: 'Digit5', item: 'armor' },
];
function handleBuyKey(code) {
  const row = SHOP.find((s) => s.key === code);
  if (row && G.player.alive) buyItem(G.player, row.item);
}

export function buyItem(p, item) {
  const done = (ok) => { if (p.isPlayer) { if (ok) sfx.buy(); else sfx.denied(); } return ok; };
  if (item === 'frag') {
    if (p.money < GRENADE_PRICE || p.grenades >= 2) return done(false);
    p.money -= GRENADE_PRICE; p.grenades++; return done(true);
  }
  if (item === 'armor') {
    if (p.money < ARMOR_PRICE || p.armor >= 100) return done(false);
    p.money -= ARMOR_PRICE; p.armor = 100; return done(true);
  }
  const def = WEAPONS[item];
  if (!def || p.money < def.price) return done(false);
  if (p.weapons.primary && p.weapons.primary.def.id === item) return done(false);
  p.money -= def.price;
  p.weapons.primary = makeWeapon(item);
  if (p.isPlayer) { p.current = 'primary'; p.drawUntil = G.time + 0.3; showViewModel(p); }
  return done(true);
}

// ---- view models ----
export function attachViewModels(camera, buildFn) {
  const p = G.player;
  p.vmGroup = new THREE.Group();
  camera.add(p.vmGroup);
  p.vmBuild = buildFn;
  showViewModel(p);
}
function showViewModel(p) {
  if (!p.vmGroup) return;
  for (const child of [...p.vmGroup.children]) p.vmGroup.remove(child);
  const w = currentWeapon(p);
  if (!w) return;
  p.vmWeaponId = w.def.id;
  const built = p.vmBuild(w.def.id, p.team);
  built.group.position.set(0.24, -0.22, -0.45);
  p.vmGroup.add(built.group);
  p.vmCurrent = built;
}
export function refreshViewModel(p) { showViewModel(p); }

const _eye = new THREE.Vector3(), _dir = new THREE.Vector3(), _muzzle = new THREE.Vector3(), _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export function updatePlayer(dt) {
  const p = G.player;
  if (!p || !p.alive) return;
  const frozen = G.phase === 'buy' || G.phase === 'over' || G.phase === 'matchover';
  p.crouching = !!(keys['ControlLeft'] || keys['KeyC']);
  const targetEye = p.crouching ? 1.04 : 1.58;
  p.eyeSmooth = lerp(p.eyeSmooth, targetEye, 1 - Math.exp(-14 * dt));
  p.height = p.crouching ? 1.18 : 1.7;

  // movement: accelerate toward the wish velocity; air control is weak, so
  // stopping to shoot is a real decision
  let wx = 0, wz = 0;
  if (!frozen) {
    const f = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
    const s = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    wx = (-sin * f + cos * s); wz = (-cos * f - sin * s);
    const len = Math.hypot(wx, wz) || 1;
    let speed = p.crouching ? 2.2 : 4.6;
    if (keys['ShiftLeft'] && f > 0 && !p.crouching) speed = 6.3;
    if (adsHeld) speed *= 0.55;
    wx = wx / len * speed * (f || s ? 1 : 0); wz = wz / len * speed * (f || s ? 1 : 0);
    if (keys['Space'] && p.onGround) { p.vy = 8.4; p.onGround = false; }
  }
  const accel = p.onGround ? 42 : 7;
  p.velX += clamp(wx - p.velX, -accel * dt, accel * dt);
  p.velZ += clamp(wz - p.velZ, -accel * dt, accel * dt);
  moveActor(G.world, p, p.velX * dt, p.velZ * dt, dt);
  p.speed2d = Math.hypot(p.velX, p.velZ);

  const w = currentWeapon(p);
  if (w) {
    if (w.reloadingUntil && G.time >= w.reloadingUntil) { finishReload(w); w.reloadingUntil = 0; }
    w.bloomHeat = Math.max(0, w.bloomHeat - dt * 2.4);
    const canFire = !frozen && locked && G.time >= p.drawUntil;
    if (canFire && mouseDown && (w.def.auto || !p.mouseHeld)) {
      eyePos(p, _eye);
      _euler.set(p.pitch + p.recoilP, p.yaw + p.recoilY, 0);
      _dir.set(0, 0, -1).applyEuler(_euler);
      if (p.vmCurrent) p.vmCurrent.muzzle.getWorldPosition(_muzzle); else _muzzle.copy(_eye);
      const before = w.mag;
      const moveSpread = 1 + (p.speed2d / 4.6) * 1.7 + (p.onGround ? 0 : 1.3);
      const stance = (p.crouching ? 0.68 : 1) * (adsHeld ? 0.45 : 1);
      shootHitscan(p, w, _eye, _dir, moveSpread * stance, _muzzle);
      if (w.mag < before) {
        p.recoilP += w.def.recoil * (0.75 + G.rng() * 0.5);
        p.recoilY += (G.rng() - 0.5) * w.def.recoil * 0.7;
        p.kick = Math.min(0.09, p.kick + 0.05);
        if (!w.def.auto) p.mouseHeld = true;
      }
    }
    if (!mouseDown) p.mouseHeld = false;
  }

  // planting: hold E inside the site while carrying the charge
  p.plantT = 0;
  G.interact = null;
  if (G.phase === 'live' && G.bomb.state === 'carried' && G.bomb.carrier === p) {
    for (const key of ['A', 'B']) {
      const site = G.world.sites[key];
      if (Math.hypot(p.pos.x - site.x, p.pos.z - site.z) < site.r) {
        if (keys['KeyE'] && p.speed2d < 0.4) {
          p.plantHeld = (p.plantHeld || 0) + dt;
          G.interact = { label: `Planting the charge — Site ${key}`, frac: p.plantHeld / 3.2 };
          if (p.plantHeld >= 3.2) { p.plantHeld = 0; G.logic.push({ k: 'plantRequest', site: key, by: p }); }
        } else {
          p.plantHeld = 0;
          G.interact = { label: `Hold E to plant — Site ${key}`, frac: 0 };
        }
      }
    }
  }

  p.recoilP = lerp(p.recoilP, 0, 1 - Math.exp(-9 * dt));
  p.recoilY = lerp(p.recoilY, 0, 1 - Math.exp(-9 * dt));
  p.kick = lerp(p.kick, 0, 1 - Math.exp(-11 * dt));
  swayX = lerp(swayX, 0, 1 - Math.exp(-8 * dt));
  swayY = lerp(swayY, 0, 1 - Math.exp(-8 * dt));
}

// Per-frame camera + viewmodel placement (render side, not fixed-step).
export function poseCamera(camera, dt) {
  const p = G.player;
  eyePos(p, _eye);
  camera.position.copy(_eye);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(p.pitch + p.recoilP, p.yaw + p.recoilY, 0);
  const targetFov = adsHeld && p.alive ? 52 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) { camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-12 * dt)); camera.updateProjectionMatrix(); }
  if (p.vmGroup) {
    const w = currentWeapon(p);
    const bobT = G.time * (p.speed2d > 0.3 ? 9 : 0);
    const bob = p.onGround ? Math.min(1, p.speed2d / 4.6) * 0.014 : 0;
    const adsK = adsHeld ? 1 : 0;
    p.adsSmooth = lerp(p.adsSmooth || 0, adsK, 1 - Math.exp(-14 * dt));
    const g = p.vmGroup.children[0];
    if (g) {
      const reloading = w && w.reloadingUntil > G.time;
      const relK = reloading ? Math.sin(Math.min(1, 1 - (w.reloadingUntil - G.time) / w.def.reload) * Math.PI) : 0;
      g.position.set(
        lerp(0.24, 0, p.adsSmooth) + swayX,
        lerp(-0.22, -0.165, p.adsSmooth) + swayY + Math.sin(bobT * 2) * bob - relK * 0.06,
        -0.45 + p.kick + Math.cos(bobT) * bob * 0.6,
      );
      g.rotation.set(relK * 0.7 + p.kick * 1.4, swayX * 2, 0);
    }
  }
}
