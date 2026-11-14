// Space & lunar environments + effects.
import { Bitmap, P, save, rng, gradient, rampDither, stars, mix, bayer, fbm, sphere, sheet } from './lib.mjs';
import { landValue } from './worldmap.mjs';
import { drawText, measure } from './font.mjs';

const D2R = Math.PI / 180;

// --------------------------------------------------------------------- Earth
export function earth(size, lat0 = 22, lon0 = -105, opts = {}) {
  const pad = 4;
  const b = new Bitmap(size + pad * 2, size + pad * 2);
  const r = size / 2, cx = r + pad, cy = r + pad;
  const L = norm([-0.62, -0.32, 0.72]);
  const p0 = lat0 * D2R, l0 = lon0 * D2R;
  // atmosphere halo
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const d = Math.hypot(x - cx + 0.5, y - cy + 0.5);
    if (d > r && d < r + pad) {
      const lit = ((x - cx) * L[0] + (y - cy) * L[1]) / d;
      const a = (1 - (d - r) / pad) * (0.4 + Math.max(0, lit) * 0.6);
      if (bayer(x, y) < a) b.set(x, y, mix(P.blue[6], P.space[9], 0.4));
    }
  }
  sphere(b, cx, cy, r, (nx, ny, nz, x, y) => {
    const X = nx, Y = -ny;
    const rho = Math.sqrt(X * X + Y * Y);
    const c = Math.asin(Math.min(1, rho));
    let lat, lon;
    if (rho < 1e-6) { lat = p0; lon = l0; } else {
      lat = Math.asin(Math.cos(c) * Math.sin(p0) + (Y * Math.sin(c) * Math.cos(p0)) / rho);
      lon = l0 + Math.atan2(X * Math.sin(c), rho * Math.cos(c) * Math.cos(p0) - Y * Math.sin(c) * Math.sin(p0));
    }
    const latD = lat / D2R, lonD = lon / D2R;
    const lit = nx * L[0] + ny * L[1] + nz * L[2];
    const land = landValue(latD, lonD) + (fbm(lonD * 0.25, latD * 0.25, 3, 3) - 0.5) * 0.5 > 0.5;
    const cloud = fbm(lonD * 0.06 + 10, latD * 0.11, 8, 4) + Math.abs(Math.sin(latD * D2R * 3)) * 0.08;
    const ice = Math.abs(latD) > 68;
    let col;
    const light = Math.max(0, lit);
    if (ice) col = rampDither([P.grey[5], P.grey[7], P.grey[9], '#ffffff'], light * 1.1, x, y);
    else if (land) {
      const desert = Math.abs(latD) > 14 && Math.abs(latD) < 34 && fbm(lonD * 0.1, latD * 0.1, 2, 2) > 0.42;
      col = rampDither(desert ? [P.brick[2], P.brick[4], P.brick[5], P.brick[6], P.brick[7]] : [P.green[1], P.green[2], P.green[3], P.green[4], P.green[5]], light * 1.05, x, y);
    } else col = rampDither([P.space[1], P.water[1], P.water[2], P.water[3], P.water[4], P.water[5], P.blue[6]], light * 1.05, x, y);
    if (cloud > 0.635 && !opts.noClouds) col = rampDither([P.grey[3], P.grey[6], P.grey[8], '#ffffff'], light * 1.15, x, y);
    // night side city lights
    if (lit < -0.05 && land && !ice && ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 7 === 0)) col = P.gold[6];
    // limb glow
    if (nz < 0.22 && lit > -0.1) col = mix(col, P.blue[6], 0.45);
    return col;
  });
  return b;
}
function norm(v) { const l = Math.hypot(...v); return v.map((c) => c / l); }

