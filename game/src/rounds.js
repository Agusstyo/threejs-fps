// The round machine. Phases: buy (frozen, shop open) -> live (clock runs,
// elimination or plant decides) -> planted (fuse runs, defuse can steal it)
// -> over (banner, economy paid) -> next round or matchover at WIN_ROUNDS.
// The charge is carried by the player; bots fetch it if it drops.
import * as THREE from 'three';
import { G, TEAM, TEAM_NAME, WIN_ROUNDS, ROUND_TIME, BUY_TIME, BOMB_TIME, DEFUSE_TIME, START_MONEY, announce, feed } from './state.js';
import { createBot } from './bots.js';
import { makeWeapon, GRENADE_PRICE } from './weapons.js';
import { sfx } from './audio.js';
import { fxExplosion } from './fx.js';

let bombMesh = null, bombLight = null;

export function setupActors() {
  const w = G.world;
  G.player.pos.set(w.spawns.atk[0].x, 0, w.spawns.atk[0].z);
  G.bots = [];
  for (let i = 0; i < 3; i++) G.bots.push(createBot(TEAM.ATK, i, w.spawns.atk[i + 1]));
  for (let i = 0; i < 4; i++) G.bots.push(createBot(TEAM.DEF, i, w.spawns.def[i]));
  if (!bombMesh) {
    bombMesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x33302a, roughness: 0.6 }));
    body.position.y = 0.13; bombMesh.add(body);
    bombLight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3020 }));
    bombLight.position.y = 0.3; bombMesh.add(bombLight);
    bombMesh.visible = false;
    G.scene.add(bombMesh);
  }
}

function resetActor(a, spawn) {
  a.pos.set(spawn.x, 0, spawn.z);
  a.vy = 0; a.velX = 0; a.velZ = 0;
  a.hp = 100; a.alive = true; a.deadAt = 0;
  a.yaw = a.team === TEAM.ATK ? 0 : Math.PI; a.pitch = 0;
  a.crouching = false;
  for (const slot of ['primary', 'sidearm']) {
    const w = a.weapons[slot];
    if (w) { w.mag = w.def.mag; w.reserve = w.def.reserve; w.reloadingUntil = 0; w.bloomHeat = 0; }
  }
  if (a.fig) { a.fig.group.rotation.set(0, a.yaw, 0); a.fig.group.position.copy(a.pos); }
  if (a.ai) { a.ai.seen = null; a.ai.path = []; a.ai.dest = null; a.ai.plantT = 0; }
}

// Bots shop with the same prices as the player, in a fixed priority.
function botBuy(bot) {
  const tryBuy = (id, price) => {
    if (bot.money >= price && (!bot.weapons.primary || bot.weapons.primary.def.id !== id)) {
      bot.money -= price; bot.weapons.primary = makeWeapon(id); bot.current = 'primary'; return true;
    } return false;
  };
  if (bot.money >= 2500) tryBuy('longarm', 2500);
  else if (bot.money >= 1400) tryBuy('badger', 1400);
  else if (bot.money >= 1100 && G.rng() < 0.5) tryBuy('mule', 1100);
  if (bot.weapons.primary && bot.money >= 650 && bot.armor < 100) { bot.money -= 650; bot.armor = 100; }
  if (bot.weapons.primary && bot.grenades < 1 && bot.money >= GRENADE_PRICE + 600 && G.rng() < 0.45) {
    bot.money -= GRENADE_PRICE; bot.grenades = 1;
  }
}

export function startMatch() {
  G.score.atk = 0; G.score.def = 0; G.round = 1; G.winner = null;
  for (const a of [G.player, ...G.bots]) {
    a.money = START_MONEY;
    a.weapons.primary = null; a.weapons.sidearm = makeWeapon('kestrel');
    a.current = 'sidearm'; a.grenades = 0; a.armor = 0;
  }
  startRound();
}

