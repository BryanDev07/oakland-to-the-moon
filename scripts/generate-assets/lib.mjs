// Procedural pixel-art toolkit for OAKLAND TO THE MOON.
// Everything is drawn pixel-by-pixel into RGBA buffers and written as PNG files.
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Master palette (controlled ramps, dark -> light)
// ---------------------------------------------------------------------------
export const P = {
  // night / sunset sky
  sky: ['#0b0820', '#160f36', '#22164c', '#341d62', '#4e2470', '#742b78', '#a23a72', '#cf4f68', '#ec6e5c', '#f89a5a', '#ffc46e', '#ffe39a'],
  // deep space blues
  space: ['#04030c', '#080a1e', '#0e1433', '#17214d', '#22336b', '#2f4a8c', '#4268ad', '#6a92d0', '#9cc0ec', '#d2e6ff'],
  grey: ['#0e0e16', '#1b1b27', '#2a2a3a', '#3c3c50', '#525268', '#6c6c84', '#8a8aa0', '#aaaabc', '#cacad8', '#e8e8f2', '#ffffff'],
  regolith: ['#121218', '#1e1e26', '#2c2c36', '#3c3c46', '#4e4e58', '#64646c', '#7c7c84', '#96969c', '#b2b2b6', '#cfcfd0', '#ececea'],
  green: ['#0a1f17', '#123222', '#1b4a2c', '#286436', '#3a8040', '#559c48', '#7fbc58', '#b0d870'],
  brick: ['#2a141e', '#40202a', '#5c2c34', '#7c3c3c', '#9c5244', '#bc6e50', '#d8925e', '#ecb878'],
  teal: ['#0a2830', '#0f3c46', '#16545c', '#1f7070', '#2e9088', '#4cb4a0', '#80d4bc', '#c0f0dc'],
  gold: ['#3a2410', '#5c3a12', '#8a5a14', '#b47c18', '#dca024', '#f4c63c', '#ffe27a', '#fff4c0'],
  red: ['#2c0812', '#4c0e1c', '#7a1626', '#a82232', '#d23a3c', '#ee6448', '#ff9466', '#ffc8a0'],
  orange: ['#3c1606', '#6a2808', '#9c3e0c', '#cc5a12', '#ee7a1c', '#ff9e3a', '#ffc470', '#ffe6b0'],
  blue: ['#0c1430', '#14224c', '#1e3470', '#2a4c98', '#3a68bc', '#5a8ad8', '#86b2ee', '#bcd8ff'],
  purple: ['#1a0e2c', '#2c1846', '#422462', '#5c3480', '#7a4a9c', '#9c6cb8', '#c098d4', '#e4c8f0'],
  skinA: ['#2a160e', '#432416', '#5e3420', '#7a462c', '#985c3a', '#b4784e'], // protagonist (deep brown)
  skinB: ['#3a2216', '#5a3824', '#7c5034', '#a06a46', '#c48a5e', '#e2ae80'],
  skinC: ['#4a2c1e', '#704630', '#9a6446', '#c08660', '#e0a882', '#f6cca6'],
  hair: ['#0c0a10', '#1a1420', '#2a2030', '#3e3044'],
  water: ['#06102a', '#0c1c40', '#13305c', '#1c4a7c', '#2a6a9c', '#4290bc'],
  white: '#ffffff',
  black: '#000000',
  ink: '#08060f',
};

export function hex(c) {
  if (Array.isArray(c)) return c.length === 4 ? c : [...c, 255];
  const s = c.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((ch) => ch + ch).join('') : s.slice(0, 6), 16);
  const a = s.length === 8 ? parseInt(s.slice(6, 8), 16) : 255;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

export function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  return [0, 1, 2, 3].map((i) => Math.round(A[i] + (B[i] - A[i]) * t));
}

