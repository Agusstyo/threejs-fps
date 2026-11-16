// Enemy and teammate bots. Each bot perceives on a staggered think tick:
// sight (range, field of view, line of sight) and hearing (recent gunshots).
// Its state machine advances on a waypoint route to an objective, holds a
// post, engages what it sees with burst fire and strafing, fetches a dropped
// charge, plants it, or defuses — the same verbs the player has.
import * as THREE from 'three';
import { G, TEAM, feed } from './state.js';
import { findPath, nearestNode } from './map.js';
import { moveActor, losClear } from './physics.js';
import { makeWeapon, shootHitscan, startReload, finishReload, throwGrenade } from './weapons.js';
import { clamp, lerpAngle } from './util.js';

export const BOT_NAMES = { atk: ['Vex', 'Onyx', 'Rook'], def: ['Hale', 'Ivers', 'Moss', 'Quill'] };

const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a186, roughness: 0.8 });
const limbMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.9 });
const torsoMats = {
  atk: new THREE.MeshStandardMaterial({ color: 0xc85a32, roughness: 0.75 }),
  def: new THREE.MeshStandardMaterial({ color: 0x2a7f76, roughness: 0.75 }),
};
const gunMat = new THREE.MeshStandardMaterial({ color: 0x1d2026, roughness: 0.5, metalness: 0.4 });
const visorMats = {
  atk: new THREE.MeshStandardMaterial({ color: 0x101216, emissive: 0xff7847, emissiveIntensity: 2.0, roughness: 0.4 }),
  def: new THREE.MeshStandardMaterial({ color: 0x101216, emissive: 0x37c8b4, emissiveIntensity: 2.0, roughness: 0.4 }),
};

function part(parent, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// A low-poly figure in two halves: legs that swing from the hip, and an upper
// group (torso, head, gun) that pitches with the bot's aim.
export function buildFigure(team) {
  const torsoMat = torsoMats[team].clone();   // per-figure: hit flashes are individual
  const group = new THREE.Group();
  const legL = new THREE.Group(); legL.position.set(-0.11, 0.8, 0); group.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.11, 0.8, 0); group.add(legR);
  part(legL, limbMat, 0, -0.4, 0, 0.17, 0.8, 0.19);
  part(legR, limbMat, 0, -0.4, 0, 0.17, 0.8, 0.19);
  const upper = new THREE.Group(); upper.position.set(0, 0.8, 0); group.add(upper);
  part(upper, torsoMat, 0, 0.3, 0, 0.46, 0.6, 0.26);
  part(upper, limbMat, 0, 0.02, 0, 0.4, 0.1, 0.22);
  part(upper, skinMat, 0, 0.78, 0, 0.24, 0.26, 0.24);
  part(upper, torsoMat, 0, 0.9, 0, 0.29, 0.13, 0.29);       // helmet
  part(upper, visorMats[team], 0, 0.79, -0.125, 0.2, 0.045, 0.02);  // lit visor strip
  part(upper, limbMat, 0, 0.32, 0.19, 0.34, 0.44, 0.12);            // backpack
  part(upper, visorMats[team], 0.13, 0.44, -0.135, 0.05, 0.05, 0.02); // chest light
  part(upper, limbMat, 0.2, 0.38, -0.18, 0.11, 0.11, 0.42);        // right arm to gun
  part(upper, limbMat, -0.16, 0.3, -0.22, 0.11, 0.11, 0.36);       // left arm
  const gun = part(upper, gunMat, 0.14, 0.42, -0.42, 0.08, 0.13, 0.66);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0.14, 0.44, -0.78); upper.add(muzzle);
  return { group, legL, legR, upper, muzzle, torsoMat };
}