export function startRound() {
  const w = G.world;
  resetActor(G.player, w.spawns.atk[0]);
  let ai = 1, di = 0;
  for (const b of G.bots) resetActor(b, b.team === TEAM.ATK ? w.spawns.atk[ai++] : w.spawns.def[di++]);
  // team plan: attackers commit to one site; defenders split 2/1/1
  const site = G.rng() < 0.55 ? 'A' : 'B';
  const postPlan = { A: 2, B: 1, mid: 1 };
  for (const b of G.bots) {
    botBuy(b);
    if (b.team === TEAM.ATK) { b.ai.homeSite = site; b.ai.post = null; }
    else {
      const zone = postPlan.A > 0 ? 'A' : postPlan.B > 0 ? 'B' : 'mid';
      if (zone === 'A') postPlan.A--; else if (zone === 'B') postPlan.B--; else postPlan.mid--;
      const posts = w.posts[zone];
      b.ai.post = posts[(Math.random() * posts.length) | 0];
      b.ai.homeSite = zone === 'mid' ? site : zone;
    }
  }
  G.bomb.state = 'carried';
  G.bomb.carrier = G.player;
  G.bomb.pos = null; G.bomb.site = null; G.bomb.fuse = 0;
  G.bomb.defuseProgress = 0; G.bomb.defuser = null;
  if (bombMesh) bombMesh.visible = false;
  G.phase = 'buy';
  G.phaseT = BUY_TIME;
  G.roundTime = ROUND_TIME;
  G.feed.length = 0;
  announce(`Round ${G.round}`, `Buy phase — ${TEAM_NAME.atk} attack Site ${site === 'A' ? 'A · Furnace Hall' : 'B · Depot'}`, BUY_TIME - 1);
}

// Place the charge mesh in the world (used when planted and by screenshots).
export function showBombAt(x, z) {
  if (!bombMesh) return;
  bombMesh.position.set(x, 0, z);
  bombMesh.visible = true;
  if (bombLight) bombLight.material.color.setHex(0xff3020);
}

function endRound(winner, reason) {
  G.score[winner]++;
  for (const a of [G.player, ...G.bots]) {
    a.money = Math.min(16000, a.money + (a.team === winner ? G.pay.win : G.pay.loss));
    if (!a.alive) { a.weapons.primary = null; a.current = 'sidearm'; a.grenades = 0; a.armor = 0; }
  }
  G.phase = 'over';
  G.phaseT = 4.6;
  const playerWon = winner === G.player.team;
  announce(`${TEAM_NAME[winner]} win the round`, reason, 4.2);
  if (playerWon) sfx.roundWin(); else sfx.roundLose();
  G.events.push({ k: 'roundEnd', winner, reason });
  if (G.score[winner] >= WIN_ROUNDS) G.winner = winner;
}

function plantCharge(site, by) {
  G.bomb.state = 'planted';
  G.bomb.site = site;
  G.bomb.pos = { x: by.pos.x, z: by.pos.z };
  G.bomb.fuse = BOMB_TIME;
  G.bomb.carrier = null;
  G.bomb.defuseProgress = 0; G.bomb.defuser = null;
  by.money = Math.min(16000, by.money + G.pay.plant);
  G.phase = 'planted';
  bombMesh.position.set(by.pos.x, 0, by.pos.z);
  bombMesh.visible = true;
  announce('Charge planted', `${BOMB_TIME} seconds — Wardens move to defuse`, 3);
  sfx.planted();
  feed(`${by.name} planted the charge at Site ${site}`);
  G.events.push({ k: 'planted', site });
}

let beepT = 0;

