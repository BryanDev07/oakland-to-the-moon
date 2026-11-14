// Oakland environments: sky, skyline + Lake Merritt, BART guideway, street, title foreground.
import { Bitmap, P, save, rng, gradient, rampDither, stars, mix, sphere, fbm, bayer, hex } from './lib.mjs';
import { drawText, measure } from './font.mjs';

const W = 480, H = 270;
const WATER_Y = 200;

// ------------------------------- sky ----------------------------------------
function moonDisk(b, cx, cy, r, phaseLight = 1) {
  sphere(b, cx, cy, r, (nx, ny, nz, x, y) => {
    const l = 0.25 + 0.75 * Math.max(0, nz * 0.8 - nx * 0.45 * phaseLight - ny * 0.2);
    const m = fbm(nx * 2.2 + 5, ny * 2.2 + 1, 33, 3);
    const maria = m > 0.56 ? -0.22 : m > 0.5 ? -0.1 : 0;
    const crater = fbm(nx * 9, ny * 9, 7, 2) > 0.72 ? -0.12 : 0;
    return rampDither(P.regolith.slice(4), l + maria + crater, x, y);
  });
}

export function buildSky(time) {
  const b = new Bitmap(W, H);
  const night = time === 'night';
  const ramp = night
    ? [P.space[0], P.space[1], P.space[2], P.space[3], P.purple[2], P.purple[3], P.sky[5]]
    : [P.sky[1], P.sky[2], P.sky[3], P.sky[4], P.sky[5], P.sky[6], P.sky[7], P.sky[8], P.sky[9], P.sky[10], P.sky[11]];
  gradient(b, 0, 0, W, 190, ramp, 0, 1);
  stars(b, night ? 260 : 70, night ? 11 : 12, { y1: night ? 160 : 90 });
  if (night) moonDisk(b, 360, 62, 30); else moonDisk(b, 96, 48, 11, -1);
  // halo around night moon
  if (night) for (let y = 20; y < 110; y++) for (let x = 310; x < 410; x++) {
    const d = Math.hypot(x - 360, y - 62);
    if (d > 31 && d < 46 && bayer(x, y) < (46 - d) / 40) b.set(x, y, mix(P.purple[4], P.space[4], 0.5));
  }
  // sun setting behind hills (dusk)
  if (!night) {
    b.circle(390, 172, 18, (x, y) => rampDither([P.gold[7], P.gold[6], P.orange[5]], (y - 154) / 30, x, y));
    for (let y = 140; y < 190; y++) for (let x = 340; x < 440; x++) {
      const d = Math.hypot(x - 390, y - 172);
      if (d > 19 && d < 40 && bayer(x, y) < (40 - d) / 50) b.set(x, y, P.sky[10]);
    }
  }
  // cloud bands
  const r = rng(night ? 5 : 6);
  for (let i = 0; i < 9; i++) {
    const cy = r.int(60, 150), cx = r.int(-40, W), len = r.int(60, 160), th = r.int(2, 5);
    for (let x = cx; x < cx + len; x++) {
      const t = (x - cx) / len;
      const hh = Math.round(th * Math.sin(t * Math.PI));
      for (let y = cy - hh; y <= cy; y++) {
        const top = y === cy - hh;
        b.set(x, y, night ? (top ? P.purple[4] : P.purple[2]) : top ? P.sky[10] : y > cy - 1 ? P.sky[5] : P.sky[7]);
      }
    }
  }
  // Oakland hills
  for (let x = 0; x < W; x++) {
    const hy = 160 + Math.sin(x * 0.012 + 1) * 10 + Math.sin(x * 0.041) * 4 + fbm(x * 0.05, 0, 3, 3) * 8;
    for (let y = Math.floor(hy); y < 200; y++) b.set(x, y, night ? rampDither([P.space[3], P.space[2]], (y - hy) / 30, x, y) : rampDither([P.purple[4], P.purple[3], P.sky[4]], (y - hy) / 30, x, y));
  }
  // tiny house lights on hills
  for (let i = 0; i < (night ? 140 : 50); i++) {
    const x = r.int(0, W - 1); const hy = 160 + Math.sin(x * 0.012 + 1) * 10 + Math.sin(x * 0.041) * 4 + 6;
    const y = r.int(Math.floor(hy) + 2, 198);
    b.set(x, y, r() < 0.7 ? P.gold[6] : '#ffffff');
  }
  // hilltop temple-like white spire (stylised hill landmark)
  b.rect(250, 158, 3, 10, night ? P.grey[8] : P.grey[9]); b.set(251, 155, P.gold[6]); b.set(251, 156, P.gold[6]); b.set(251, 157, P.gold[5]);
  save(b, `oakland/sky_${time}.png`);
}