// ---------------------------------------------------------------------- Moon
const MARIA = [
  [-0.55, 0.0, 0.3, 0.46], [-0.25, -0.38, 0.26, 0.2], [0.12, -0.38, 0.14, 0.13], [0.28, -0.1, 0.19, 0.15],
  [0.65, -0.3, 0.1, 0.09], [0.55, 0.12, 0.12, 0.15], [0.35, 0.26, 0.08, 0.08], [-0.18, 0.32, 0.17, 0.12],
  [-0.48, 0.38, 0.09, 0.09], [0.0, -0.68, 0.42, 0.06], [0.0, -0.15, 0.07, 0.06],
];
export function moon(size, opts = {}) {
  const pad = 2;
  const b = new Bitmap(size + pad * 2, size + pad * 2);
  const r = size / 2, c = r + pad;
  const L = norm(opts.light ?? [-0.5, -0.25, 0.83]);
  sphere(b, c, c, r, (nx, ny, nz, x, y) => {
    let m = 0;
    const wob = (fbm(nx * 4 + 7, ny * 4, 21, 3) - 0.5) * 0.35;
    for (const [mx, my, rx, ry] of MARIA) { const d = Math.sqrt(((nx - mx) / rx) ** 2 + ((ny - my) / ry) ** 2) + wob; m = Math.max(m, Math.min(1, Math.max(0, (1.25 - d) / 0.55))); }
    const lit = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    let t = 0.22 + lit * 0.85 - m * 0.2 + (fbm(nx * 10, ny * 10, 5, 2) - 0.5) * 0.18;
    // craters
    const cr = fbm(nx * 18 + 3, ny * 18, 13, 2);
    if (cr > 0.7) t -= 0.12; else if (cr > 0.66) t += 0.08;
    // Tycho & Copernicus bright
    for (const [tx, ty, tr] of [[-0.12, 0.68, 0.05], [-0.28, -0.12, 0.045], [-0.6, -0.2, 0.03]]) { const d = Math.hypot(nx - tx, ny - ty); if (d < tr) t += 0.35; else if (tx === -0.12 && d < 0.5 && Math.abs(Math.atan2(ny - ty, nx - tx) * 6 % 1) < 0.12) t += 0.08; }
    if (lit <= 0.02) t = 0.04 + (bayer(x, y) < 0.15 ? 0.04 : 0);
    return rampDither([P.regolith[1], P.regolith[2], P.regolith[3], P.regolith[4], P.regolith[5], P.regolith[6], P.regolith[7], P.regolith[8], P.regolith[9], P.regolith[10]], t, x, y);
  });
  return b;
}

// -------------------------------------------------------------- lunar surface
function crater(b, cx, cy, rx, ry, sun = -1) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) {
      const shade = dx * sun; // inner wall facing away from sun is lit
      const p = b.get(x, y);
      const base = P.regolith.indexOf(rgbHex(p));
      const t = 0.42 + shade * 0.32 - (1 - d) * 0.05;
      b.set(x, y, rampDither(P.regolith.slice(2, 9), t, x, y));
      void base;
    } else if (d < 1.18) {
      b.set(x, y, rampDither(P.regolith.slice(5, 11), 0.5 - dx * sun * 0.4, x, y));
    }
  }
}
function rgbHex(p) { return '#' + p.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join(''); }

function rock(b, x, y, s, sun = -1) {
  b.ellipse(x + s * 0.8 * -sun, y + 1, s * 1.2, s * 0.35, P.regolith[1]);
  b.ellipse(x, y - s * 0.4, s, s * 0.7, (px, py, nx, ny) => rampDither(P.regolith.slice(2, 10), 0.5 + nx * sun * 0.45 - ny * 0.25, px, py));
}