// ---------------------------------------------------------------------------
// Deterministic RNG + noise
// ---------------------------------------------------------------------------
export function rng(seed = 1) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = s(xf), v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, seed = 0, oct = 4) {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * valueNoise(x * f, y * f, seed + i * 17);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

// 4x4 ordered-dither (Bayer) threshold matrix, normalised to (0,1)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

/** Pick a colour from a ramp for continuous t in [0,1] using ordered dithering. */
export function rampDither(ramp, t, x, y) {
  const n = ramp.length - 1;
  const v = Math.max(0, Math.min(0.99999, t)) * n;
  const i = Math.floor(v);
  const f = v - i;
  return ramp[Math.min(n, f > bayer(x, y) ? i + 1 : i)];
}

// ---------------------------------------------------------------------------
// Bitmap
// ---------------------------------------------------------------------------
export class Bitmap {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inside(x, y) || c == null) return;
    const [r, g, b, a] = hex(c);
    const i = (y * this.w + x) * 4;
    if (a >= 255) { this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255; return; }
    if (a <= 0) return;
    const da = this.data[i + 3] / 255, sa = a / 255;
    const oa = sa + da * (1 - sa);
    this.data[i] = (r * sa + this.data[i] * da * (1 - sa)) / oa;
    this.data[i + 1] = (g * sa + this.data[i + 1] * da * (1 - sa)) / oa;
    this.data[i + 2] = (b * sa + this.data[i + 2] * da * (1 - sa)) / oa;
    this.data[i + 3] = oa * 255;
  }
  clear(x, y) { if (this.inside(x, y)) this.data.fill(0, (y * this.w + x) * 4, (y * this.w + x) * 4 + 4); }
  get(x, y) {
    if (!this.inside(x, y)) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  alpha(x, y) { return this.inside(x, y) ? this.data[(y * this.w + x) * 4 + 3] : 0; }
  fill(c) { this.rect(0, 0, this.w, this.h, c); return this; }
  rect(x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }
  rectFn(x, y, w, h, fn) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, fn(i, j, i - x, j - y));
  }
  frame(x, y, w, h, c) {
    this.hline(x, x + w - 1, y, c); this.hline(x, x + w - 1, y + h - 1, c);
    this.vline(x, y, y + h - 1, c); this.vline(x + w - 1, y, y + h - 1, c);
  }
  hline(x0, x1, y, c) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c); }
  vline(x, y0, y1, c) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c); }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  circle(cx, cy, r, c) { this.ellipse(cx, cy, r, r, c); }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx + 0.35), dy = (y - cy) / (ry + 0.35);
        if (dx * dx + dy * dy <= 1) this.set(x, y, typeof c === 'function' ? c(x, y, dx, dy) : c);
      }
  }
  ring(cx, cy, r, c) {
    for (let a = 0; a < 360; a += 0.5) this.set(Math.round(cx + Math.cos(a * Math.PI / 180) * r), Math.round(cy + Math.sin(a * Math.PI / 180) * r), c);
  }
  poly(points, c) {
    const ys = points.map((p) => p[1]);
    const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y <= y1; y++) {
      const xs = [];
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length];
        if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) xs.push(ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2)
        for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.set(x, y, typeof c === 'function' ? c(x, y) : c);
    }
  }
  blit(src, dx, dy, opts = {}) {
    const { flipX = false, flipY = false, tint = null, alpha = 1 } = opts;
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const sx = flipX ? src.w - 1 - x : x, sy = flipY ? src.h - 1 - y : y;
      const p = src.get(sx, sy);
      if (p[3] === 0) continue;
      const c = tint ? [...hex(tint).slice(0, 3), p[3]] : p;
      this.set(dx + x, dy + y, alpha < 1 ? [c[0], c[1], c[2], Math.round(c[3] * alpha)] : c);
    }
  }
  /** Draw a 1px outline around all opaque pixels. */
  outline(c, diagonal = false) {
    const src = new Uint8ClampedArray(this.data);
    const a = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[(y * this.w + x) * 4 + 3]);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (a(x, y) > 0) continue;
      let n = a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1);
      if (diagonal) n = n || a(x - 1, y - 1) || a(x + 1, y - 1) || a(x - 1, y + 1) || a(x + 1, y + 1);
      if (n) this.set(x, y, c);
    }
    return this;
  }
  /** Replace colour by luminance-preserving remap to a ramp (for recolouring sprites). */
  crop(x, y, w, h) {
    const b = new Bitmap(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const p = this.get(x + i, y + j);
      if (p[3]) b.set(i, j, p);
    }
    return b;
  }
  save(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const png = new PNG({ width: this.w, height: this.h });
    png.data = Buffer.from(this.data.buffer);
    fs.writeFileSync(file, PNG.sync.write(png));
  }
}

/** Build a sprite from rows of characters + key map. '.' or ' ' = transparent. */
export function fromStrings(rows, key) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const b = new Bitmap(w, h);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (key[ch]) b.set(x, y, key[ch]); }));
  return b;
}

/** Pack equally sized frames horizontally into a sprite sheet. */
export function sheet(frames) {
  const fw = frames[0].w, fh = frames[0].h;
  const b = new Bitmap(fw * frames.length, fh);
  frames.forEach((f, i) => b.blit(f, i * fw, 0));
  return b;
}

/** Vertical gradient with ordered dithering across a ramp. */
export function gradient(b, x, y, w, h, ramp, t0 = 0, t1 = 1) {
  for (let j = 0; j < h; j++) {
    const t = t0 + (t1 - t0) * (j / Math.max(1, h - 1));
    for (let i = 0; i < w; i++) b.set(x + i, y + j, rampDither(ramp, t, x + i, y + j));
  }
}

/** Starfield: scattered stars with a few twinkly crosses. */
export function stars(b, count, seed, opts = {}) {
  const r = rng(seed);
  const { y0 = 0, y1 = b.h, colors = ['#6a6a90', '#9a9ac0', '#d0d0ff', '#ffffff', '#ffe8c0'], big = 0.04 } = opts;
  for (let i = 0; i < count; i++) {
    const x = r.int(0, b.w - 1), y = r.int(y0, y1 - 1);
    const c = r.pick(colors);
    b.set(x, y, c);
    if (r() < big) {
      b.set(x - 1, y, mix(c, '#000000', 0.5)); b.set(x + 1, y, mix(c, '#000000', 0.5));
      b.set(x, y - 1, mix(c, '#000000', 0.5)); b.set(x, y + 1, mix(c, '#000000', 0.5));
    }
  }
}

/** Shaded sphere helper: fn(nx, ny, nz, x, y) returns colour or null. */
export function sphere(b, cx, cy, r, fn) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const nx = (x - cx + 0.5) / r, ny = (y - cy + 0.5) / r;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d);
      const c = fn(nx, ny, nz, x, y);
      if (c) b.set(x, y, c);
    }
}

export const OUT = path.resolve(process.cwd(), 'public/assets');
export function save(b, rel) { b.save(path.join(OUT, rel)); }