export function updateRounds(dt) {
  G.defuseInfo = null;
  // drain the logic channel: plant / pickup / defuse requests from actors
  let defusingNow = false;
  for (const e of G.logic.drain()) {
    if (e.k === 'plantRequest' && G.phase === 'live' && G.bomb.state === 'carried' && G.bomb.carrier === e.by && e.by.alive) {
      plantCharge(e.site, e.by);
    } else if (e.k === 'bombPickup' && G.bomb.state === 'dropped' && e.by.alive && e.by.team === TEAM.ATK) {
      G.bomb.state = 'carried'; G.bomb.carrier = e.by;
      if (bombMesh) bombMesh.visible = false;
      feed(`${e.by.name} recovered the charge`);
    } else if (e.k === 'defusing' && G.phase === 'planted' && e.by.alive) {
      if (!G.bomb.defuser || G.bomb.defuser === e.by) { G.bomb.defuser = e.by; defusingNow = true; }
    }
  }
  if (G.phase === 'planted') {
    if (defusingNow && G.bomb.defuser && G.bomb.defuser.alive) {
      G.bomb.defuseProgress += dt;
      G.defuseInfo = { label: `${G.bomb.defuser.name} is defusing…`, frac: G.bomb.defuseProgress / DEFUSE_TIME };
      if (G.bomb.defuseProgress >= DEFUSE_TIME) {
        G.bomb.state = 'done';
        if (bombMesh) bombMesh.visible = false;
        endRound(TEAM.DEF, 'Charge defused');
        return;
      }
    } else {
      G.bomb.defuseProgress = Math.max(0, G.bomb.defuseProgress - dt * 2);
      G.bomb.defuser = null;
    }
  }

  switch (G.phase) {
    case 'buy':
      G.phaseT -= dt;
      if (G.phaseT <= 0) {
        G.phase = 'live';
        announce('Round live', G.bomb.carrier === G.player ? 'You carry the charge — plant at a site' : 'Escort the charge carrier', 2.2);
      }
      break;
    case 'live': {
      G.roundTime -= dt;
      const atkAlive = countAlive(TEAM.ATK), defAlive = countAlive(TEAM.DEF);
      if (defAlive === 0) endRound(TEAM.ATK, 'Warden Line eliminated');
      else if (atkAlive === 0) endRound(TEAM.DEF, 'Ember Squad eliminated');
      else if (G.roundTime <= 0) endRound(TEAM.DEF, 'Time expired — no plant');
      break;
    }
    case 'planted': {
      G.bomb.fuse -= dt;
      beepT -= dt;
      const interval = G.bomb.fuse > 20 ? 1 : G.bomb.fuse > 10 ? 0.5 : 0.25;
      if (beepT <= 0) { beepT = interval; sfx.plantBeep(G.bomb.fuse <= 10 ? 2 : 1); }
      if (bombLight) bombLight.material.color.setHex(Math.sin(G.time * (G.bomb.fuse < 10 ? 18 : 7)) > 0 ? 0xff3020 : 0x551008);
      if (G.bomb.fuse <= 0) {
        G.bomb.state = 'done';
        if (bombMesh) {
          fxExplosion(bombMesh.position);
          sfx.explosion(bombMesh.position);
          bombMesh.visible = false;
        }
        endRound(TEAM.ATK, 'Charge detonated');
      }
      break;
    }
    case 'over':
      G.phaseT -= dt;
      if (G.phaseT <= 0) {
        if (G.winner) {
          G.phase = 'matchover';
          announce(`${TEAM_NAME[G.winner]} win the match`, `Final score ${G.score.atk} — ${G.score.def}. Press R to play again.`, 60);
          G.events.push({ k: 'matchEnd', winner: G.winner });
        } else {
          G.round++;
          startRound();
        }
      }
      break;
  }
  // the dropped charge sits in the world where its carrier fell
  if (G.bomb.state === 'dropped' && bombMesh) {
    bombMesh.position.set(G.bomb.pos.x, 0, G.bomb.pos.z);
    bombMesh.visible = true;
    if (bombLight) bombLight.material.color.setHex(0xffa020);
  }
}

function countAlive(team) {
  let n = 0;
  if (G.player.alive && G.player.team === team) n++;
  for (const b of G.bots) if (b.alive && b.team === team) n++;
  return n;
}