// ------------------------------- skyline ------------------------------------
function windowsGrid(b, x0, y0, w, h, r, lit, colors) {
  for (let y = y0 + 2; y < y0 + h - 2; y += 3) for (let x = x0 + 2; x < x0 + w - 2; x += 3) {
    const on = r() < lit;
    b.set(x, y, on ? (r() < 0.8 ? colors.lit : colors.lit2) : colors.dark);
  }
}

function tower(b, x, w, top, base, body, r, lit, colors, opts = {}) {
  for (let y = top; y < base; y++) for (let i = 0; i < w; i++) b.set(x + i, y, i === 0 ? body[2] : i === w - 1 ? body[0] : i < w / 3 ? body[2] : body[1]);
  windowsGrid(b, x, top, w, base - top, r, lit, colors);
  if (opts.antenna) { b.vline(x + Math.floor(w / 2), top - opts.antenna, top - 1, body[2]); b.set(x + Math.floor(w / 2), top - opts.antenna - 1, P.red[5]); }
  if (opts.cap) { b.rect(x - 1, top - 2, w + 2, 2, body[2]); }
}

function clockTower(b, x, base, night) {
  const body = night ? [P.space[2], P.space[3], P.brick[2]] : [P.purple[2], P.purple[3], P.brick[3]];
  const top = 92;
  // shaft
  for (let y = top; y < base; y++) for (let i = 0; i < 14; i++) b.set(x + i, y, i < 3 ? body[2] : i > 11 ? body[0] : body[1]);
  for (let y = top + 6; y < base - 2; y += 4) for (let i = 3; i < 12; i += 3) b.set(x + i, y, night && ((y + i) % 7 < 4) ? P.gold[6] : P.space[4]);
  // crown
  b.rect(x - 2, top - 16, 18, 16, body[1]); b.rect(x - 2, top - 16, 4, 16, body[2]); b.rect(x + 13, top - 16, 3, 16, body[0]);
  b.rect(x - 3, top - 2, 20, 2, night ? P.grey[4] : P.purple[4]);
  // clock face
  b.circle(x + 6.5, top - 9, 4, night ? P.gold[7] : '#f4ead0');
  b.ring(x + 6.5, top - 9, 4, P.ink);
  b.vline(x + 7, top - 12, top - 9, P.ink); b.hline(x + 7, x + 9, top - 9, P.ink);
  // mansard roof (terracotta) with turrets
  b.poly([[x - 3, top - 16], [x + 17, top - 16], [x + 13, top - 34], [x + 1, top - 34]], (px, py) => rampDither([P.brick[6], P.brick[5], P.brick[4]], (py - (top - 34)) / 20, px, py));
  for (let i = 0; i < 4; i++) b.vline(x + 1 + i * 4, top - 30, top - 18, P.brick[3]);
  for (const tx of [x - 4, x + 16]) { b.rect(tx, top - 24, 3, 9, P.brick[4]); b.poly([[tx - 1, top - 24], [tx + 4, top - 24], [tx + 1.5, top - 30]], P.brick[5]); }
  b.poly([[x + 3, top - 34], [x + 11, top - 34], [x + 7, top - 44]], P.brick[5]);
  b.vline(x + 7, top - 50, top - 44, P.grey[6]); b.set(x + 8, top - 49, P.red[4]); b.set(x + 9, top - 49, P.red[4]); b.set(x + 8, top - 48, P.red[4]);
  if (night) for (let y = top - 44; y < top; y++) for (let xx = x - 4; xx < x + 18; xx++) if (b.alpha(xx, y) && bayer(xx, y) < 0.18) b.set(xx, y, P.gold[5]);
}

function cathedral(b, cx, base, night) {
  const h = 46, w = 40;
  for (let y = base - h; y < base; y++) {
    const t = (y - (base - h)) / h;
    const half = (w / 2) * Math.sin(Math.acos(1 - t)) * 0.95;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const louver = (x - cx + 40) % 3 === 0;
      const glow = night ? rampDither([P.gold[3], P.gold[5], P.gold[6]], 1 - t * 0.6, x, y) : rampDither([P.space[5], P.space[6], P.blue[6]], 0.3 + (x - cx) / w, x, y);
      b.set(x, y, louver ? (night ? P.gold[2] : P.space[4]) : glow);
    }
  }
  b.vline(cx, base - h - 3, base - h, night ? P.gold[6] : P.grey[8]);
}