export function lunarSurface(site) {
  const W = 480, H = 270;
  const b = new Bitmap(W, H);
  const r = rng(site === 'pole' ? 301 : site === 'marius' ? 302 : 303);
  const horizon = site === 'pole' ? 150 : 140;
  gradient(b, 0, 0, W, horizon + 20, [P.space[0], P.space[0], P.space[1]]);
  stars(b, 90, 404, { y1: horizon, colors: ['#4a4a64', '#7070a0', '#a0a0c8'] });
  // Earth in sky
  const ex = site === 'pole' ? 340 : site === 'marius' ? 120 : 360, ey = site === 'pole' ? horizon - 8 : site === 'marius' ? 60 : 52;
  const e = earth(34, 20, -100);
  b.blit(e, ex - 21, ey - 21);
  // distant mountains
  for (let x = 0; x < W; x++) {
    const amp = site === 'pole' ? 34 : site === 'marius' ? 14 : 10;
    const hy = horizon - Math.round(fbm(x * 0.012, 1, site.length, 4) * amp) - (site === 'pole' ? 8 : 0);
    for (let y = hy; y < horizon + 10; y++) b.set(x, y, rampDither(site === 'pole' ? [P.regolith[6], P.regolith[4], P.regolith[2]] : [P.regolith[7], P.regolith[6], P.regolith[5]], (y - hy) / 30 + (fbm(x * 0.08, y * 0.08, 3, 2) - 0.5) * 0.4, x, y));
  }
  // marius domes
  if (site === 'marius') for (const [dx, dw] of [[80, 60], [300, 90], [420, 50]]) for (let x = dx - dw / 2; x < dx + dw / 2; x++) { const t = (x - dx) / (dw / 2); const hy = horizon + 2 - Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * 12); for (let y = hy; y < horizon + 6; y++) b.set(x, y, rampDither([P.regolith[8], P.regolith[6], P.regolith[5]], 0.3 + t * 0.4, x, y)); }
  // ground
  for (let y = horizon + 6; y < H; y++) for (let x = 0; x < W; x++) {
    const t = 0.62 - (y - horizon) / (H - horizon) * 0.22 + (fbm(x * 0.07, y * 0.12, 77, 3) - 0.5) * 0.35;
    b.set(x, y, rampDither(site === 'pole' ? P.regolith.slice(2, 9) : P.regolith.slice(3, 10), t, x, y));
  }
  // craters
  const nC = site === 'pole' ? 16 : 12;
  for (let i = 0; i < nC; i++) {
    const cy = r.int(horizon + 14, H - 10), persp = (cy - horizon) / (H - horizon);
    const rx = r.int(6, 30) * (0.4 + persp);
    crater(b, r.int(0, W), cy, rx, rx * 0.3, -1);
  }
  if (site === 'marius') { // lava-tube skylight pit
    b.ellipse(392, 196, 26, 8, P.regolith[0]); b.ellipse(392, 195, 22, 6, P.ink);
    for (let x = 366; x < 418; x++) b.set(x, 188 + Math.round(Math.abs(x - 392) / 6), P.regolith[8]);
  }
  if (site === 'pole') { // permanently shadowed crater region (very dark)
    b.ellipse(400, 206, 70, 16, (x, y) => rampDither([P.ink, P.regolith[0], P.regolith[1]], (x - 330) / 160, x, y));
    for (let x = 330; x < 470; x++) b.set(x, 190 + Math.round(Math.abs(x - 400) / 9), P.regolith[7]);
  }
  for (let i = 0; i < 40; i++) { const y = r.int(horizon + 10, H - 2); rock(b, r.int(0, W), y, 1 + (y - horizon) / 40 * r(), site === 'pole' ? -1.4 : -1); }
  // long shadows at pole (low sun)
  if (site === 'pole') for (let y = horizon + 6; y < H; y++) for (let x = 0; x < W; x++) if (fbm(x * 0.02, y * 0.05, 88, 2) > 0.62 && bayer(x, y) < 0.7) b.set(x, y, mix(b.get(x, y), P.ink, 0.5));
  save(b, `lunar/surface_${site}.png`);
}

// -------------------------------------------------------------------- effects
function flameFrames() {
  const frames = [];
  const r = rng(5);
  for (let f = 0; f < 4; f++) {
    const b = new Bitmap(16, 40);
    const len = 30 + r.int(0, 8);
    for (let y = 0; y < len; y++) {
      const t = y / len;
      const half = (1 - t) * 6 + Math.sin(y * 0.9 + f) * 0.9 + (y < 4 ? y * 0.5 - 1.5 : 0);
      for (let x = Math.round(8 - half); x <= Math.round(7 + half); x++) {
        const u = Math.abs(x - 7.5) / Math.max(1, half);
        const v = t + u * 0.5;
        b.set(x, y, v < 0.25 ? '#ffffff' : v < 0.45 ? P.gold[7] : v < 0.65 ? P.gold[5] : v < 0.85 ? P.orange[4] : bayer(x, y + f) < 0.5 ? P.red[3] : null);
      }
    }
    frames.push(b);
  }
  return frames;
}
function smokeFrames() {
  const frames = [];
  for (let f = 0; f < 6; f++) {
    const b = new Bitmap(32, 32);
    const rr = 5 + f * 2.2;
    const fade = 1 - f / 7;
    for (const [ox, oy, k] of [[0, 0, 1], [-rr * 0.45, rr * 0.2, 0.7], [rr * 0.45, rr * 0.25, 0.7], [0, -rr * 0.35, 0.75]])
      b.ellipse(16 + ox, 16 + oy, rr * k, rr * k * 0.9, (x, y, nx, ny) => (bayer(x, y) < fade * 1.1 ? rampDither([P.grey[9], P.grey[8], P.grey[6], P.grey[5]], 0.15 + ny * 0.35 + nx * 0.2 + (1 - fade) * 0.3, x, y) : null));
    frames.push(b);
  }
  return frames;
}
function dustFrames() {
  const frames = [];
  const r = rng(8);
  for (let f = 0; f < 6; f++) {
    const b = new Bitmap(48, 16);
    const spread = 6 + f * 4;
    for (let i = 0; i < 60; i++) {
      const s = r() < 0.5 ? -1 : 1;
      const d = r() * spread;
      const x = 24 + s * d, y = 15 - r() * (3 + f) * (1 - d / (spread + 1));
      if (r() < 1 - f / 7) b.set(Math.round(x), Math.round(y), r() < 0.5 ? P.regolith[8] : P.regolith[6]);
    }
    frames.push(b);
  }
  return frames;
}
function plasmaFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const b = new Bitmap(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const dx = x - 32, dy = y - 40;
      const ang = Math.atan2(dy, dx);
      const d = Math.hypot(dx, dy);
      if (dy < -6) continue;
      const rr = 22 + Math.sin(ang * 5 + f * 1.7) * 2;
      if (d > rr - 5 && d < rr + 4 + f % 2) {
        const t = Math.abs(d - rr) / 6;
        if (bayer(x + f, y) < 1 - t) b.set(x, y, t < 0.3 ? '#fff4e0' : t < 0.6 ? P.orange[5] : P.red[4]);
      }
    }
    // trailing streaks upward
    for (let k = 0; k < 14; k++) { const sx = 12 + ((k * 37 + f * 11) % 40); for (let y = 0; y < 28; y++) if ((y + f * 3 + k) % 5 < 3 && bayer(sx, y) < y / 40) b.set(sx, y, y > 18 ? P.orange[4] : P.red[3]); }
    frames.push(b);
  }
  return frames;
}

