// The one place game state lives. Every module reads and writes fields of G;
// nothing keeps a private copy of round, score or actor state. Rendering reads
// G, the fixed-step simulation writes it.
import { makeQueue, mulberry32 } from './util.js';

export const TEAM = { ATK: 'atk', DEF: 'def' };
export const TEAM_NAME = { atk: 'Ember Squad', def: 'Warden Line' };
export const WIN_ROUNDS = 5;          // first to 5 takes the match
export const ROUND_TIME = 100;        // seconds of live play per round
export const BUY_TIME = 15;           // frozen buy phase at round start
export const BOMB_TIME = 40;          // fuse once the charge is planted
export const PLANT_TIME = 3.2;        // channel to plant
export const DEFUSE_TIME = 5.0;       // channel to defuse
export const START_MONEY = 800;

export const G = {
  // three.js handles, set by main.js
  renderer: null, scene: null, camera: null,
  world: null,               // map.js result: colliders, sites, spawns, graph
  // clock / mode
  time: 0,                   // simulation seconds since match start
  mode: 'menu',              // menu | play | shot
  shotName: null,
  // round state machine: buy -> live -> planted -> over (-> matchover)
  phase: 'buy',
  phaseT: 0,                 // seconds left in buy/planted fuse, or elapsed in over
  roundTime: ROUND_TIME,
  round: 1,
  score: { atk: 0, def: 0 },
  winner: null,              // match winner team once decided
  // actors
  player: null,
  bots: [],
  grenades: [],
  // the charge (bomb): carried | dropped | planted | done
  bomb: { state: 'carried', carrier: null, pos: null, site: null, fuse: 0, defuseT: 0, defuser: null },
  // economy is per-actor (actor.money); these are the round-end awards
  pay: { win: 2700, loss: 1900, kill: 300, plant: 300 },
  // transient channels the HUD/audio drain each frame
  events: makeQueue(),       // {k:'kill'|'shot'|'plant'|...} presentation events
  logic: makeQueue(),        // game-logic requests the round machine drains each step
  recentShots: [],           // {x, z, team, t} — what bots can hear, pruned by time
  feed: [],                  // kill feed lines {text, t}
  banner: null,              // {title, sub, until} centre-screen message
  interact: null,            // {label, frac} contextual progress (planting)
  defuseInfo: null,          // {label, frac} while a defender channels a defuse
  rng: mulberry32(20261115),
  stats: { shots: 0, hits: 0, kills: 0 },
};

export function aliveActors(team) {
  const out = [];
  if (G.player && G.player.alive && (!team || G.player.team === team)) out.push(G.player);
  for (const b of G.bots) if (b.alive && (!team || b.team === team)) out.push(b);
  return out;
}

export function allActors() {
  const out = [];
  if (G.player) out.push(G.player);
  for (const b of G.bots) out.push(b);
  return out;
}

export function announce(title, sub, seconds) {
  G.banner = { title, sub: sub || '', until: G.time + seconds };
}

export function feed(text) {
  G.feed.push({ text, t: G.time });
  if (G.feed.length > 5) G.feed.shift();
}
