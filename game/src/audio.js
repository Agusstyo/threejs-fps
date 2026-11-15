// All sound is synthesised with WebAudio: no audio files ship with the game.
// One shared context, created on the first user gesture. Every effect takes a
// world position and is attenuated (and slightly low-passed) by its distance
// to the listener, which main.js updates from the camera each frame.

let ctx = null;
let master = null;
const listener = { x: 0, y: 1.6, z: 0 };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

export function setListener(x, y, z) { listener.x = x; listener.y = y; listener.z = z; }

function spatial(pos, baseGain, cutoff) {
  if (!ctx || !pos) return { gain: baseGain, freq: cutoff };
  const d = Math.hypot(pos.x - listener.x, pos.y - listener.y, pos.z - listener.z);
  const g = baseGain / (1 + d * 0.14);
  const f = Math.max(500, cutoff - d * 55);
  return { gain: g, freq: f };
}

function noiseBuffer(seconds) {
  const len = Math.max(1, (ctx.sampleRate * seconds) | 0);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
let sharedNoise = null;

// A single percussive burst: filtered noise plus a low sine thump.
function burst(pos, { dur = 0.14, gain = 0.5, cutoff = 3800, thump = 160, when = 0 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const s = spatial(pos, gain, cutoff);
  if (s.gain < 0.004) return;
  if (!sharedNoise) sharedNoise = noiseBuffer(0.5);
  const src = ctx.createBufferSource(); src.buffer = sharedNoise;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = s.freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(s.gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filt).connect(g).connect(master);
  src.start(t0); src.stop(t0 + dur + 0.02);
  if (thump > 0) {
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(thump, t0);
    osc.frequency.exponentialRampToValueAtTime(45, t0 + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(s.gain * 0.7, t0);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(og).connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
}

function blip(freq, dur, gain, type = 'square', when = 0, slideTo = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator(); osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  shot(pos, heavy) { burst(pos, { dur: heavy ? 0.2 : 0.13, gain: heavy ? 0.65 : 0.5, cutoff: heavy ? 3000 : 4200, thump: heavy ? 130 : 170 }); },
  scatter(pos) { burst(pos, { dur: 0.26, gain: 0.8, cutoff: 2400, thump: 105 }); },
  dry() { blip(1900, 0.05, 0.12, 'square'); },
  reload() { blip(700, 0.05, 0.14, 'square'); blip(480, 0.05, 0.14, 'square', 0.16); blip(950, 0.06, 0.16, 'square', 0.34); },
  hit(head) { blip(head ? 1560 : 1150, 0.06, 0.2, 'sine'); },
  kill() { blip(880, 0.09, 0.2, 'sine'); blip(1318, 0.14, 0.2, 'sine', 0.07); },
  hurt() { burst(null, { dur: 0.1, gain: 0.25, cutoff: 900, thump: 90 }); },
  buy() { blip(1046, 0.07, 0.16, 'sine'); blip(1568, 0.1, 0.16, 'sine', 0.06); },
  denied() { blip(220, 0.12, 0.16, 'sawtooth'); },
  plantBeep(rate) { blip(1320, 0.05, 0.12, 'square'); if (rate > 1) blip(1320, 0.05, 0.1, 'square', 0.09); },
  planted() { blip(988, 0.1, 0.2, 'sine'); blip(988, 0.1, 0.2, 'sine', 0.16); blip(1480, 0.18, 0.2, 'sine', 0.32); },
  explosion(pos) { burst(pos, { dur: 0.9, gain: 1.0, cutoff: 1500, thump: 70 }); burst(pos, { dur: 0.5, gain: 0.6, cutoff: 700, thump: 50, when: 0.05 }); },
  grenadeThrow() { burst(null, { dur: 0.06, gain: 0.1, cutoff: 2000, thump: 0 }); },
  roundWin() { blip(659, 0.12, 0.18, 'triangle'); blip(880, 0.12, 0.18, 'triangle', 0.1); blip(1318, 0.22, 0.18, 'triangle', 0.2); },
  roundLose() { blip(392, 0.14, 0.18, 'triangle'); blip(330, 0.14, 0.18, 'triangle', 0.12); blip(262, 0.26, 0.18, 'triangle', 0.24); },
};