function crane(b, x, base, night) {
  const c = night ? P.space[3] : P.purple[2];
  const lit = night ? P.red[5] : P.red[4];
  // legs
  b.line(x, base, x + 6, base - 34, c); b.line(x + 1, base, x + 7, base - 34, c);
  b.line(x + 20, base, x + 14, base - 34, c); b.line(x + 21, base, x + 15, base - 34, c);
  b.hline(x + 3, x + 18, base - 16, c); b.hline(x + 5, x + 16, base - 28, c);
  // boom out over water (to the right) + back stay
  b.rect(x - 14, base - 36, 72, 2, c);
  b.line(x + 10, base - 50, x + 56, base - 36, c);
  b.line(x + 10, base - 50, x - 14, base - 36, c);
  b.vline(x + 10, base - 50, base - 36, c);
  b.rect(x + 13, base - 34, 5, 4, night ? P.gold[5] : c);
  b.set(x + 10, base - 51, lit); b.set(x + 57, base - 37, lit);
}

export function buildSkyline(time) {
  const night = time === 'night';
  const SW = 640;
  const b = new Bitmap(SW, H);
  const r = rng(night ? 21 : 22);
  const colors = { lit: P.gold[6], lit2: '#fff4d0', dark: night ? P.space[2] : P.purple[2] };
  const farBody = night ? [P.space[1], P.space[2], P.space[3]] : [P.purple[2], P.purple[3], P.purple[4]];
  const nearBody = night ? [P.space[1], P.space[2], P.space[4]] : [P.sky[2], P.sky[3], P.sky[5]];
  // port cranes far left
  for (const cx of [10, 70, 130]) crane(b, cx, WATER_Y - 2, night);
  // distant bridge line with lights
  for (let x = 0; x < 200; x++) { const y = WATER_Y - 10 + Math.round(Math.sin(x / 200 * Math.PI) * -3); b.set(x, y, farBody[1]); if (x % 6 === 0) b.set(x, y - 1, P.gold[6]); }
  // far towers
  for (let i = 0; i < 18; i++) {
    const x = 190 + i * 24 + r.int(-6, 6), w = r.int(10, 18), top = r.int(120, 165);
    tower(b, x, w, top, WATER_Y, farBody, r, night ? 0.45 : 0.18, colors, { antenna: r() < 0.3 ? r.int(4, 10) : 0 });
  }
  // landmark & nearer towers
  tower(b, 228, 22, 108, WATER_Y, nearBody, r, night ? 0.55 : 0.25, colors, { cap: true, antenna: 12 }); // twin A
  tower(b, 254, 22, 112, WATER_Y, nearBody, r, night ? 0.55 : 0.25, colors, { cap: true }); // twin B
  clockTower(b, 300, WATER_Y, night);
  tower(b, 330, 30, 122, WATER_Y, nearBody, r, night ? 0.5 : 0.22, colors, { cap: true });
  tower(b, 366, 18, 98, WATER_Y, nearBody, r, night ? 0.6 : 0.25, colors, { antenna: 16 }); // tallest
  tower(b, 388, 26, 132, WATER_Y, nearBody, r, night ? 0.5 : 0.2, colors, {});
  cathedral(b, 446, WATER_Y, night);
  tower(b, 476, 20, 140, WATER_Y, nearBody, r, night ? 0.5 : 0.2, colors, { cap: true });
  tower(b, 500, 34, 150, WATER_Y, nearBody, r, night ? 0.5 : 0.2, colors, {});
  for (let i = 0; i < 5; i++) tower(b, 540 + i * 20, r.int(14, 20), r.int(150, 176), WATER_Y, farBody, r, 0.35, colors, {});
  // shoreline trees + low buildings
  for (let x = 0; x < SW; x++) {
    const th = 4 + Math.round(fbm(x * 0.15, 3, 4, 2) * 6);
    for (let y = WATER_Y - th; y < WATER_Y; y++) b.set(x, y, night ? rampDither([P.green[1], P.green[0]], (y - (WATER_Y - th)) / th, x, y) : rampDither([P.green[3], P.green[2], P.green[1]], (y - (WATER_Y - th)) / th, x, y));
  }
  // necklace of lights along far shore
  for (let x = 2; x < SW; x += 4) { const y = WATER_Y - 2 - Math.round(Math.sin(((x % 40) / 40) * Math.PI) * -2); b.set(x, y, night ? '#fff6d0' : P.gold[7]); }
  // water + reflection
  const waterRamp = night ? [P.space[2], P.space[1], P.space[0]] : [P.sky[6], P.sky[4], P.sky[3], P.sky[2]];
  for (let y = WATER_Y; y < H; y++) for (let x = 0; x < SW; x++) {
    b.set(x, y, rampDither(waterRamp, (y - WATER_Y) / 70, x, y));
    const wave = Math.round(Math.sin(y * 0.9 + x * 0.05) * 1.5);
    const sy = 2 * WATER_Y - y - 1;
    const p = b.get(x + wave, sy);
    if (p[3] && sy > 0) {
      const bright = p[0] + p[1] > 380;
      if (bright ? ((y % 3 === 0) && (x + y) % 4 === 0) : bayer(x, y) < 0.45) b.set(x, y, bright ? [p[0], p[1], Math.min(255, p[2] + 20), 200] : mix([p[0], p[1], p[2], 255], waterRamp[1], 0.55));
    }
    if (bayer(x * 3, y) < 0.03 && (x * 7 + y * 13) % 11 === 0) b.set(x, y, night ? P.space[4] : P.sky[9]);
  }
  save(b, `oakland/skyline_${time}.png`);
}

