// Bootstrap and the main loop. The simulation runs at a fixed 60 Hz step
// (rounds, player, bots, grenades) and rendering reads the state it leaves:
// camera posing, view-model animation, effects and the HUD are per-frame.
import * as THREE from 'three';
import { G } from './state.js';
import { buildMap } from './map.js';
import { initFx, updateFx } from './fx.js';
import { createPlayer, initInput, updatePlayer, poseCamera, attachViewModels, refreshViewModel, currentWeapon } from './player.js';
import { buildViewModel, updateGrenades } from './weapons.js';
import { updateBot } from './bots.js';
import { setupActors, startMatch, updateRounds } from './rounds.js';
import { initHud, updateHud } from './hud.js';
import { setListener } from './audio.js';
import { applyShot, shotFrame } from './shots.js';
import { mulberry32 } from './util.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (params.get('seed')) G.rng = mulberry32(parseInt(params.get('seed'), 10) || 1);
G.shotName = shot;
G.mode = shot ? 'shot' : 'menu';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.24;
document.getElementById('game').appendChild(renderer.domElement);
G.renderer = renderer;

const scene = new THREE.Scene();
G.scene = scene;
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 320);
scene.add(camera);
G.camera = camera;

G.world = buildMap(scene);
G.player = createPlayer(G.world.spawns.atk[0]);
setupActors();
window.__ashworks = G;   // state handle for automated play-tests
attachViewModels(camera, buildViewModel);
initFx(scene, camera);
initHud();
initInput(renderer.domElement);
startMatch();

const menuEl = document.getElementById('menu');
if (shot) {
  menuEl.hidden = true;
  applyShot(shot);
} else {
  document.getElementById('play').addEventListener('click', () => {
    G.mode = 'play';
    menuEl.hidden = true;
    renderer.domElement.requestPointerLock();
  });
}
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && G.phase === 'matchover') {
    startMatch();
    refreshViewModel(G.player);
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const STEP = 1 / 60;
let acc = 0, last = performance.now();
let frames = 0;

function stepSim(dt) {
  G.time += dt;
  updateRounds(dt);
  updatePlayer(dt);
  for (const b of G.bots) updateBot(b, dt);
  updateGrenades(dt);
  while (G.recentShots.length && G.recentShots[0].t < G.time - 1.6) G.recentShots.shift();
}

const _specEye = new THREE.Vector3();
function render(dt) {
  const p = G.player;
  if (G.mode === 'menu') {
    // slow orbit over mid while the menu is up: the yard is the backdrop
    const t = performance.now() * 0.00004;
    camera.position.set(Math.sin(t) * 17, 6.5, Math.cos(t) * 17 - 2);
    camera.lookAt(0, 1.2, -4);
    if (p.vmGroup) p.vmGroup.visible = false;
  } else if (p.alive) {
    if (p.vmGroup) p.vmGroup.visible = true;
    poseCamera(camera, dt);
  } else {
    // spectate the first living teammate from their eyes
    if (p.vmGroup) p.vmGroup.visible = false;
    const spec = G.bots.find((b) => b.alive && b.team === p.team) || G.bots.find((b) => b.alive);
    if (spec) {
      G.spectateName = spec.name;
      camera.position.set(spec.pos.x, spec.pos.y + 1.52, spec.pos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(spec.pitch, spec.yaw, 0);
    }
  }
  if (p.vmWeaponId && currentWeapon(p) && p.vmWeaponId !== currentWeapon(p).def.id) refreshViewModel(p);
  setListener(camera.position.x, camera.position.y, camera.position.z);
  updateFx(dt, G.time, G.world.dynamics.smokeAt, G.world.dynamics.furnaceMat);
  updateHud();
  renderer.render(scene, camera);
  frames++;
  if (shot && frames === 40) window.__shotReady = true;
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.12, (now - last) / 1000);
  last = now;
  if (G.mode === 'shot') {
    // frozen tableau: time still flows for smoke, light and HUD effects
    G.time += dt;
    shotFrame(shot);
    render(dt);
    return;
  }
  acc += dt;
  while (acc >= STEP) { stepSim(STEP); acc -= STEP; }
  render(dt);
}
requestAnimationFrame(frame);