export function buildSpace() {
  save(earth(180), 'backgrounds/earth_big.png');
  save(earth(64), 'backgrounds/earth_med.png');
  save(earth(28, 20, -100), 'backgrounds/earth_small.png');
  save(moon(200), 'backgrounds/moon_big.png');
  save(moon(80), 'backgrounds/moon_med.png');
  save(moon(30), 'backgrounds/moon_small.png');
  // star layers
  const s1 = new Bitmap(480, 270); stars(s1, 420, 101, { colors: ['#30305a', '#48487a', '#6a6a9a'] }); save(s1, 'backgrounds/stars_far.png');
  const s2 = new Bitmap(480, 270); stars(s2, 90, 102, { big: 0.25 }); save(s2, 'backgrounds/stars_near.png');
  // deep-space backdrop with faint milky band
  const bg = new Bitmap(480, 270);
  for (let y = 0; y < 270; y++) for (let x = 0; x < 480; x++) {
    const band = Math.exp(-(((y - 135) - (x - 240) * 0.35) ** 2) / 2600) * fbm(x * 0.03, y * 0.03, 55, 4);
    bg.set(x, y, rampDither([P.space[0], P.space[1], P.space[2], P.purple[2], P.purple[3]], 0.08 + band * 0.9, x, y));
  }
  save(bg, 'backgrounds/space_bg.png');
  for (const site of ['equator', 'marius', 'pole']) lunarSurface(site);
  // reentry sky: dark above, glowing curved horizon
  const re = new Bitmap(480, 270);
  for (let y = 0; y < 270; y++) for (let x = 0; x < 480; x++) {
    const hz = 230 + ((x - 240) ** 2) / 2200;
    const t = y < hz ? Math.max(0, (y - 60) / (hz - 60)) * 0.7 : 0.8 + (y - hz) / 120;
    re.set(x, y, rampDither([P.space[0], P.space[1], P.space[3], P.blue[3], P.blue[5], P.space[8], P.water[4], P.water[3]], t, x, y));
  }
  save(re, 'backgrounds/reentry.png');
  // pacific ocean day scene
  const oc = new Bitmap(480, 270);
  gradient(oc, 0, 0, 480, 170, [P.blue[3], P.blue[4], P.blue[5], P.blue[6], P.blue[7], P.sky[11]]);
  const rr = rng(12);
  for (let i = 0; i < 10; i++) { const cx = rr.int(0, 480), cy = rr.int(40, 150), rx = rr.int(20, 50); oc.ellipse(cx, cy, rx, rx * 0.25, (x, y, nx, ny) => rampDither(['#ffffff', P.grey[9], P.grey[8], P.blue[6]], 0.2 + ny * 0.5, x, y)); }
  for (let y = 170; y < 270; y++) for (let x = 0; x < 480; x++) { const w = Math.sin(x * 0.15 + y * 0.9) + Math.sin(x * 0.05 - y * 0.4); oc.set(x, y, w > 1.4 ? P.blue[7] : rampDither([P.water[4], P.water[3], P.water[2], P.water[1]], (y - 170) / 100, x, y)); }
  save(oc, 'backgrounds/ocean.png');
  // FX sheets
  save(sheet(flameFrames()), 'effects/flame.png');
  save(sheet(smokeFrames()), 'effects/smoke.png');
  save(sheet(dustFrames()), 'effects/dust.png');
  save(sheet(plasmaFrames()), 'effects/plasma.png');
  const sp = new Bitmap(4, 4); sp.rect(1, 0, 2, 4, '#ffffff'); sp.rect(0, 1, 4, 2, '#ffffff'); save(sp, 'effects/spark.png');
  const px = new Bitmap(2, 2); px.rect(0, 0, 2, 2, '#ffffff'); save(px, 'effects/pixel.png');
  // parachutes (3 mains) + drogue
  const ch = new Bitmap(60, 50);
  for (const [cx, cy] of [[14, 12], [30, 8], [46, 12]]) {
    ch.ellipse(cx, cy, 12, 8, (x, y) => (y > cy + 1 ? null : (Math.floor((x - cx + 12) / 4) % 2 ? P.orange[4] : '#f4f0e8')));
    for (const dx of [-11, -4, 4, 11]) ch.line(cx + dx, cy + 1, 30, 48, P.grey[7]);
  }
  ch.outline(P.ink); save(ch, 'effects/chutes.png');
  const dr = new Bitmap(14, 18); dr.ellipse(7, 5, 6, 4, (x, y) => (y > 6 ? null : (x % 3 ? P.orange[4] : '#fff'))); dr.line(1, 6, 7, 17, P.grey[7]); dr.line(13, 6, 7, 17, P.grey[7]); dr.outline(P.ink); save(dr, 'effects/drogue.png');
  // splash frames
  const spl = [];
  for (let f = 0; f < 4; f++) { const b = new Bitmap(48, 24); const r2 = rng(40 + f); for (let i = 0; i < 70; i++) { const a = Math.PI * r2(), d = r2() * (8 + f * 5); b.set(Math.round(24 + Math.cos(a) * d * 1.4), Math.round(22 - Math.sin(a) * d * (1 - f * 0.15)), r2() < 0.6 ? '#ffffff' : P.blue[7]); } spl.push(b); }
  save(sheet(spl), 'effects/splash.png');
  // floating capsule with flotation bags
  const cf = new Bitmap(30, 22);
  for (let y = 4; y < 20; y++) { const half = 5 + (y - 4) * 0.6; for (let x = Math.round(15 - half); x < Math.round(15 + half); x++) cf.set(x, y, rampDither([P.grey[6], P.grey[8], P.grey[9], '#ffffff'], 0.8 - (x - 15 + half) / (half * 2) * 0.6, x, y)); }
  for (const bx of [10, 15, 20]) cf.circle(bx, 3, 2.5, P.orange[5]);
  cf.hline(4, 25, 18, P.blue[4]); cf.rect(12, 9, 2, 2, P.space[2]); cf.rect(16, 9, 2, 2, P.space[2]);
  cf.outline(P.ink); save(cf, 'effects/capsule_float.png');
  // recovery ship
  const ship = new Bitmap(110, 34);
  ship.poly([[0, 20], [110, 20], [102, 33], [8, 33]], P.grey[5]); ship.hline(0, 109, 20, P.grey[8]); ship.hline(6, 104, 27, P.red[3]);
  ship.rect(50, 6, 30, 14, P.grey[7]); ship.rect(56, 0, 14, 7, P.grey[8]); for (let k = 0; k < 5; k++) ship.rect(53 + k * 5, 9, 3, 2, P.space[3]);
  ship.vline(64, -4, 0, P.grey[6]); ship.rect(10, 14, 30, 6, P.grey[6]); ship.rect(84, 12, 18, 8, P.grey[6]);
  ship.outline(P.ink); save(ship, 'effects/ship.png');
  // boulders
  for (let i = 0; i < 3; i++) { const s = [4, 7, 11][i]; const bb = new Bitmap(s * 3, s * 2); rock(bb, s * 1.5, s * 1.6, s); bb.outline(P.ink); save(bb, `lunar/boulder_${i}.png`); }
  // plaque on post
  const pl = new Bitmap(14, 22); pl.vline(6, 8, 21, P.grey[6]); pl.vline(7, 8, 21, P.grey[4]); pl.rect(0, 0, 14, 9, P.gold[4]); pl.rect(1, 1, 12, 7, P.gold[6]); pl.hline(2, 11, 3, P.gold[3]); pl.hline(2, 9, 5, P.gold[3]); pl.outline(P.ink); save(pl, 'lunar/plaque.png');
  // footprint trail dot
  const fp = new Bitmap(3, 2); fp.rect(0, 0, 3, 2, P.regolith[3]); save(fp, 'lunar/footprint.png');
}