// ------------------------------- mid (BART) ---------------------------------
export function buildMid() {
  const MW = 800;
  const b = new Bitmap(MW, H);
  const beam = [P.purple[1], P.purple[2], P.purple[3]];
  const r = rng(31);
  // mid apartment blocks (only left portion)
  for (let i = 0; i < 6; i++) {
    const x = i * 52 + r.int(0, 8), w = r.int(34, 46), top = r.int(176, 196);
    for (let y = top; y < 240; y++) for (let k = 0; k < w; k++) b.set(x + k, y, k < 3 ? P.brick[2] : k > w - 3 ? P.brick[0] : P.brick[1]);
    for (let y = top + 4; y < 236; y += 6) for (let k = 4; k < w - 4; k += 6) { const on = r() < 0.5; b.rect(x + k, y, 3, 3, on ? P.gold[5] : P.sky[3]); if (on) b.set(x + k, y, P.gold[7]); }
    b.rect(x - 1, top - 2, w + 2, 2, P.brick[3]);
  }
  // elevated guideway
  for (let x = 0; x < MW; x++) { b.set(x, 172, beam[2]); b.set(x, 173, beam[1]); b.set(x, 174, beam[1]); b.set(x, 175, beam[0]); b.set(x, 176, beam[0]); if (x % 8 === 0) b.set(x, 171, beam[1]); }
  for (let x = 30; x < MW; x += 96) {
    b.rect(x, 177, 6, 63, beam[1]); b.rect(x, 177, 2, 63, beam[2]); b.rect(x - 4, 177, 14, 3, beam[1]);
  }
  // trees in mid layer
  for (let i = 0; i < 9; i++) {
    const x = 340 + i * 52 + r.int(0, 20), y = 222 + r.int(-4, 4);
    b.rect(x, y, 2, 14, P.brick[1]);
    b.ellipse(x + 1, y - 4, 9, 7, (px, py, nx, ny) => rampDither([P.green[4], P.green[3], P.green[2], P.green[1]], 0.3 + ny * 0.4 + nx * 0.2, px, py));
  }
  save(b, 'oakland/mid.png');
  // BART-style train (original design): 3 cars
  const t = new Bitmap(132, 12);
  for (let c = 0; c < 3; c++) {
    const x0 = c * 44;
    t.rect(x0 + 1, 1, 42, 10, P.grey[8]); t.rect(x0 + 1, 1, 42, 1, '#ffffff'); t.rect(x0 + 1, 9, 42, 2, P.grey[5]);
    t.rect(x0 + 1, 6, 42, 1, P.blue[4]);
    for (let k = 4; k < 40; k += 6) t.rect(x0 + k, 3, 4, 2, P.gold[6]);
  }
  t.poly([[131, 2], [131, 11], [124, 11], [128, 2]], P.grey[7]); t.rect(126, 3, 3, 2, P.space[6]);
  t.outline(P.ink);
  save(t, 'oakland/train.png');
}