export function createBot(team, idx, spawn) {
  const fig = buildFigure(team);
  G.scene.add(fig.group);
  const bot = {
    isPlayer: false, team, name: BOT_NAMES[team][idx % BOT_NAMES[team].length],
    pos: new THREE.Vector3(spawn.x, 0, spawn.z), radius: 0.35, height: 1.7,
    vy: 0, onGround: true, velX: 0, velZ: 0,
    hp: 100, armor: 0, money: 800, alive: true, deadAt: 0,
    yaw: team === 'atk' ? 0 : Math.PI, pitch: 0, crouching: false,
    weapons: { primary: null, sidearm: makeWeapon('kestrel') },
    current: 'sidearm', grenades: 0, speed2d: 0,
    lastAttacker: null, lastHitAt: -9, lastHp: 100, flashT: 0, walkPhase: Math.random() * 6,
    fig,
    ai: {
      state: 'advance', path: [], pathI: 0, dest: null, post: null, homeSite: 'A',
      seen: null, seenPos: new THREE.Vector3(), seenAt: -9, reactAt: 0,
      nextThink: Math.random() * 0.15, burst: 0, pauseUntil: 0, strafeDir: 1, strafeFlipAt: 0,
      plantT: 0, settleAt: 0, scanBase: 0,
    },
  };
  fig.group.position.copy(bot.pos);
  return bot;
}

export function botWeapon(bot) { return bot.weapons[bot.current]; }

const _eye = new THREE.Vector3(), _chest = new THREE.Vector3(), _dir = new THREE.Vector3(), _muzzle = new THREE.Vector3();

function eyeOf(a, out) { return out.set(a.pos.x, a.pos.y + (a.crouching ? 1.04 : 1.52), a.pos.z); }

function canSee(bot, other) {
  eyeOf(bot, _eye);
  _chest.set(other.pos.x, other.pos.y + 1.0, other.pos.z);
  const d = _eye.distanceTo(_chest);
  if (d > 58) return false;
  if (d > 7) {
    _dir.subVectors(_chest, _eye).normalize();
    const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
    if (_dir.x * fx + _dir.z * fz < 0.22) return false;   // ~±77° field of view
  }
  return losClear(G.world, _eye, _chest);
}

function setDest(bot, x, z) {
  const ai = bot.ai;
  ai.dest = { x, z };
  const from = nearestNode(G.world, bot.pos.x, bot.pos.z);
  const to = nearestNode(G.world, x, z);
  ai.path = findPath(G.world, from, to);
  ai.pathI = 0;
}

function followPath(bot, dt, speed) {
  const ai = bot.ai;
  let tx, tz;
  if (ai.pathI < ai.path.length) {
    const n = G.world.nodes[ai.path[ai.pathI]];
    tx = n.x; tz = n.z;
    if (Math.hypot(tx - bot.pos.x, tz - bot.pos.z) < 0.8) { ai.pathI++; return false; }
  } else if (ai.dest) { tx = ai.dest.x; tz = ai.dest.z; }
  else return true;
  const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
  const d = Math.hypot(dx, dz);
  if (ai.pathI >= ai.path.length && d < 0.5) return true;
  moveToward(bot, dx / (d || 1), dz / (d || 1), speed, dt);
  return false;
}

function moveToward(bot, ux, uz, speed, dt) {
  const k = 1 - Math.exp(-10 * dt);
  bot.velX += (ux * speed - bot.velX) * k;
  bot.velZ += (uz * speed - bot.velZ) * k;
  moveActor(G.world, bot, bot.velX * dt, bot.velZ * dt, dt);
  bot.speed2d = Math.hypot(bot.velX, bot.velZ);
  const targetYaw = Math.atan2(-ux, -uz);
  bot.yaw = lerpAngle(bot.yaw, targetYaw, 1 - Math.exp(-8 * dt));
}

function stopBot(bot, dt) {
  const k = 1 - Math.exp(-12 * dt);
  bot.velX *= 1 - k; bot.velZ *= 1 - k;
  moveActor(G.world, bot, bot.velX * dt, bot.velZ * dt, dt);
  bot.speed2d = Math.hypot(bot.velX, bot.velZ);
}

