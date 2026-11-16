// Screenshot driver for the make.fun entry: serves game/ locally, drives
// headless Chromium over CDP, and captures each scene listed in shots.json
// as a 1280x720 JPEG into screenshots/. The game sets window.__shotReady
// once a tableau has rendered its warm-up frames.
//   node take-shots.mjs
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const PORT = 9334;
const BASE = 'http://localhost:8080';
const CHROME = process.env.CHROME_BIN ||
  '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', [join(root, 'serve.ts')], { stdio: 'ignore' });
const chrome = spawn(CHROME, [
  '--no-sandbox', '--disable-dev-shm-usage',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=1280,720', '--hide-scrollbars', '--mute-audio',
  `--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1',
  '--user-data-dir=/tmp/ashworks-chrome', 'about:blank',
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

// --- minimal CDP client over the built-in WebSocket ---
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
  on('Runtime.exceptionThrown', (p) => {
    const line = 'exception: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text);
    errors.push(line);
    console.error('PAGE ' + line);
  });
  on('Log.entryAdded', (p) => { if (p.entry.level === 'error') errors.push('log: ' + p.entry.text); });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

  const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
  for (const shot of shots) {
    await send('Page.navigate', { url: `${BASE}/${shot.query}` });
    await waitFor(async () => (await evaluate('window.__shotReady === true')) === true, 150000, `shot ${shot.name}`);
    await sleep(600);
    let quality = 85;
    for (;;) {
      const shotRes = await send('Page.captureScreenshot', { format: 'jpeg', quality, fromSurface: true });
      const file = join(root, 'screenshots', shot.name);
      writeFileSync(file, Buffer.from(shotRes.data, 'base64'));
      const size = statSync(file).size;
      console.log(`${shot.name}: ${size} bytes @ q${quality}`);
      if (size <= 262144 || quality <= 60) break;
      quality -= 15;
    }
  }
  if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
  else console.log('no page errors');
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill('SIGKILL');
  server.kill('SIGKILL');
}