// ------------------------------- street -------------------------------------
function victorian(b, x, w, top, body, trim, r) {
  const base = 238;
  for (let y = top; y < base; y++) for (let i = 0; i < w; i++) b.set(x + i, y, i < 2 ? mix(body[1], '#000', 0.25) : body[1]);
  // siding lines
  for (let y = top + 2; y < base; y += 3) b.hline(x + 2, x + w - 2, y, body[0]);
  // gable roof
  b.poly([[x - 3, top + 1], [x + w + 3, top + 1], [x + w / 2, top - 22]], (px, py) => rampDither([trim[2], trim[1], trim[0]], (py - (top - 22)) / 24, px, py));
  b.poly([[x + 4, top - 1], [x + w - 4, top - 1], [x + w / 2, top - 16]], body[2]);
  b.circle(x + w / 2, top - 8, 3, P.gold[6]); b.ring(x + w / 2, top - 8, 3, trim[0]);
  // bay window column
  const bx = x + 5, bw = Math.floor(w * 0.45);
  b.rect(bx - 2, top + 8, bw + 4, 46, body[2]);
  for (let k = 0; k < 2; k++) {
    const wy = top + 12 + k * 22;
    b.rect(bx, wy, bw, 14, P.gold[5]); b.rect(bx, wy, bw, 3, P.gold[7]);
    b.vline(bx + Math.floor(bw / 2), wy, wy + 13, trim[0]); b.frame(bx - 1, wy - 1, bw + 2, 16, trim[1]);
    b.hline(bx - 2, bx + bw + 1, wy + 15, trim[2]);
  }
  // door + stoop
  const dx = x + w - 15;
  b.rect(dx, base - 26, 9, 22, trim[0]); b.rect(dx + 1, base - 25, 7, 20, body[0]); b.set(dx + 6, base - 15, P.gold[6]);
  b.rect(dx - 1, base - 30, 11, 3, trim[2]); b.rect(dx + 2, base - 29, 5, 2, P.gold[6]);
  for (let s = 0; s < 4; s++) b.rect(dx - 2 - s, base - 4 + s, 13 + s * 2, 1, P.grey[5 - Math.min(s, 2)]);
  // upper window
  b.rect(dx, top + 12, 9, 12, r() < 0.5 ? P.gold[5] : P.sky[4]); b.frame(dx - 1, top + 11, 11, 14, trim[1]);
  // cornice trim
  b.hline(x - 1, x + w, top, trim[2]); b.hline(x - 1, x + w, top + 1, trim[1]);
  for (let i = 0; i < w; i += 3) b.set(x + i, top + 2, trim[2]);
}

function streetLamp(b, x) {
  const base = 240;
  b.rect(x, base - 52, 2, 52, P.grey[2]); b.set(x, base - 52, P.grey[4]);
  b.rect(x - 2, base - 3, 6, 3, P.grey[2]);
  b.rect(x - 3, base - 58, 8, 6, P.grey[2]); b.rect(x - 2, base - 57, 6, 4, P.gold[7]); b.rect(x - 1, base - 60, 4, 2, P.grey[2]);
}
function lampGlow(b, x) {
  const base = 240;
  for (let y = base - 76; y < base - 36; y++) for (let xx = x - 20; xx < x + 22; xx++) {
    const d = Math.hypot(xx - x - 1, y - (base - 55));
    if (d > 4 && d < 20 && !b.alpha(xx, y) && bayer(xx, y) < (20 - d) / 60) b.set(xx, y, [255, 220, 140, 70]);
  }
}

function oakTree(b, x, base, s = 1) {
  b.rect(x - 2, base - 30 * s, 5, 30 * s, P.brick[1]); b.rect(x - 2, base - 30 * s, 2, 30 * s, P.brick[2]);
  b.line(x, base - 26 * s, x - 12 * s, base - 40 * s, P.brick[1]); b.line(x + 1, base - 24 * s, x + 14 * s, base - 38 * s, P.brick[1]);
  const blobs = [[0, -48, 18], [-16, -40, 13], [16, -40, 13], [-8, -58, 12], [10, -58, 11], [0, -34, 12]];
  for (const [dx, dy, rr] of blobs) b.ellipse(x + dx * s, base + dy * s, rr * s, rr * s * 0.8, (px, py, nx, ny) => {
    const t = 0.25 + ny * 0.35 - nx * 0.15 + (fbm(px * 0.3, py * 0.3, 9, 2) - 0.5) * 0.6;
    return rampDither([P.green[6], P.green[5], P.green[4], P.green[3], P.green[2]], t, px, py);
  });
}