// ---- perception + state choice, run on a staggered tick ----
function think(bot) {
  const ai = bot.ai;
  const now = G.time;
  // sight
  let seen = null;
  for (const f of aliveFoesOf(bot)) if (canSee(bot, f)) { seen = f; break; }
  if (seen) {
    if (ai.seen !== seen) {
      ai.reactAt = now + 0.26 + G.rng() * 0.22;
      // a fresh contact gets called out on the feed, throttled per bot
      if (now > (ai.calloutAt || 0)) {
        ai.calloutAt = now + 7;
        const sA = G.world.sites.A, sB = G.world.sites.B;
        const zone = Math.hypot(seen.pos.x - sA.x, seen.pos.z - sA.z) < 10 ? 'Furnace Hall'
          : Math.hypot(seen.pos.x - sB.x, seen.pos.z - sB.z) < 10 ? 'the Depot' : 'the yard';
        feed(`${bot.name}: contact — ${zone}`);
      }
    }
    ai.seen = seen; ai.seenPos.copy(seen.pos); ai.seenAt = now;
  } else if (now - ai.seenAt > 1.8) ai.seen = null;
  // hearing: enemy gunfire within 30 m in the last second gives a rough fix
  if (!ai.seen) {
    for (const s of G.recentShots) {
      if (s.team !== bot.team && now - s.t < 1.1 && Math.hypot(s.x - bot.pos.x, s.z - bot.pos.z) < 30) {
        ai.seenPos.set(s.x, 0, s.z); ai.seenAt = now - 0.9; // stale fix: investigate, not engage
        if (ai.state === 'hold') { ai.state = 'advance'; setDest(bot, s.x, s.z); }
      }
    }
  }
  // being shot at wakes a bot up fast
  if (bot.lastAttacker && now - bot.lastHitAt < 0.4 && bot.lastAttacker.alive) {
    ai.seen = bot.lastAttacker; ai.seenPos.copy(bot.lastAttacker.pos); ai.seenAt = now;
    if (ai.reactAt > now + 0.1) ai.reactAt = now + 0.1;
  }
}
function aliveFoesOf(bot) {
  const out = [];
  if (G.player && G.player.alive && G.player.team !== bot.team) out.push(G.player);
  for (const b of G.bots) if (b !== bot && b.alive && b.team !== bot.team) out.push(b);
  return out;
}

export function updateBot(bot, dt) {
  const ai = bot.ai;
  if (!bot.alive) { syncFigure(bot, dt); return; }
  const now = G.time;
  const w = botWeapon(bot);
  if (w.reloadingUntil && now >= w.reloadingUntil) { finishReload(w); w.reloadingUntil = 0; }
  w.bloomHeat = Math.max(0, w.bloomHeat - dt * 2.4);
  if (now >= ai.nextThink) { ai.nextThink = now + 0.12; think(bot); }

  const frozen = G.phase === 'buy' || G.phase === 'over' || G.phase === 'matchover';
  const engaging = ai.seen && ai.seen.alive && now - ai.seenAt < 1.8;
  bot.crouching = false;

  // a frag goes toward the last-seen spot when the target has just ducked
  // out of sight at mid range: flush the cover instead of pushing blind
  if (!frozen && bot.grenades > 0 && now >= (ai.nadeAt || 0) && now - ai.seenAt < 2.2) {
    const nd = Math.hypot(ai.seenPos.x - bot.pos.x, ai.seenPos.z - bot.pos.z);
    const freshVisual = ai.seen && now - ai.seenAt < 0.3;
    if (nd > 8 && nd < 21 && !freshVisual) {
      eyeOf(bot, _eye);
      _dir.set(ai.seenPos.x - _eye.x, (ai.seenPos.y + 1.0) - _eye.y, ai.seenPos.z - _eye.z).normalize();
      if (throwGrenade(bot, _eye, _dir)) ai.nadeAt = now + 9;
    }
  }

  if (frozen) {
    stopBot(bot, dt);
  } else if (engaging) {
    engage(bot, dt);
  } else {
    objective(bot, dt);
  }
  syncFigure(bot, dt);
}

