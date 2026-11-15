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
    x.strokeStyle = 'rgba(40,42,46,0.35)'; x.lineWidth = 2;
    x.strokeRect(1, 1, w - 2, h - 2);
  });
  const darkMetal = canvas(256, 256, (x, w, h) => {
    grain(x, w, h, '#3a3f46', '#26292f', 700, 0.3);
    x.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 5; i++) x.fillRect(0, i * 52 + 8, w, 3);
  });
  const asphalt = canvas(512, 512, (x, w, h) => {
    grain(x, w, h, '#43464c', '#2f3237', 2600, 0.3);
    x.strokeStyle = 'rgba(214,178,92,0.5)'; x.lineWidth = 5; x.setLineDash([26, 20]);
    x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke();
    x.setLineDash([]);
    x.fillStyle = 'rgba(230,230,225,0.06)';
    x.fillRect(0, 0, w, 26); x.fillRect(0, h - 26, w, 26);
  });
  const container = (base, dark) => canvas(256, 256, (x, w, h) => {
    grain(x, w, h, base, dark, 500, 0.22);
    for (let i = 0; i < 8; i++) {
      x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(i * 32 + 4, 0, 7, h);
      x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(i * 32 + 13, 0, 4, h);
    }
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, w, 10); x.fillRect(0, h - 10, w, 10);
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
  const sky = canvas(64, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1d2735');
    g.addColorStop(0.45, '#3d4c63');
    g.addColorStop(0.72, '#8a6a58');
    g.addColorStop(0.92, '#e08a52');
    g.addColorStop(1, '#f2a65e');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  sky.wrapS = sky.wrapT = THREE.ClampToEdgeWrapping;
  return { concrete, darkMetal, asphalt, crate, hazard, sky,
           containerRust: container('#9c4a34', '#74351f'),
           containerTeal: container('#2e6f6a', '#1d4a47'),
           containerOchre: container('#a87c33', '#7d5a22'),
           siteA: siteDecal('A', '#ff8c42'), siteB: siteDecal('B', '#37c8b4') };
}