export function buildStreet() {
  const SW = 1200;
  const b = new Bitmap(SW, H);
  const r = rng(41);
  // ---- sidewalk & street
  for (let x = 0; x < SW; x++) {
    for (let y = 238; y < 248; y++) b.set(x, y, (x % 16 === 0) ? P.grey[3] : rampDither([P.grey[6], P.grey[5]], (y - 238) / 10, x, y));
    b.set(x, 248, P.grey[7]); b.set(x, 249, P.grey[3]);
    for (let y = 250; y < H; y++) b.set(x, y, rampDither([P.grey[2], P.grey[1]], (y - 250) / 20, x, y));
    if (x % 40 < 20) b.set(x, 262, P.gold[5]);
  }
  // ---- Kai's house (teal Victorian) and neighbour
  victorian(b, 12, 70, 150, [P.teal[2], P.teal[3], P.teal[5]], [P.gold[3], P.gold[4], P.gold[6]], r);
  victorian(b, 92, 62, 160, [P.purple[2], P.purple[3], P.purple[5]], [P.grey[6], P.grey[7], P.grey[9]], r);
  // ---- oak tree + lamp
  oakTree(b, 186, 240, 1.15);
  streetLamp(b, 222);
  // ---- corner market
  const mx = 240, mw = 150, mt = 172;
  for (let y = mt; y < 238; y++) for (let i = 0; i < mw; i++) b.set(mx + i, y, (y - mt) % 5 === 0 || ((i + (Math.floor((y - mt) / 5) % 2) * 4) % 8 === 0) ? P.brick[3] : P.brick[4]);
  b.rect(mx - 2, mt - 4, mw + 4, 4, P.brick[6]); b.hline(mx - 2, mx + mw + 1, mt - 4, P.brick[7]);
  // sign
  b.rect(mx + 14, mt + 4, mw - 28, 13, P.space[1]); b.frame(mx + 14, mt + 4, mw - 28, 13, P.gold[5]);
  const label = "AUNTIE DEE'S MARKET";
  drawText(b, label, mx + Math.floor((mw - measure(label, 1)) / 2), mt + 7, 1, () => P.gold[6]);
  // awning stripes
  for (let i = 0; i < mw + 8; i++) for (let y = 0; y < 9; y++) b.set(mx - 4 + i, mt + 22 + y, Math.floor(i / 6) % 2 ? '#f4f0e8' : P.red[3]);
  for (let i = 0; i < mw + 8; i += 6) { b.set(mx - 4 + i + 2, mt + 31, P.red[3]); b.set(mx - 4 + i + 3, mt + 31, P.red[3]); }
  // shop windows lit
  for (const wx of [mx + 8, mx + 92]) { b.rect(wx, mt + 36, 50, 26, P.gold[6]); b.rect(wx, mt + 36, 50, 4, P.gold[7]); b.frame(wx - 1, mt + 35, 52, 28, P.ink); for (let k = 0; k < 5; k++) b.rect(wx + 3 + k * 9, mt + 46, 6, 8, [P.red[4], P.green[5], P.orange[5], P.purple[5], P.teal[5]][k]); }
  b.rect(mx + 64, mt + 34, 22, 32, P.space[2]); b.rect(mx + 66, mt + 36, 18, 30, P.gold[5]); b.vline(mx + 75, mt + 36, mt + 65, P.space[2]);
  // produce crates
  for (let k = 0; k < 3; k++) { b.rect(mx + 10 + k * 14, 228, 12, 10, P.brick[5]); b.hline(mx + 10 + k * 14, mx + 21 + k * 14, 231, P.brick[3]); for (let j = 0; j < 5; j++) b.set(mx + 12 + k * 14 + j * 2, 227, [P.red[4], P.gold[6], P.green[5]][k]); }
  // ---- mural wall
  const wx0 = 400, ww = 150, wt = 168;
  for (let y = wt; y < 238; y++) for (let i = 0; i < ww; i++) b.set(wx0 + i, y, rampDither([P.space[4], P.purple[3], P.sky[6], P.sky[8]], (y - wt) / 70, wx0 + i, y));
  b.rect(wx0 - 2, wt - 3, ww + 4, 3, P.grey[4]);
  // mural content: moon, rocket, stars, oak leaves, "THE TOWN"
  sphere(b, wx0 + 116, wt + 22, 14, (nx, ny, nz, x, y) => rampDither([P.regolith[5], P.regolith[7], P.regolith[9], P.gold[7]], nz * 0.8 - nx * 0.3, x, y));
  for (let k = 0; k < 18; k++) b.set(wx0 + r.int(4, ww - 4), wt + r.int(3, 40), '#fff');
  // rocket
  const rx = wx0 + 40, ry = wt + 14;
  b.poly([[rx, ry + 30], [rx + 10, ry + 30], [rx + 10, ry + 8], [rx + 5, ry], [rx, ry + 8]], '#f4f0e8');
  b.rect(rx + 3, ry + 12, 4, 4, P.blue[5]); b.poly([[rx, ry + 22], [rx - 5, ry + 32], [rx, ry + 30]], P.red[3]); b.poly([[rx + 10, ry + 22], [rx + 15, ry + 32], [rx + 10, ry + 30]], P.red[3]);
  for (let k = 0; k < 14; k++) { const fy = ry + 31 + k; b.hline(rx + 2 + Math.floor(k / 5), rx + 8 - Math.floor(k / 5), fy, k < 4 ? P.gold[7] : k < 9 ? P.orange[5] : P.red[4]); }
  // painted swoosh trail
  for (let t = 0; t < 60; t++) { const sx = wx0 + 10 + t, sy = wt + 62 - Math.round(Math.sin(t / 60 * Math.PI / 2) * 10); b.set(sx, sy, P.gold[6]); b.set(sx, sy + 1, P.gold[4]); }
  const mural = 'THE TOWN';
  drawText(b, mural, wx0 + 76, wt + 48, 2, (px, py, ly) => ly < 6 ? P.gold[7] : P.orange[5]);
  // ---- rec center w/ robotics windows
  const rx0 = 562, rw = 132, rt = 160;
  for (let y = rt; y < 238; y++) for (let i = 0; i < rw; i++) b.set(rx0 + i, y, i < 3 ? P.grey[3] : rampDither([P.grey[5], P.grey[4]], (y - rt) / 80, rx0 + i, y));
  b.rect(rx0 - 3, rt - 4, rw + 6, 4, P.grey[6]);
  b.rect(rx0 + 10, rt + 6, rw - 20, 11, P.blue[2]); b.frame(rx0 + 10, rt + 6, rw - 20, 11, P.gold[5]);
  const rc = 'EASTLAKE REC CENTER';
  drawText(b, rc, rx0 + Math.floor((rw - measure(rc, 1)) / 2), rt + 8, 1, () => '#ffffff');
  for (let k = 0; k < 3; k++) { const wx = rx0 + 10 + k * 40; b.rect(wx, rt + 24, 32, 22, P.blue[6]); b.rect(wx, rt + 24, 32, 5, P.blue[7]); b.frame(wx - 1, rt + 23, 34, 24, P.grey[2]); }
  // little robot silhouette in window
  b.rect(rx0 + 56, rt + 34, 8, 6, P.grey[3]); b.rect(rx0 + 58, rt + 30, 4, 4, P.grey[3]); b.set(rx0 + 59, rt + 31, P.red[5]); b.rect(rx0 + 55, rt + 40, 2, 4, P.grey[3]); b.rect(rx0 + 63, rt + 40, 2, 4, P.grey[3]);
  b.rect(rx0 + 54, 206, 24, 32, P.space[2]); b.rect(rx0 + 56, 208, 9, 30, P.blue[4]); b.rect(rx0 + 67, 208, 9, 30, P.blue[4]);
  streetLamp(b, 712);
  // ---- lakeside path: railing + necklace of lights + benches + pergola
  const lakeStart = 730;
  for (let x = lakeStart; x < SW; x++) {
    b.set(x, 226, P.grey[7]); b.set(x, 227, P.grey[4]);
    if ((x - lakeStart) % 12 === 0) b.rect(x, 226, 2, 12, P.grey[4]);
    if ((x - lakeStart) % 4 === 0) b.vline(x, 228, 237, P.grey[3]);
  }
  // lamp posts carrying the necklace
  const posts = [];
  for (let x = lakeStart + 10; x < SW; x += 64) { posts.push(x); b.rect(x, 200, 2, 38, P.grey[2]); b.circle(x + 0.5, 198, 2, '#fff6d8'); }
  for (let i = 0; i + 1 < posts.length; i++) {
    const a = posts[i], c = posts[i + 1];
    for (let x = a + 2; x < c; x++) {
      const t = (x - a) / (c - a);
      const y = Math.round(199 + Math.sin(t * Math.PI) * 9);
      b.set(x, y, P.grey[3]);
      if ((x - a) % 5 === 0) { b.set(x, y + 1, '#fff6d0'); b.set(x, y + 2, P.gold[6]); }
    }
  }
  // pergola columns
  const px0 = 1010;
  for (let k = 0; k < 7; k++) { const cx = px0 + k * 14; b.rect(cx, 186, 5, 52, '#ece4d4'); b.rect(cx, 186, 1, 52, '#fffaf0'); b.rect(cx - 1, 184, 7, 2, '#d8ccb8'); b.rect(cx - 1, 236, 7, 2, '#d8ccb8'); }
  b.rect(px0 - 4, 178, 100, 6, '#ece4d4'); b.hline(px0 - 4, px0 + 95, 178, '#fffaf0'); b.hline(px0 - 4, px0 + 95, 183, '#c8bca8');
  // bench
  for (const bx of [800, 900]) { b.rect(bx, 228, 26, 3, P.brick[4]); b.rect(bx, 222, 26, 2, P.brick[4]); b.rect(bx + 2, 231, 2, 7, P.grey[2]); b.rect(bx + 22, 231, 2, 7, P.grey[2]); }
  oakTree(b, 960, 240, 0.9);
  // fire hydrant + bus stop sign
  b.rect(150, 230, 5, 8, P.red[4]); b.rect(149, 228, 7, 3, P.red[3]); b.set(152, 227, P.red[5]);
  b.rect(530, 196, 1, 42, P.grey[3]); b.rect(526, 196, 9, 6, P.green[4]); b.set(530, 198, '#fff');
  b.outline(P.ink);
  lampGlow(b, 222); lampGlow(b, 712);
  save(b, 'oakland/street.png');
}