function engage(bot, dt) {
  const ai = bot.ai, now = G.time;
  const target = ai.seen;
  const dx = target.pos.x - bot.pos.x, dz = target.pos.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  bot.yaw = lerpAngle(bot.yaw, Math.atan2(-dx, -dz), 1 - Math.exp(-11 * dt));
  bot.pitch = clamp(Math.atan2((target.pos.y + 1.05) - (bot.pos.y + 1.5), dist), -0.5, 0.5);
  // range keeping: close in past 24 m, back off inside 7 m, else strafe
  if (dist > 24) moveToward(bot, dx / dist, dz / dist, 3.6, dt);
  else if (dist < 7) moveToward(bot, -dx / dist, -dz / dist, 3.0, dt);
  else {
    if (now > ai.strafeFlipAt) { ai.strafeDir = G.rng() < 0.5 ? -1 : 1; ai.strafeFlipAt = now + 0.9 + G.rng() * 1.1; }
    moveToward(bot, (-dz / dist) * ai.strafeDir, (dx / dist) * ai.strafeDir, 1.7, dt);
    if (bot.speed2d < 0.4) ai.settleAt = now;
  }
  // at range, a bot ducks between bursts: harder to hit, and its own
  // hit zones drop to the crouched profile while it waits out the pause
  bot.crouching = dist > 16 && now < ai.pauseUntil;
  // fire in bursts once the reaction time has passed and the lane is clear
  const w = botWeapon(bot);
  if (now < ai.reactAt) return;
  if (w.mag <= 0) { startReload(bot, w); ai.pauseUntil = now + 0.4; return; }
  if (now < ai.pauseUntil) return;
  eyeOf(bot, _eye);
  _chest.set(target.pos.x, target.pos.y + (G.rng() < 0.22 ? 1.45 : 1.02), target.pos.z);
  _dir.subVectors(_chest, _eye).normalize();
  const settle = clamp(1 - bot.speed2d / 3.5, 0.25, 1);
  const err = 0.045 * (2 - settle) + dist * 0.0006;
  _dir.x += (G.rng() - 0.5) * err; _dir.y += (G.rng() - 0.5) * err * 0.7; _dir.z += (G.rng() - 0.5) * err;
  _dir.normalize();
  bot.fig.muzzle.getWorldPosition(_muzzle);
  const before = w.mag;
  shootHitscan(bot, w, _eye, _dir, 1 + bot.speed2d * 0.22, _muzzle);
  if (w.mag < before) {
    ai.burst++;
    const burstLen = w.def.auto ? 3 + (G.rng() * 3 | 0) : 1;
    if (ai.burst >= burstLen) { ai.burst = 0; ai.pauseUntil = now + 0.34 + G.rng() * 0.4; }
  }
}

