// Screenshot scenes. The competition's screenshots are real renders of this
// code in a browser; these tableaux pose a live match at three beats — the
// buy phase, a mid-round fight, and a planted charge — with fixed positions
// so the same URL always renders the same frame. ?shot=start|play|end
import * as THREE from 'three';
import { G, announce, feed } from './state.js';
import { makeWeapon } from './weapons.js';
import { fxTracer, fxImpact } from './fx.js';
import { poseBot } from './bots.js';
import { showBombAt } from './rounds.js';
import { eyePos } from './player.js';

function faceToward(a, x, z) { a.yaw = Math.atan2(-(x - a.pos.x), -(z - a.pos.z)); }
function place(a, x, z, tx, tz) {
  a.pos.set(x, 0, z);
  if (tx !== undefined) faceToward(a, tx, tz);
  if (a.fig) poseBot(a);
}
function giveLongarm(a, mag) {
  a.weapons.primary = makeWeapon('longarm');
  a.current = 'primary';
  a.weapons.primary.mag = mag;
}

let shotTarget = null, shotShooter = null, lastTracerAt = -9, lastHitAt = -9;
const _from = new THREE.Vector3(), _to = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();

export function applyShot(name) {
  const p = G.player;
  const atk = G.bots.filter((b) => b.team === 'atk');
  const def = G.bots.filter((b) => b.team === 'def');
  if (name === 'start') {
    G.phase = 'buy'; G.phaseT = 11; G.round = 1;
    place(p, 0.5, 15.5, -18, -2); p.pitch = -0.02;
    place(atk[0], -8, 9, -21, -1);
    place(atk[1], 3.5, 8, -2, -8);
    place(atk[2], -6, 17.5, -16, 6);
    announce('Round 1', 'Buy phase — Ember Squad attack Site A · Furnace Hall', 9999);
  } else if (name === 'play') {
    G.phase = 'live'; G.round = 4; G.roundTime = 63;
    G.score.atk = 2; G.score.def = 1;
    G.banner = null;
    giveLongarm(p, 24); p.money = 1650; p.hp = 72; p.armor = 40;
    place(p, 26, 7, 23, -7); p.pitch = -0.03;
    place(def[0], 23.5, -3.5, 26, 7);
    place(def[1], 19, -6, 26, 7);
    def[1].crouching = true; poseBot(def[1]);
    place(def[2], 26.5, -12.5, 26, 7);
    place(def[3], 20, -15.5, 24, -4);
    giveLongarm(def[0], 30); giveLongarm(def[1], 30); giveLongarm(def[2], 30);
    place(atk[0], 21.5, 3.5, 22, -6);
    place(atk[1], 30.5, 12, 24, 0);
    shotTarget = def[0];
    shotShooter = p;
    feed('Vex ▸ Moss');
    feed('You ▸ Hale (headshot)');
  } else if (name === 'end') {
    G.phase = 'planted'; G.round = 6;
    G.score.atk = 3; G.score.def = 2;
    G.bomb.state = 'planted'; G.bomb.site = 'A';
    G.bomb.pos = { x: -20.5, z: -5.2 }; G.bomb.fuse = 12.4;
    showBombAt(-20.5, -5.2);
    giveLongarm(p, 17); p.money = 2900; p.hp = 45; p.armor = 15;
    place(p, -21.2, 3.8, -20.5, -5.2); p.pitch = -0.02;
    place(def[0], -18.6, -3.1, -20.5, -5.2);
    def[0].crouching = true; poseBot(def[0]);
    place(atk[0], -24.5, -6, -14, -4);
    place(atk[1], -19, -13.2, -18, 0);
    G.defuseInfo = { label: 'Hale is defusing…', frac: 0.45 };
    announce('Charge planted', 'A Warden is on the defuse — hold the site', 9999);
  } else if (name === 'overlook') {
    G.phase = 'live'; G.round = 5; G.roundTime = 47;
    G.score.atk = 2; G.score.def = 2;
    G.banner = null;
    giveLongarm(p, 26); p.money = 3400; p.hp = 88; p.armor = 65;
    place(p, 9.5, -2, -8, -9); p.pos.y = 2.8; p.pitch = -0.13;
    place(atk[0], 1.5, 4.5, 0, -6);
    place(atk[1], 7.5, 2.5, 5, -6);
    place(atk[2], -8, 10, -6, -2);
    place(def[0], -4.5, -7.5, 1, 4);
    place(def[1], 6, -10.5, 2, 2);
    place(def[2], 12, -14, 4, -2);
    place(def[3], -12, -16, -4, -4);
    giveLongarm(atk[0], 30); giveLongarm(def[0], 30);
    shotTarget = def[0];
    shotShooter = atk[0];
    feed('Rook ▸ Ivers');
    feed('Hale: contact — the yard');
  }
}

// Keeps the action tableaux alive: a tracer and a hitmarker on a slow loop.
// In 'play' the shooter is the player; in 'overlook' it is the lead attacker
// trading fire with the defender below the catwalk.
export function shotFrame(name) {
  if ((name !== 'play' && name !== 'overlook') || !shotTarget || !shotShooter) return;
  const s = shotShooter;
  if (G.time - lastTracerAt > 0.05) {
    lastTracerAt = G.time;
    if (s.isPlayer) eyePos(s, _from);
    else _from.set(s.pos.x, s.pos.y + 1.52, s.pos.z);
    _fwd.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    _right.set(-_fwd.z, 0, _fwd.x);
    _from.addScaledVector(_fwd, 0.6).addScaledVector(_right, 0.22); _from.y -= 0.18;
    _to.set(shotTarget.pos.x, shotTarget.pos.y + 1.05, shotTarget.pos.z);
    fxTracer(_from, _to);
    fxImpact(_to);
  }
  if (name === 'play' && G.time - lastHitAt > 1.4) {
    lastHitAt = G.time;
    G.events.push({ k: 'hit', head: false, killed: false });
  }
}