/** Title-screen foreground: lakeside railing, necklace of lights, Kai on a bench gazing at the moon. */
export function buildTitleFg() {
  const b = new Bitmap(W, H);
  for (let x = 0; x < W; x++) {
    for (let y = 238; y < H; y++) b.set(x, y, rampDither([P.space[2], P.space[1], P.space[0]], (y - 238) / 32, x, y));
    b.set(x, 236, P.grey[5]); b.set(x, 237, P.grey[3]);
    if (x % 14 === 0) b.rect(x, 236, 2, 12, P.grey[3]);
  }
  const posts = [];
  for (let x = 6; x < W; x += 80) { posts.push(x); b.rect(x, 206, 2, 32, P.space[3]); b.circle(x + 0.5, 204, 2, '#fff6d8'); }
  for (let i = 0; i + 1 < posts.length; i++) {
    const a = posts[i], c = posts[i + 1];
    for (let x = a + 2; x < c; x++) { const t = (x - a) / (c - a); const y = Math.round(205 + Math.sin(t * Math.PI) * 10); b.set(x, y, P.space[4]); if ((x - a) % 5 === 0) { b.set(x, y + 1, '#fff6d0'); b.set(x, y + 2, P.gold[6]); } }
  }
  // bench silhouette with seated figure (back view)
  const bx = 150;
  b.rect(bx, 226, 40, 3, P.space[4]); b.rect(bx, 218, 40, 2, P.space[4]); b.rect(bx + 3, 229, 2, 9, P.space[3]); b.rect(bx + 35, 229, 2, 9, P.space[3]);
  b.ellipse(bx + 20, 219, 5, 7, P.blue[3]); b.circle(bx + 20, 208, 4, P.hair[1]); b.circle(bx + 20, 202.5, 2, P.hair[2]);
  b.hline(bx + 16, bx + 24, 214, P.gold[5]);
  b.outline(P.ink);
  save(b, 'oakland/title_fg.png');
}

export function buildBanner() {
  const text = 'WELCOME HOME, COMMANDER KAI!';
  const w = measure(text, 1) + 20;
  const b = new Bitmap(w, 16);
  b.rect(0, 0, w, 16, P.gold[5]); b.rect(1, 1, w - 2, 14, P.blue[3]); b.hline(1, w - 2, 1, P.blue[5]);
  drawText(b, text, 10, 4, 1, () => '#ffffff');
  b.outline(P.ink);
  save(b, 'oakland/banner.png');
}

export function buildOakland() {
  buildSky('dusk'); buildSky('night');
  buildSkyline('dusk'); buildSkyline('night');
  buildMid(); buildStreet(); buildTitleFg(); buildBanner();
}
export { hex };