function objective(bot, dt) {
  const ai = bot.ai, now = G.time;
  const bomb = G.bomb;
  bot.pitch = lerpAngle(bot.pitch, 0, 1 - Math.exp(-6 * dt));

  if (bot.team === TEAM.DEF && bomb.state === 'planted') {
    // converge on the planted charge; the nearest free defender defuses
    const d = Math.hypot(bomb.pos.x - bot.pos.x, bomb.pos.z - bot.pos.z);
    if (d > 1.1) { if (!ai.dest || ai.dest.x !== bomb.pos.x) setDest(bot, bomb.pos.x, bomb.pos.z); followPath(bot, dt, 4.4); }
    else {
      stopBot(bot, dt);
      bot.yaw = lerpAngle(bot.yaw, Math.atan2(-(bomb.pos.x - bot.pos.x), -(bomb.pos.z - bot.pos.z)), 1 - Math.exp(-8 * dt));
      if (now - bot.lastHitAt > 1.2) G.logic.push({ k: 'defusing', by: bot });
    }
    return;
  }
  if (bot.team === TEAM.ATK) {
    if (bomb.state === 'dropped') {
      // nearest attacker fetches the charge
      let nearest = null, nd = Infinity;
      for (const b of G.bots) if (b.alive && b.team === TEAM.ATK) { const d = Math.hypot(bomb.pos.x - b.pos.x, bomb.pos.z - b.pos.z); if (d < nd) { nd = d; nearest = b; } }
      if (G.player && G.player.alive) { const d = Math.hypot(bomb.pos.x - G.player.pos.x, bomb.pos.z - G.player.pos.z); if (d < nd) nearest = G.player; }
      if (nearest === bot) {
        const d = Math.hypot(bomb.pos.x - bot.pos.x, bomb.pos.z - bot.pos.z);
        if (d < 1.0) { G.logic.push({ k: 'bombPickup', by: bot }); return; }
        if (!ai.dest || ai.dest.x !== bomb.pos.x) setDest(bot, bomb.pos.x, bomb.pos.z);
        followPath(bot, dt, 4.5);
        return;
      }
    }
    if (bomb.carrier === bot) {
      const site = G.world.sites[ai.homeSite];
      const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
      if (d > 2.4) { if (!ai.dest || ai.dest.x !== site.x) setDest(bot, site.x, site.z); followPath(bot, dt, 4.4); }
      else {
        stopBot(bot, dt);
        ai.plantT += dt;
        if (ai.plantT >= 3.2) { ai.plantT = 0; G.logic.push({ k: 'plantRequest', site: ai.homeSite, by: bot }); }
      }
      return;
    }
    // otherwise push the assigned site, then hold a guard spot near it
    const site = G.world.sites[ai.homeSite];
    const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
    if (d > 7.5) { if (!ai.dest || ai.dest.x !== site.x) setDest(bot, site.x, site.z); followPath(bot, dt, 4.3); }
    else holdPost(bot, dt, site.x, site.z);
    return;
  }
  // defenders before the plant: hold posts, rotate on the late clock
  if (ai.post) {
    const d = Math.hypot(ai.post.x - bot.pos.x, ai.post.z - bot.pos.z);
    if (d > 0.8) { if (!ai.dest || ai.dest.x !== ai.post.x) setDest(bot, ai.post.x, ai.post.z); followPath(bot, dt, 4.3); }
    else {
      stopBot(bot, dt);
      bot.crouching = true;
      ai.scanBase = ai.post.face;
      bot.yaw = lerpAngle(bot.yaw, ai.scanBase + Math.sin(now * 0.45 + bot.walkPhase) * 0.5, 1 - Math.exp(-4 * dt));
    }
  }
}

function holdPost(bot, dt, x, z) {
  const ai = bot.ai;
  const d = Math.hypot(x - bot.pos.x, z - bot.pos.z);
  if (d > 2.2) { if (!ai.dest || ai.dest.x !== x) setDest(bot, x, z); followPath(bot, dt, 3.6); return; }
  stopBot(bot, dt);
  // face the likely approach: toward mid / the defender spawn side
  bot.yaw = lerpAngle(bot.yaw, Math.atan2(-(0 - bot.pos.x), -(-14 - bot.pos.z)) + Math.sin(G.time * 0.4 + bot.walkPhase) * 0.4, 1 - Math.exp(-4 * dt));
}

// ---- presentation: walk cycle, aim pitch, hit flash, death fall ----
export function poseBot(bot) { syncFigure(bot, 0); }

function syncFigure(bot, dt) {
  const fig = bot.fig;
  fig.group.position.copy(bot.pos);
  if (!bot.alive) {
    const k = clamp((G.time - bot.deadAt) / 0.4, 0, 1);
    fig.group.rotation.x = -Math.PI / 2 * k;
    fig.group.position.y = bot.pos.y + 0.12 * k;
    return;
  }
  fig.group.rotation.set(0, bot.yaw, 0);
  const sp = bot.speed2d;
  bot.walkPhase += dt * (2 + sp * 2.4);
  const swing = clamp(sp / 4, 0, 1) * 0.55;
  fig.legL.rotation.x = Math.sin(bot.walkPhase) * swing;
  fig.legR.rotation.x = -Math.sin(bot.walkPhase) * swing;
  fig.upper.rotation.x = bot.pitch * 0.8;
  fig.upper.position.y = 0.8 + (bot.crouching ? -0.34 : Math.abs(Math.sin(bot.walkPhase)) * 0.03 * clamp(sp / 4, 0, 1));
  fig.group.position.y = bot.pos.y - (bot.crouching ? 0.34 : 0);
  if (bot.hp < bot.lastHp) bot.flashT = 0.09;
  bot.lastHp = bot.hp;
  if (bot.flashT > 0) {
    bot.flashT -= dt;
    fig.torsoMat.emissive.setHex(0x661111);
  } else fig.torsoMat.emissive.setHex(0x000000);
}
