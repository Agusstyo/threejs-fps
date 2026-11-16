// Headless full-match logic test: loads the game, clicks Play, then lets the
// bots (and a teleported-along player carrier) play a whole match while the
// clock clamps keep rounds short. Asserts the match reaches matchover with
// eliminations along the way, and that no page error ever fires.
//   node test-match.mjs
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const PORT = 9335;
const BASE = 'http://localhost:8080';
const CHROME = process.env.CHROME_BIN ||
  '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', [join(root, 'serve.ts')], { stdio: 'ignore' });
const chrome = spawn(CHROME, [
  '--no-sandbox', '--disable-dev-shm-usage',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=640,360', '--hide-scrollbars', '--mute-audio',
  `--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1',
  '--user-data-dir=/tmp/ashworks-chrome-test', 'about:blank',
], { stdio: 'ignore' });

async function waitFor(fn, timeout, what) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${what}`);
    await sleep(250);
  }
}

let ws, msgId = 0;
const pending = new Map();
const listeners = new Map();
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
function on(method, fn) {
  if (!listeners.has(method)) listeners.set(method, []);
  listeners.get(method).push(fn);
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('evaluate failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

const errors = [];
let verdict = 'FAIL: did not finish';
try {
  await waitFor(async () => (await fetch(`${BASE}/index.html`)).ok, 10000, 'dev server');
  const target = await waitFor(async () => {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    return list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  }, 15000, 'chrome target');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    } else if (m.method && listeners.has(m.method)) {
      for (const fn of listeners.get(m.method)) fn(m.params);
    }
  };
  on('Runtime.exceptionThrown', (p) => errors.push('exception: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text)));
  on('Log.entryAdded', (p) => { if (p.entry.level === 'error') errors.push('log: ' + p.entry.text); });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });

  await send('Page.navigate', { url: `${BASE}/` });
  await waitFor(async () => (await evaluate('!!window.__ashworks')) === true, 30000, 'game boot');
  await evaluate(`document.getElementById('play').click()`);

  const phasesSeen = new Set();
  const deadCounted = new Set();
  let kills = 0, plants = 0, lastRound = 0, lastPhase = '';
  const t0 = Date.now();
  while (Date.now() - t0 < 9 * 60 * 1000) {
    const s = await evaluate(`(() => {
      const G = window.__ashworks;
      // keep the test brisk: shorten waits, never the fighting itself
      if (G.phase === 'buy' && G.phaseT > 1) G.phaseT = 1;
      if (G.phase === 'live' && G.roundTime > 12) G.roundTime = 12;
      if (G.phase === 'planted' && G.bomb.fuse > 8) G.bomb.fuse = 8;
      if (G.phase === 'over' && G.phaseT > 1) G.phaseT = 1;
      // walk the carrier (the player) to the attacked site once per round,
      // so plants, drops and defuses get exercised too
      if (G.phase === 'live' && G.bomb.carrier === G.player && !window.__testMoved) {
        const atk = G.bots.find((b) => b.team === 'atk');
        const site = G.world.sites[atk ? atk.ai.homeSite : 'A'];
        G.player.pos.set(site.x + 3, 0, site.z + 3);
        window.__testMoved = true;
      }
      if (G.phase === 'buy') window.__testMoved = false;
      const actors = [G.player, ...G.bots];
      return {
        phase: G.phase, round: G.round, score: { ...G.score },
        dead: actors.filter((a) => !a.alive).map((a) => a.name),
        planted: G.bomb.state === 'planted',
      };
    })()`);
    phasesSeen.add(s.phase);
    if (s.planted) plants++;
    if (s.round !== lastRound) { lastRound = s.round; deadCounted.clear(); }
    for (const name of s.dead) {
      const key = `${s.round}:${name}`;
      if (!deadCounted.has(key)) { deadCounted.add(key); kills++; }
    }
    if (s.phase !== lastPhase || s.round !== lastRound) {
      console.log(`t+${((Date.now() - t0) / 1000).toFixed(0)}s round ${s.round} phase ${s.phase} score ${s.score.atk}-${s.score.def} kills ${kills}`);
      lastPhase = s.phase;
    }
    if (s.phase === 'matchover') {
      const roundsPlayed = s.score.atk + s.score.def;
      const ok = roundsPlayed >= 5 && kills >= 5 && phasesSeen.has('buy') && phasesSeen.has('live') && phasesSeen.has('over');
      verdict = `${ok ? 'PASS' : 'FAIL'}: matchover after ${roundsPlayed} rounds, final ${s.score.atk}-${s.score.def}, ` +
        `${kills} eliminations, planted phase seen ${plants > 0 ? 'yes' : 'no'}, phases: ${[...phasesSeen].join(', ')}`;
      break;
    }
    await sleep(1000);
  }
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill('SIGKILL');
  server.kill('SIGKILL');
}
console.log(verdict);
if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exit(1); }
if (!verdict.startsWith('PASS')) process.exit(1);
console.log('no page errors');
