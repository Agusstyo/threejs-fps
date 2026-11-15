// Heads-up display: pure DOM over the canvas. Reads G once per frame, drains
// the presentation event queue (hitmarkers, hurt direction, lock state), and
// renders the buy menu while the buy phase runs. No game rules live here.
import { G, TEAM_NAME, BUY_TIME } from './state.js';
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { buyItem, currentWeapon, isLocked } from './player.js';
import { clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const el = {};
let hitmarkUntil = 0, hitmarkKill = false, hurtUntil = 0, hurtAngle = 0;
let feedRendered = -1;

const SHOP_ROWS = [
  { item: 'longarm', key: '1' }, { item: 'badger', key: '2' }, { item: 'mule', key: '3' },
  { item: 'frag', key: '4', name: 'Ember Frag', price: GRENADE_PRICE },
  { item: 'armor', key: '5', name: 'Plate Vest', price: ARMOR_PRICE },
];

export function initHud() {
  for (const id of ['timer', 'phaseLabel', 'scoreAtk', 'scoreDef', 'feed', 'hpFill', 'hpText', 'armorFill',
                    'money', 'wpnName', 'ammoMag', 'ammoReserve', 'grenades', 'crosshair', 'hitmarker',
                    'banner', 'bannerTitle', 'bannerSub', 'interact', 'interactLabel', 'interactFill',
                    'buyMenu', 'buyRows', 'buyTimer', 'vignette', 'hurtDir', 'bombTag', 'spectate', 'lockTip'])
    el[id] = $(id);
  el.buyRows.innerHTML = '';
  for (const row of SHOP_ROWS) {
    const def = WEAPONS[row.item];
    const div = document.createElement('button');
    div.className = 'buy-row';
    div.dataset.item = row.item;
    div.innerHTML = `<span class="buy-key">${row.key}</span><span class="buy-name">${def ? def.name : row.name}</span><span class="buy-price">$${def ? def.price : row.price}</span>`;
    div.addEventListener('click', () => { if (G.phase === 'buy') buyItem(G.player, row.item); });
    el.buyRows.appendChild(div);
  }
}

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
}

export function updateHud() {
  const p = G.player;
  if (!p) return;
  // drain presentation events
  for (const e of G.events.drain()) {
    if (e.k === 'hit') { hitmarkUntil = G.time + 0.14; hitmarkKill = e.killed; }
    else if (e.k === 'playerHurt') {
      hurtUntil = G.time + 0.7;
      if (e.from) hurtAngle = Math.atan2(-(e.from.x - p.pos.x), -(e.from.z - p.pos.z)) - p.yaw;
    }
  }
  // top centre: phase + clock + score
  let clock = '', phase = '';
  if (G.phase === 'buy') { clock = fmtTime(G.phaseT); phase = 'BUY PHASE'; }
  else if (G.phase === 'live') { clock = fmtTime(G.roundTime); phase = `ROUND ${G.round}`; }
  else if (G.phase === 'planted') { clock = fmtTime(G.bomb.fuse); phase = 'CHARGE PLANTED'; }
  else if (G.phase === 'over') { clock = '—'; phase = 'ROUND OVER'; }
  else if (G.phase === 'matchover') { clock = '—'; phase = 'MATCH OVER'; }
  el.timer.textContent = clock;
  el.phaseLabel.textContent = phase;
  el.timer.classList.toggle('danger', G.phase === 'planted' || (G.phase === 'live' && G.roundTime < 15));
  el.scoreAtk.textContent = G.score.atk;
  el.scoreDef.textContent = G.score.def;
  el.bombTag.hidden = G.phase !== 'planted';
  if (G.phase === 'planted') el.bombTag.textContent = `⚠ CHARGE AT SITE ${G.bomb.site} — ${fmtTime(G.bomb.fuse)}`;

  // vitals + economy
  el.hpFill.style.width = `${clamp(p.hp, 0, 100)}%`;
  el.hpFill.classList.toggle('low', p.hp <= 30);
  el.hpText.textContent = Math.ceil(p.hp);
  el.armorFill.style.width = `${clamp(p.armor, 0, 100)}%`;
  el.money.textContent = `$${p.money}`;
  const w = currentWeapon(p);
  el.wpnName.textContent = w ? w.def.name : '—';
  el.ammoMag.textContent = w ? w.mag : '–';
  el.ammoReserve.textContent = w ? `/ ${w.reserve}` : '';
  el.ammoMag.classList.toggle('empty', !!w && w.mag === 0);
  el.grenades.textContent = p.grenades > 0 ? `✸ Frag × ${p.grenades} (G)` : '';

  // crosshair bloom follows the same numbers the spread model uses
  const bloom = 7 + p.speed2d * 2.6 + (w ? w.bloomHeat * 16 : 0) + (p.onGround ? 0 : 7);
  el.crosshair.style.setProperty('--sp', `${bloom.toFixed(1)}px`);
  el.crosshair.style.opacity = p.alive ? 1 : 0;
  el.hitmarker.style.opacity = G.time < hitmarkUntil ? 1 : 0;
  el.hitmarker.classList.toggle('kill', hitmarkKill && G.time < hitmarkUntil);

  // hurt vignette + direction wedge
  const hurtK = clamp((hurtUntil - G.time) / 0.7, 0, 1);
  el.vignette.style.opacity = Math.max(hurtK * 0.55, p.hp <= 30 && p.alive ? 0.25 + Math.sin(G.time * 4) * 0.06 : 0);
  el.hurtDir.style.opacity = hurtK;
  el.hurtDir.style.transform = `translate(-50%,-50%) rotate(${-hurtAngle}rad)`;

  // banner
  if (G.banner && G.time < G.banner.until) {
    el.banner.hidden = false;
    el.bannerTitle.textContent = G.banner.title;
    el.bannerSub.textContent = G.banner.sub;
  } else el.banner.hidden = true;

  // interact / defuse progress
  const inter = G.interact || G.defuseInfo;
  if (inter) {
    el.interact.hidden = false;
    el.interactLabel.textContent = inter.label;
    el.interactFill.style.width = `${clamp(inter.frac * 100, 0, 100)}%`;
  } else el.interact.hidden = true;

  // kill feed (re-render only when it changes)
  if (G.feed.length !== feedRendered) {
    feedRendered = G.feed.length;
    el.feed.innerHTML = G.feed.filter((f) => G.time - f.t < 6).map((f) => `<div>${f.text}</div>`).join('');
  }

  // buy menu
  const buying = G.phase === 'buy' && p.alive;
  el.buyMenu.hidden = !buying;
  if (buying) {
    el.buyTimer.textContent = `Buy closes in ${Math.ceil(G.phaseT)}s — keys 1–5 or click`;
    for (const row of el.buyRows.children) {
      const item = row.dataset.item;
      const def = WEAPONS[item];
      const price = def ? def.price : item === 'frag' ? GRENADE_PRICE : ARMOR_PRICE;
      const owned = (def && p.weapons.primary && p.weapons.primary.def.id === item) ||
                    (item === 'armor' && p.armor >= 100) || (item === 'frag' && p.grenades >= 2);
      row.classList.toggle('owned', !!owned);
      row.classList.toggle('poor', !owned && p.money < price);
    }
  }

  // spectate + pointer-lock hints
  el.spectate.hidden = p.alive || G.mode !== 'play';
  if (!p.alive && G.spectateName) el.spectate.textContent = `You are down — spectating ${G.spectateName}. The round plays out.`;
  el.lockTip.hidden = !(G.mode === 'play' && p.alive && !isLocked() && G.shotName === null);
}
