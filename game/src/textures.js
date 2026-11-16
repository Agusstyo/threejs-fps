// Every texture is painted on a canvas at load: the game ships no image
// assets. One shared noise/concrete, asphalt with worn paint, ribbed
// container steel, crate planks, hazard striping and the two site decals.
import * as THREE from 'three';

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function grain(ctx, w, h, base, fleck, n, alpha) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = fleck;
    ctx.globalAlpha = Math.random() * alpha;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  ctx.globalAlpha = 1;
}

export function makeTextures() {
  const concrete = canvas(256, 256, (x, w, h) => {
    grain(x, w, h, '#757a80', '#565b61', 900, 0.25);
    // formwork panel seams and tie holes, so big walls read as cast slabs
    x.strokeStyle = 'rgba(40,42,46,0.4)'; x.lineWidth = 2;
    x.strokeRect(1, 1, w - 2, h - 2);
    x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.stroke();
    x.fillStyle = 'rgba(40,42,46,0.35)';
    for (const px of [w * 0.25, w * 0.75]) for (const py of [h * 0.25, h * 0.75]) {
      x.beginPath(); x.arc(px, py, 4, 0, Math.PI * 2); x.fill();
    }
    // weather streaks running down from the seams, grime along the base
    for (let i = 0; i < 7; i++) {
      x.fillStyle = 'rgba(48,46,42,0.10)';
      const sx = Math.random() * w;
      x.fillRect(sx, 0, 3 + Math.random() * 5, h * (0.4 + Math.random() * 0.5));
    }
    const g = x.createLinearGradient(0, h * 0.8, 0, h);
    g.addColorStop(0, 'rgba(30,28,25,0)'); g.addColorStop(1, 'rgba(30,28,25,0.35)');
    x.fillStyle = g; x.fillRect(0, h * 0.8, w, h * 0.2);
  });
  const darkMetal = canvas(256, 256, (x, w, h) => {
    grain(x, w, h, '#3a3f46', '#26292f', 700, 0.3);
    x.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 5; i++) x.fillRect(0, i * 52 + 8, w, 3);
  });
  const asphalt = canvas(512, 512, (x, w, h) => {
    grain(x, w, h, '#43464c', '#2f3237', 2600, 0.3);
    // oil stains and patched cracks darken the yard floor
    for (let i = 0; i < 6; i++) {
      const sx = Math.random() * w, sy = Math.random() * h, r = 24 + Math.random() * 52;
      const g = x.createRadialGradient(sx, sy, 2, sx, sy, r);
      g.addColorStop(0, 'rgba(16,16,20,0.4)'); g.addColorStop(1, 'rgba(16,16,20,0)');
      x.fillStyle = g; x.beginPath(); x.arc(sx, sy, r, 0, Math.PI * 2); x.fill();
    }
    x.strokeStyle = 'rgba(20,20,24,0.5)'; x.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      let px = Math.random() * w, py = Math.random() * h;
      x.moveTo(px, py);
      for (let j = 0; j < 5; j++) { px += (Math.random() - 0.5) * 70; py += Math.random() * 42; x.lineTo(px, py); }
      x.stroke();
    }
    // a tar seam crossing the tile, then the worn painted centre line
    x.fillStyle = 'rgba(22,22,26,0.55)'; x.fillRect(0, h * 0.22, w, 7);
    x.strokeStyle = 'rgba(214,178,92,0.5)'; x.lineWidth = 5; x.setLineDash([26, 20]);
    x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke();
    x.setLineDash([]);
    x.fillStyle = 'rgba(230,230,225,0.06)';
    x.fillRect(0, 0, w, 26); x.fillRect(0, h - 26, w, 26);
  });
  let containerSerial = 3;
  const container = (base, dark) => canvas(256, 256, (x, w, h) => {
    grain(x, w, h, base, dark, 500, 0.22);
    for (let i = 0; i < 8; i++) {
      x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(i * 32 + 4, 0, 7, h);
      x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(i * 32 + 13, 0, 4, h);
    }
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, w, 10); x.fillRect(0, h - 10, w, 10);
    // rust weep under the ribs and a stencilled fleet number by the door edge
    for (let i = 0; i < 8; i++) {
      x.fillStyle = 'rgba(70,32,18,0.20)';
      x.fillRect(i * 32 + 4, h * 0.3, 7, h * 0.7);
    }
    x.fillStyle = 'rgba(240,238,230,0.5)';
    x.font = '700 44px ui-monospace, monospace';
    x.textAlign = 'right';
    x.fillText(`EY-${String(containerSerial * 17 % 90 + 10)}`, w - 14, 58);
    containerSerial++;
  });
  const crate = canvas(128, 128, (x, w, h) => {
    grain(x, w, h, '#8a6a44', '#6d5334', 260, 0.25);
    x.strokeStyle = 'rgba(52,38,20,0.8)'; x.lineWidth = 5; x.strokeRect(3, 3, w - 6, h - 6);
    x.beginPath(); x.moveTo(3, 3); x.lineTo(w - 3, h - 3); x.moveTo(w - 3, 3); x.lineTo(3, h - 3); x.stroke();
  });
  const hazard = canvas(128, 128, (x, w, h) => {
    x.fillStyle = '#c9a227'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#22242a';
    for (let i = -2; i < 6; i++) {
      x.beginPath();
      x.moveTo(i * 32, h); x.lineTo(i * 32 + 32, 0); x.lineTo(i * 32 + 48, 0); x.lineTo(i * 32 + 16, h);
      x.fill();
    }
  });
  const siteDecal = (letter, color) => {
    const tex = canvas(256, 256, (x, w, h) => {
      x.clearRect(0, 0, w, h);
      x.strokeStyle = color; x.globalAlpha = 0.85; x.lineWidth = 10;
      x.beginPath(); x.arc(w / 2, h / 2, 100, 0, Math.PI * 2); x.stroke();
      x.fillStyle = color;
      x.font = '700 150px system-ui, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(letter, w / 2, h / 2 + 8);
      x.globalAlpha = 1;
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  };
  // Sphere UVs: canvas top is the zenith, the middle row is the horizon.
  // The sun sits low in the west-southwest, where the directional light is.
  // Detail stays subtle and fine-grained: broad shapes smear into rings
  // around the sphere's pole, so the sky is gradient, dither, stars, sun.
  const sky = canvas(512, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#131c2b');
    g.addColorStop(0.18, '#27354c');
    g.addColorStop(0.32, '#41536e');
    g.addColorStop(0.42, '#77655c');
    g.addColorStop(0.47, '#c47a4e');
    g.addColorStop(0.5, '#f2a65e');
    g.addColorStop(0.54, '#a86640');
    g.addColorStop(0.62, '#5f4030');
    g.addColorStop(1, '#2b211c');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // dither over the whole sky so the gradient cannot posterise into bands
    for (let i = 0; i < 5200; i++) {
      x.fillStyle = Math.random() < 0.5 ? 'rgba(255,235,210,0.05)' : 'rgba(8,10,16,0.05)';
      x.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
    }
    // first stars in the upper dark
    x.fillStyle = 'rgba(235,240,255,0.8)';
    for (let i = 0; i < 90; i++) {
      const sy = Math.random() * h * 0.28;
      x.globalAlpha = Math.random() * 0.55 * (1 - sy / (h * 0.34));
      x.fillRect(Math.random() * w, sy, 1.6, 1.6);
    }
    x.globalAlpha = 1;
    // the low sun: a broad warm bloom with a hard disc sitting in it.
    // Painted at both wrap offsets too: the sphere's UV seam sits in the
    // west, and an unwrapped bloom would show a hard edge there.
    const sunX = w * 0.10, sunY = h * 0.462;
    for (const ox of [-w, 0, w]) {
      const bloom = x.createRadialGradient(sunX + ox, sunY, 4, sunX + ox, sunY, 170);
      bloom.addColorStop(0, 'rgba(255,196,120,0.85)');
      bloom.addColorStop(0.35, 'rgba(255,150,80,0.32)');
      bloom.addColorStop(1, 'rgba(255,140,70,0)');
      x.fillStyle = bloom; x.fillRect(0, 0, w, h);
      x.fillStyle = '#ffd9a3';
      x.beginPath(); x.arc(sunX + ox, sunY, 15, 0, Math.PI * 2); x.fill();
    }
    // a few thin strata right at the horizon, lit from below
    for (let i = 0; i < 6; i++) {
      const cy = h * (0.40 + Math.random() * 0.07), cw = 26 + Math.random() * 60;
      const cx = Math.random() * w;
      x.fillStyle = 'rgba(255,170,115,0.13)';
      x.beginPath(); x.ellipse(cx, cy, cw, 1.6 + Math.random() * 1.6, 0, 0, Math.PI * 2); x.fill();
    }
  });
  sky.wrapS = sky.wrapT = THREE.ClampToEdgeWrapping;
  return { concrete, darkMetal, asphalt, crate, hazard, sky,
           containerRust: container('#9c4a34', '#74351f'),
           containerTeal: container('#2e6f6a', '#1d4a47'),
           containerOchre: container('#a87c33', '#7d5a22'),
           siteA: siteDecal('A', '#ff8c42'), siteB: siteDecal('B', '#37c8b4') };
}
