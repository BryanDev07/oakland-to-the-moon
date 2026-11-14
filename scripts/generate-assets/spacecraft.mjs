// Spacecraft modular parts, launch vehicles, launch pad, hangar & mission control interiors.
import { Bitmap, P, save, rng, gradient, rampDither, stars, mix, bayer, fbm, sheet } from './lib.mjs';
import { drawText, measure } from './font.mjs';

// ----------------------------------------------------------------- helpers
/** column-lit cylinder fill */
function cyl(b, x, y, w, h, ramp, light = -0.55) {
  for (let i = 0; i < w; i++) {
    const u = ((i + 0.5) / w) * 2 - 1;
    const nz = Math.sqrt(Math.max(0, 1 - u * u));
    const l = Math.max(0, light * u + 0.8 * nz) * 0.95 + 0.05;
    for (let j = 0; j < h; j++) b.set(x + i, y + j, rampDither(ramp, l, x + i, y + j));
  }
}
const SILVER = [P.grey[3], P.grey[5], P.grey[7], P.grey[8], P.grey[9], '#ffffff'];
const WHITE = [P.grey[5], P.grey[7], P.grey[8], P.grey[9], '#f8f8ff', '#ffffff'];
const FOIL = [P.gold[2], P.gold[3], P.gold[4], P.gold[5], P.gold[6], P.gold[7]];
const DARK = [P.grey[0], P.grey[1], P.grey[2], P.grey[3], P.grey[4]];
const COPPER = [P.brick[2], P.brick[3], P.brick[4], P.brick[5], P.brick[6], P.orange[6]];
const STEEL = [P.grey[4], P.grey[5], P.grey[6], P.grey[7], P.grey[8], P.grey[9], P.blue[7]];

function done(b, name) { b.outline(P.ink); save(b, `spacecraft/${name}.png`); return b; }

// ------------------------------------------------------------------- parts
function capsule(w = 40, h = 28) {
  const b = new Bitmap(w, h);
  const topW = Math.round(w * 0.3);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const half = (topW / 2) + ((w / 2) - (topW / 2)) * t;
    for (let x = 0; x < w; x++) {
      const u = (x - w / 2 + 0.5) / half;
      if (Math.abs(u) > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - u * u));
      const l = Math.max(0, -0.55 * u + 0.8 * nz) + 0.05;
      b.set(x, y, rampDither(WHITE, l, x, y));
    }
  }
  // docking ring
  const dr = Math.max(3, Math.round(w * 0.12));
  b.rect(Math.round(w / 2 - dr), 0, dr * 2, 2, P.grey[5]); b.hline(Math.round(w / 2 - dr), Math.round(w / 2 + dr - 1), 0, P.grey[8]);
  // windows
  if (w >= 30) {
    const wy = Math.round(h * 0.42);
    for (const dx of [-8, -3, 2, 7]) { b.rect(Math.round(w / 2 + dx), wy, 3, 3, P.space[2]); b.set(Math.round(w / 2 + dx), wy, P.space[6]); }
    // hatch
    b.frame(Math.round(w / 2 - 4), Math.round(h * 0.62), 8, 7, P.grey[5]);
    // blue mission stripe
    b.hline(2, w - 3, h - 4, P.blue[4]); b.hline(1, w - 2, h - 3, P.blue[3]);
  } else {
    b.set(Math.round(w / 2) - 2, Math.round(h * 0.45), P.space[2]); b.set(Math.round(w / 2) + 1, Math.round(h * 0.45), P.space[2]);
    b.hline(1, w - 2, h - 2, P.blue[4]);
  }
  return b;
}

function las(w = 8, h = 30) {
  const b = new Bitmap(w, h);
  const cx = Math.floor(w / 2);
  // nose cone + motor
  b.poly([[cx - 2, 8], [cx + 2, 8], [cx, 0]], P.red[4]); b.set(cx, 1, P.red[6]);
  cyl(b, cx - 2, 8, 4, Math.round(h * 0.35), [P.red[2], P.red[3], P.red[4], P.red[5]]);
  const ty = 8 + Math.round(h * 0.35);
  // lattice tower
  for (let y = ty; y < h; y++) {
    const t = (y - ty) / (h - ty);
    const half = 1 + t * (w / 2 - 1);
    b.set(Math.round(cx - half), y, P.grey[6]); b.set(Math.round(cx + half) - 1, y, P.grey[6]);
    if ((y - ty) % 3 === 0) b.hline(Math.round(cx - half), Math.round(cx + half) - 1, y, P.grey[4]);
  }
  return b;
}

function heatShield(w, h, ramp) { const b = new Bitmap(w, h); for (let y = 0; y < h; y++) for (let x = Math.floor(y / 2); x < w - Math.floor(y / 2); x++) b.set(x, y, rampDither(ramp, 0.75 - y / h * 0.5 - Math.abs(x - w / 2) / w * 0.4, x, y)); return b; }

function serviceModule(h) {
  const w = 38;
  const b = new Bitmap(w, h);
  cyl(b, 0, 0, w, h, SILVER);
  // gold foil band at top & bottom
  cyl(b, 0, 0, w, 5, FOIL); cyl(b, 1, h - 4, w - 2, 4, FOIL);
  // panel seams
  for (let y = 9; y < h - 5; y += 10) for (let x = 2; x < w - 2; x++) if ((x + y) % 2 === 0) b.set(x, y, P.grey[5]);
  b.vline(Math.round(w * 0.7), 6, h - 6, P.grey[6]);
  // blue band with agency marks
  b.hline(1, w - 2, 6, P.blue[4]);
  // RCS quads
  for (const yy of [Math.round(h * 0.35)]) { b.rect(0, yy, 2, 5, P.grey[3]); b.rect(w - 2, yy, 2, 5, P.grey[3]); }
  return b;
}

function engineBell(w, h, ramp, cooling) {
  const b = new Bitmap(w, h);
  const throat = Math.max(4, Math.round(w * 0.3));
  b.rect(Math.round(w / 2 - throat / 2), 0, throat, 3, P.grey[4]);
  for (let y = 3; y < h; y++) {
    const t = (y - 3) / (h - 4);
    const half = throat / 2 + (w / 2 - throat / 2) * Math.pow(t, 0.7);
    for (let x = Math.round(w / 2 - half); x < Math.round(w / 2 + half); x++) {
      const u = (x - w / 2 + 0.5) / half;
      const l = Math.max(0, -0.5 * u + 0.8 * Math.sqrt(Math.max(0, 1 - u * u)));
      b.set(x, y, rampDither(ramp, l, x, y));
      if (cooling && (x % 2 === 0) && y < h - 2) b.set(x, y, rampDither(COPPER, l * 0.8, x, y));
    }
  }
  b.hline(0, w - 1, h - 1, ramp[1]);
  return b;
}

function solarWing(w, h, seg, cell, cellHi, frameC) {
  const b = new Bitmap(w, h);
  // truss
  b.rect(0, Math.floor(h / 2) - 1, 6, 2, P.grey[6]);
  const sw = Math.floor((w - 6) / seg);
  for (let s = 0; s < seg; s++) {
    const x0 = 6 + s * sw;
    b.rect(x0, 0, sw - 1, h, frameC);
    for (let y = 1; y < h - 1; y++) for (let x = x0 + 1; x < x0 + sw - 2; x++) b.set(x, y, (x % 3 === 0 || y % 3 === 0) ? cell : rampDither([cell, cellHi], 0.3 + ((x + y) % 5) / 10, x, y));
    b.hline(x0 + 1, x0 + sw - 3, 1, cellHi);
  }
  return b;
}

function lander(w, h, opts) {
  const b = new Bitmap(w, h);
  const descH = Math.round(h * 0.34), descW = Math.round(w * 0.62);
  const dx = Math.round((w - descW) / 2), dy = Math.round(h * 0.5);
  // legs
  const footY = h - 3;
  for (const s of [-1, 1]) {
    const ax = Math.round(w / 2 + s * descW / 2), ay = dy + 4;
    const fx = Math.round(w / 2 + s * (w / 2 - 4));
    b.line(ax, ay, fx, footY, P.grey[7]); b.line(ax, ay + 1, fx, footY + 1 - 1, P.grey[6]);
    b.line(ax, dy + descH - 2, fx, footY, P.grey[5]);
    b.rect(fx - 3, footY, 7, 2, P.grey[6]); b.hline(fx - 3, fx + 3, footY, P.grey[8]);
  }
  // descent stage (octagonal gold foil)
  b.poly([[dx + 3, dy], [dx + descW - 3, dy], [dx + descW, dy + 3], [dx + descW, dy + descH - 3], [dx + descW - 3, dy + descH], [dx + 3, dy + descH], [dx, dy + descH - 3], [dx, dy + 3]],
    (x, y) => rampDither(FOIL, 0.25 + ((fbm(x * 0.4, y * 0.4, 4, 2) - 0.3) * 1.2) - (x - w / 2) / w * 0.6, x, y));
  b.vline(Math.round(w / 2), dy + 2, dy + descH - 2, P.gold[2]);
  // descent engine
  const eb = engineBell(Math.round(descW * 0.36), 8, DARK, false);
  b.blit(eb, Math.round(w / 2 - eb.w / 2), dy + descH);
  // ascent stage cabin
  const aw = Math.round(w * 0.56), ah = Math.round(h * 0.4), ax = Math.round((w - aw) / 2), ay = dy - ah + 2;
  b.poly([[ax + 4, ay], [ax + aw - 2, ay], [ax + aw, ay + 6], [ax + aw, ay + ah], [ax, ay + ah], [ax, ay + 8]], (x, y) => rampDither(opts.cabin, 0.85 - (x - ax) / aw * 0.6 - (y - ay) / ah * 0.15, x, y));
  // windows (triangular)
  b.poly([[ax + 4, ay + 8], [ax + 10, ay + 8], [ax + 4, ay + 14]], P.space[2]); b.set(ax + 5, ay + 9, P.space[7]);
  b.poly([[ax + aw - 4, ay + 8], [ax + aw - 10, ay + 8], [ax + aw - 4, ay + 14]], P.space[2]);
  // hatch + docking tunnel
  b.rect(Math.round(w / 2 - 3), ay - 3, 6, 3, P.grey[6]); b.hline(Math.round(w / 2 - 3), Math.round(w / 2 + 2), ay - 3, P.grey[9]);
  b.rect(Math.round(w / 2 - 4), ay + ah - 9, 8, 8, P.grey[4]); b.frame(Math.round(w / 2 - 4), ay + ah - 9, 8, 8, P.grey[2]);
  // RCS quads
  for (const s of [-1, 1]) { const qx = s < 0 ? ax - 3 : ax + aw; b.rect(qx, ay + 10, 3, 3, P.grey[5]); b.set(qx + (s < 0 ? 0 : 2), ay + 9, P.grey[3]); }
  // antenna
  b.vline(ax + aw - 6, ay - 6, ay, P.grey[6]); b.rect(ax + aw - 8, ay - 8, 5, 2, P.grey[8]);
  // ladder on front leg area
  for (let y = dy + descH + 1; y < footY - 2; y += 2) b.hline(Math.round(w / 2 + descW / 2 - 2), Math.round(w / 2 + descW / 2), y, P.grey[6]);
  if (opts.extraDeck) { b.rect(dx - 4, dy + 6, 4, 10, FOIL[3]); b.rect(dx + descW, dy + 6, 4, 10, FOIL[3]); }
  return b;
}

export function buildParts() {
  const parts = {};
  parts.capsule = done(capsule(40, 28), 'capsule');
  parts.las = done(las(8, 30), 'las');
  done(heatShield(42, 4, [P.brick[1], P.brick[2], P.brick[3], P.brick[4]]), 'hs_std');
  done(heatShield(44, 6, [P.grey[0], P.grey[1], P.brick[1], P.brick[2]]), 'hs_thick');
  done(serviceModule(30), 'sm_s'); done(serviceModule(40), 'sm_m'); done(serviceModule(50), 'sm_l');
  done(engineBell(18, 14, [P.grey[1], P.grey[2], P.grey[3], P.purple[3], P.grey[5]], false), 'eng_hyper');
  done(engineBell(24, 20, DARK, true), 'eng_methalox');
  done(solarWing(44, 12, 2, P.blue[1], P.blue[3], P.grey[6]), 'pwr_solar4');
  done(solarWing(64, 14, 3, P.purple[1], P.purple[4], P.gold[4]), 'pwr_solar8');
  // fuel cell cutaway: reactant spheres
  const fc = new Bitmap(28, 12); fc.rect(0, 0, 28, 12, P.grey[2]);
  for (const cx of [5, 14, 23]) fc.circle(cx, 6, 4, (x, y, nx, ny) => rampDither(cx === 14 ? [P.blue[2], P.blue[4], P.blue[6], P.blue[7]] : SILVER, 0.6 - nx * 0.3 - ny * 0.3, x, y));
  done(fc, 'pwr_fuelcell');
  // radiators
  const rs = new Bitmap(10, 22); rs.rect(0, 0, 10, 22, '#f0f0f8'); for (let y = 1; y < 22; y += 3) rs.hline(1, 8, y, P.grey[7]); rs.vline(0, 0, 21, P.grey[6]);
  done(rs, 'thr_std');
  const re = new Bitmap(10, 28); re.poly([[0, 0], [4, 0], [10, 27], [5, 27]], '#eef0f8'); for (let y = 2; y < 27; y += 3) re.line(Math.round(y * 0.2), y, Math.round(y * 0.2) + 4, y, P.grey[6]);
  done(re, 'thr_ext');
  // battery packs
  const bat = new Bitmap(8, 6); bat.rect(0, 0, 8, 6, P.grey[3]); bat.rect(1, 1, 6, 3, P.grey[5]); bat.hline(1, 6, 4, P.green[5]); bat.set(6, 1, P.green[6]);
  done(bat, 'battery');
  // comms
  const sb = new Bitmap(7, 12); sb.vline(1, 2, 11, P.grey[7]); sb.vline(5, 0, 11, P.grey[7]); sb.set(1, 1, P.grey[9]); sb.set(5, 0, '#fff'); sb.rect(0, 10, 7, 2, P.grey[4]);
  done(sb, 'com_sband');
  const hga = new Bitmap(22, 22); hga.line(0, 21, 10, 11, P.grey[6]); hga.line(1, 21, 11, 11, P.grey[5]);
  hga.ellipse(14, 8, 7, 7, (x, y, nx, ny) => rampDither(WHITE, 0.8 - nx * 0.4 + ny * 0.2, x, y)); hga.ring(14, 8, 7, P.grey[6]); hga.line(14, 8, 18, 4, P.grey[4]); hga.set(18, 4, P.gold[6]);
  done(hga, 'com_hga');
  const ls = new Bitmap(12, 14); ls.rect(3, 10, 6, 4, P.grey[4]); ls.rect(5, 6, 2, 4, P.grey[6]);
  cyl(ls, 1, 0, 10, 7, [P.grey[1], P.grey[3], P.grey[6], P.grey[8]]); ls.ellipse(9, 3, 2, 3, P.teal[6]); ls.set(9, 2, '#fff');
  done(ls, 'com_laser');
  const ds = new Bitmap(7, 5); ds.rect(0, 0, 7, 5, P.grey[4]); ds.hline(1, 5, 1, P.grey[7]); ds.set(5, 3, P.red[5]); done(ds, 'dat_s');
  const dl = new Bitmap(8, 6); dl.rect(0, 0, 8, 6, P.gold[3]); dl.hline(1, 6, 1, P.gold[6]); dl.set(6, 4, P.teal[6]); dl.set(5, 4, P.teal[6]); done(dl, 'dat_l');
  // life support
  const lo = new Bitmap(14, 8); for (const cx of [3.5, 10.5]) lo.circle(cx, 4, 3.4, (x, y, nx, ny) => rampDither([P.teal[2], P.teal[4], P.teal[5], P.teal[7]], 0.7 - nx * 0.3 - ny * 0.3, x, y)); done(lo, 'ls_open');
  const lr = new Bitmap(12, 18); cyl(lr, 1, 0, 10, 14, [P.teal[1], P.teal[3], P.teal[5], P.teal[6]]); lr.hline(1, 10, 4, P.grey[8]); lr.hline(1, 10, 9, P.grey[8]); lr.vline(3, 14, 17, P.grey[6]); lr.vline(8, 14, 17, P.grey[6]); lr.set(6, 2, P.green[6]);
  done(lr, 'ls_regen');
  // guidance
  const st = new Bitmap(6, 6); st.rect(1, 1, 4, 5, P.grey[2]); st.rect(0, 0, 6, 2, P.grey[5]); st.set(2, 3, P.space[6]); done(st, 'gnc_std');
  const trn = new Bitmap(10, 8); trn.rect(0, 2, 10, 6, P.grey[3]); trn.rect(1, 3, 8, 4, P.grey[5]); trn.circle(3, 5, 1.5, P.red[5]); trn.circle(7, 5, 1.5, P.teal[6]); trn.rect(3, 0, 4, 2, P.grey[6]); done(trn, 'gnc_trn');
  // safety
  const rd = new Bitmap(9, 7); rd.rect(0, 0, 9, 7, P.grey[3]); rd.rect(1, 1, 3, 5, P.grey[5]); rd.rect(5, 1, 3, 5, P.grey[5]); rd.set(2, 2, P.green[6]); rd.set(6, 2, P.green[6]); done(rd, 'saf_redund');
  const sh = new Bitmap(9, 9); sh.poly([[0, 0], [8, 0], [8, 5], [4, 8], [0, 5]], P.gold[5]); sh.circle(4, 3.5, 1.5, P.ink); sh.set(4, 3, P.gold[7]); done(sh, 'saf_shelter');
  // science
  const mc = new Bitmap(10, 10); mc.rect(0, 0, 10, 10, P.grey[2]); mc.circle(5, 5, 3.5, P.grey[5]); mc.circle(5, 5, 2.4, P.space[2]); mc.set(4, 4, P.space[8]); done(mc, 'sci_mapcam');
  const ns = new Bitmap(7, 11); cyl(ns, 0, 0, 7, 11, [P.purple[2], P.purple[4], P.purple[5], P.purple[6]]); ns.hline(0, 6, 3, P.grey[8]); ns.hline(0, 6, 7, P.grey[8]); done(ns, 'sci_neutron');
  const se = new Bitmap(12, 8); se.rect(0, 2, 12, 6, P.gold[4]); se.rect(1, 3, 10, 4, P.gold[5]); se.ellipse(6, 2, 4, 2, '#e8e8f0'); se.set(6, 1, P.grey[5]); done(se, 'sci_seismo');
  const sk = new Bitmap(10, 7); sk.rect(0, 1, 10, 6, P.grey[6]); sk.hline(0, 9, 1, P.grey[8]); sk.rect(4, 0, 2, 1, P.grey[4]); sk.vline(8, 0, 6, P.orange[4]); done(sk, 'sci_samples');
  const pc = new Bitmap(6, 18); pc.vline(2, 4, 17, P.grey[7]); pc.vline(3, 4, 17, P.grey[5]); pc.rect(0, 0, 6, 4, P.grey[3]); pc.set(1, 1, P.space[7]); pc.set(4, 1, P.space[7]); pc.rect(1, 16, 4, 2, P.grey[4]); done(pc, 'sci_pancam');
  const rr = new Bitmap(12, 7); rr.rect(0, 0, 12, 5, P.grey[5]); for (let y = 1; y < 4; y += 2) for (let x = 1; x < 11; x += 2) rr.set(x, y, P.space[7]); rr.vline(2, 5, 6, P.grey[4]); rr.vline(9, 5, 6, P.grey[4]); done(rr, 'sci_retro');
  // landers
  done(lander(56, 50, { cabin: [P.grey[4], P.grey[5], P.grey[7], P.grey[8], P.grey[9]] }), 'lander_scout');
  done(lander(70, 62, { cabin: [P.grey[4], P.grey[6], P.grey[7], P.grey[8], '#ffffff'], extraDeck: true }), 'lander_path');
  // small scale capsule/LAS for rockets
  done(capsule(20, 14), 'capsule_small');
  done(las(5, 16), 'las_small');
  // ascent stage only (for liftoff)
  const asc = lander(56, 50, { cabin: [P.grey[4], P.grey[5], P.grey[7], P.grey[8], P.grey[9]] }).crop(0, 0, 56, 26);
  save(asc, 'spacecraft/ascent_scout.png');
  const asc2 = lander(70, 62, { cabin: [P.grey[4], P.grey[6], P.grey[7], P.grey[8], '#ffffff'], extraDeck: true }).crop(0, 0, 70, 32);
  save(asc2, 'spacecraft/ascent_path.png');
}

// --------------------------------------------------------------- rockets
function rocketStage(w, h, body, opts = {}) {
  const b = new Bitmap(w, h);
  cyl(b, 0, 0, w, h, body);
  if (opts.stripe) for (let y = opts.stripe[0]; y < opts.stripe[1]; y++) for (let x = 0; x < w; x++) b.set(x, y, rampDither(opts.stripeRamp, 0.6 - Math.abs(x - w * 0.35) / w, x, y));
  if (opts.label) { const lw = opts.label.length * 6; drawText(b, opts.label.split('').join(''), Math.round(w / 2 - 3), 6, 1, () => P.blue[3]); void lw; }
  if (opts.engines) { const e = engineBell(Math.round(w * 0.32), 8, DARK, false); for (const ex of opts.engines) b.blit(e, Math.round(w * ex - e.w / 2), h - 8); }
  if (opts.fins) for (const s of [-1, 1]) { /* drawn in parent */ }
  return b;
}

function verticalText(b, text, x, y, color) {
  let cy = y;
  for (const ch of text) { drawText(b, ch, x, cy, 1, () => color); cy += 9; }
}

export function buildRockets() {
  // --- Bayhawk-M (medium, single core)
  {
    const w = 24;
    const s1 = rocketStage(w, 84, WHITE, { stripe: [70, 76], stripeRamp: [P.blue[2], P.blue[4], P.blue[5]] });
    verticalText(s1, 'PSEA', 9, 14, P.blue[3]);
    const fin = (bmp) => { bmp.poly([[0, bmp.h - 1], [0, bmp.h - 14], [4, bmp.h - 6], [4, bmp.h - 1]], P.grey[3]); };
    const s1f = new Bitmap(w + 8, 92); s1f.blit(s1, 4, 0); const e = engineBell(10, 8, DARK, false); s1f.blit(e, 11, 84); fin(s1f);
    const fr = new Bitmap(4, 92); fin(fr); s1f.blit(fr, w + 4, 0, { flipX: true });
    save(s1f.outline(P.ink), 'launch/lv_bayhawk_s1.png');
    const s2 = new Bitmap(w, 60); cyl(s2, 0, 0, w, 34, WHITE); cyl(s2, 0, 34, w, 26, [P.grey[5], P.grey[7], P.grey[8], P.grey[9]]);
    s2.hline(0, w - 1, 34, P.grey[4]); s2.hline(0, w - 1, 33, P.blue[4]);
    // fairing taper top (adapter)
    const s2b = new Bitmap(w, 64); s2b.blit(s2, 0, 4); s2b.poly([[3, 4], [w - 3, 4], [w, 8], [0, 8]], P.grey[8]);
    save(s2b.outline(P.ink), 'launch/lv_bayhawk_s2.png');
  }
  // --- Estuary Heavy (core + 2 boosters)
  {
    const w = 26;
    const s1 = rocketStage(w, 90, [P.orange[2], P.orange[3], P.orange[4], P.orange[5], P.orange[6]], {});
    for (let y = 8; y < 90; y += 12) s1.hline(0, w - 1, y, P.orange[2]);
    const s1f = new Bitmap(w, 98); s1f.blit(s1, 0, 0); s1f.blit(engineBell(10, 8, DARK, false), 2, 90); s1f.blit(engineBell(10, 8, DARK, false), 14, 90);
    save(s1f.outline(P.ink), 'launch/lv_estuary_s1.png');
    const bw = 12;
    const bst = new Bitmap(bw, 86); cyl(bst, 0, 6, bw, 72, WHITE); bst.poly([[0, 6], [bw, 6], [bw / 2, 0]], P.grey[8]);
    bst.hline(0, bw - 1, 40, P.grey[5]); bst.hline(0, bw - 1, 60, P.grey[5]); bst.rect(0, 20, bw, 3, P.blue[4]);
    bst.blit(engineBell(10, 8, DARK, false), 1, 78);
    save(bst.outline(P.ink), 'launch/lv_estuary_booster.png');
    const s2 = new Bitmap(w, 66); cyl(s2, 0, 6, w, 34, WHITE); cyl(s2, 0, 40, w, 26, [P.orange[3], P.orange[4], P.orange[5], P.orange[6]]); s2.poly([[3, 6], [w - 3, 6], [w, 10], [0, 10]], P.grey[8]);
    verticalText(s2, 'TOWN', 10, 8, P.blue[3]);
    save(s2.outline(P.ink), 'launch/lv_estuary_s2.png');
  }
  // --- Golden Bear SHLV (stainless super heavy)
  {
    const w = 34;
    const s1 = new Bitmap(w + 6, 112); cyl(s1, 3, 0, w, 104, STEEL);
    for (let y = 6; y < 104; y += 9) for (let x = 3; x < w + 3; x++) if ((x + y) % 3) s1.set(x, y, P.grey[5]);
    s1.rect(0, 6, 3, 6, P.grey[4]); s1.rect(w + 3, 6, 3, 6, P.grey[4]); // grid fins
    for (let k = 0; k < 3; k++) s1.blit(engineBell(10, 8, DARK, false), 4 + k * 11, 104);
    save(s1.outline(P.ink), 'launch/lv_goldenbear_s1.png');
    const s2 = new Bitmap(w, 70); cyl(s2, 0, 6, w, 64, STEEL); s2.poly([[4, 6], [w - 4, 6], [w, 12], [0, 12]], P.grey[8]);
    s2.rect(0, 40, w, 3, P.gold[5]); verticalText(s2, 'GOLD', 14, 12, P.gold[3]);
    save(s2.outline(P.ink), 'launch/lv_goldenbear_s2.png');
  }
}

// ------------------------------------------------------------ launch site
export function buildLaunchSite() {
  // tall sky 480 x 810: pre-dawn, ground at bottom
  const H = 810, W = 480;
  const b = new Bitmap(W, H);
  const ramp = [P.space[0], P.space[1], P.space[2], P.space[3], P.space[4], P.purple[3], P.sky[5], P.sky[7], P.sky[8], P.sky[9], P.sky[10]];
  for (let y = 0; y < H; y++) { const t = Math.pow(y / (H - 60), 1.6); for (let x = 0; x < W; x++) b.set(x, y, rampDither(ramp, Math.min(1, t), x, y)); }
  stars(b, 380, 77, { y1: 520 });
  // distant ocean + coast (horizon at y=730)
  for (let y = 730; y < H; y++) for (let x = 0; x < W; x++) b.set(x, y, rampDither([P.sky[6], P.water[4], P.water[3], P.water[2]], (y - 730) / 30, x, y));
  for (let x = 0; x < W; x++) { const hy = 744 + Math.round(fbm(x * 0.03, 1, 5, 3) * 14); for (let y = hy; y < H; y++) b.set(x, y, rampDither([P.green[2], P.green[1], P.green[0]], (y - hy) / 40, x, y)); }
  for (let x = 0; x < W; x++) for (let y = 790; y < H; y++) b.set(x, y, rampDither([P.grey[4], P.grey[3]], (y - 790) / 20, x, y));
  save(b, 'launch/sky_tall.png');
  // launch tower 40x200 lattice
  const t = new Bitmap(46, 200);
  for (let y = 0; y < 200; y++) { t.set(4, y, P.red[3]); t.set(5, y, P.red[2]); t.set(22, y, P.red[3]); t.set(23, y, P.red[2]); if (y % 8 === 0) { t.hline(4, 23, y, P.red[3]); } if (y % 8 < 8) { const k = y % 8; t.set(4 + Math.round(k * 2.3), y, P.red[2]); } }
  t.rect(24, 30, 22, 3, P.grey[5]); t.rect(42, 26, 4, 8, P.grey[6]); // crew access arm
  t.rect(24, 90, 18, 2, P.grey[4]); t.rect(24, 140, 18, 2, P.grey[4]);
  t.vline(13, 0, 6, P.grey[6]); t.set(13, 0, P.red[6]);
  for (const y of [20, 70, 120, 170]) t.set(4, y, P.gold[7]);
  save(t.outline(P.ink), 'launch/tower.png');
  // pad base 160x26
  const pad = new Bitmap(170, 26);
  pad.rect(0, 6, 170, 20, P.grey[4]); pad.rect(0, 6, 170, 2, P.grey[6]); pad.rect(60, 8, 50, 18, P.grey[1]); pad.rect(64, 10, 42, 16, P.ink);
  for (let x = 0; x < 170; x += 10) pad.rect(x, 14, 6, 3, P.gold[5]);
  pad.rect(10, 0, 4, 6, P.grey[5]); pad.rect(156, 0, 4, 6, P.grey[5]);
  save(pad.outline(P.ink), 'launch/pad.png');
  // lightning mast
  const lm = new Bitmap(6, 150); lm.vline(2, 0, 149, P.grey[6]); lm.vline(3, 0, 149, P.grey[4]); for (let y = 4; y < 150; y += 10) lm.hline(1, 4, y, P.grey[5]); lm.set(2, 0, P.red[6]);
  save(lm.outline(P.ink), 'launch/mast.png');
  // clouds 480x80 transparent
  const c = new Bitmap(480, 80);
  const r = rng(91);
  for (let i = 0; i < 14; i++) {
    const cx = r.int(0, 480), cy = r.int(20, 60), rx = r.int(24, 60), ry = r.int(6, 14);
    c.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => rampDither([P.sky[11], P.sky[10], P.sky[8], P.sky[6]], 0.2 + ny * 0.5, x, y));
  }
  save(c, 'launch/clouds.png');
}

// ------------------------------------------------------------- interiors
export function buildHangar() {
  const W = 480, H = 270;
  const b = new Bitmap(W, H);
  // back wall: corrugated steel
  for (let y = 0; y < 200; y++) for (let x = 0; x < W; x++) {
    const rib = x % 8;
    b.set(x, y, rampDither([P.space[1], P.space[2], P.space[3], P.blue[2]], (rib < 2 ? 0.55 : rib < 5 ? 0.35 : 0.2) + (1 - y / 200) * 0.2, x, y));
  }
  // giant door open to the night sky in the middle
  const dx0 = 150, dx1 = 330, dTop = 26;
  for (let y = dTop; y < 200; y++) for (let x = dx0; x < dx1; x++) b.set(x, y, rampDither([P.space[0], P.space[1], P.space[2], P.purple[2], P.sky[4]], (y - dTop) / 175, x, y));
  const sky = new Bitmap(dx1 - dx0, 200 - dTop); stars(sky, 70, 5); b.blit(sky, dx0, dTop);
  // distant hills & pad lights through door
  for (let x = dx0; x < dx1; x++) { const hy = 178 + Math.round(Math.sin(x * 0.05) * 3 + fbm(x * 0.1, 2, 3, 2) * 5); for (let y = hy; y < 200; y++) b.set(x, y, P.space[1]); }
  for (let x = dx0 + 6; x < dx1; x += 17) b.set(x, 186 + (x % 3), P.gold[6]);
  b.rect(dx0 - 6, dTop - 6, dx1 - dx0 + 12, 6, P.grey[3]); b.rect(dx0 - 6, dTop - 6, 6, 206 - dTop, P.grey[3]); b.rect(dx1, dTop - 6, 6, 206 - dTop, P.grey[3]);
  for (let y = dTop; y < 200; y += 6) { b.set(dx0 - 4, y, P.gold[5]); b.set(dx1 + 3, y, P.gold[5]); }
  // roof trusses
  for (let x = 0; x < W; x++) { b.set(x, 8, P.grey[4]); b.set(x, 9, P.grey[3]); b.set(x, 18, P.grey[4]); }
  for (let x = 0; x < W; x += 12) { b.line(x, 9, x + 6, 18, P.grey[3]); b.line(x + 12, 9, x + 6, 18, P.grey[3]); }
  // overhead crane rail + hook
  b.rect(0, 20, W, 3, P.gold[4]); b.hline(0, W - 1, 20, P.gold[6]);
  b.rect(226, 22, 28, 6, P.gold[3]); b.vline(240, 28, 40, P.grey[5]); b.rect(237, 40, 7, 4, P.grey[4]);
  // hanging lamps
  for (const lx of [60, 140, 340, 420]) {
    b.vline(lx, 23, 34, P.grey[3]); b.poly([[lx - 6, 40], [lx + 6, 40], [lx + 3, 34], [lx - 3, 34]], P.grey[4]); b.hline(lx - 5, lx + 5, 40, P.gold[7]);
    for (let y = 41; y < 120; y++) for (let x = lx - 30; x < lx + 30; x++) { const spread = 5 + (y - 41) * 0.35; if (Math.abs(x - lx) < spread && bayer(x, y) < 0.09 * (1 - (y - 41) / 80)) b.set(x, y, [255, 230, 170, 90]); }
  }
  // side walls: tool racks + banner
  b.rect(12, 60, 70, 40, P.grey[2]); b.frame(12, 60, 70, 40, P.grey[4]);
  for (let k = 0; k < 8; k++) { b.vline(18 + k * 8, 66, 66 + 6 + (k % 3) * 4, P.grey[6]); b.rect(17 + k * 8, 72 + (k % 3) * 4, 3, 3, [P.red[4], P.gold[5], P.blue[5]][k % 3]); }
  b.rect(398, 52, 64, 30, P.blue[3]); b.frame(398, 52, 64, 30, P.gold[5]);
  drawText(b, 'TOWN-1', 412, 57, 1, () => P.gold[6]);
  drawText(b, 'BUILD BAY', 405, 69, 1, () => '#ffffff');
  // catwalk
  b.rect(0, 120, 140, 3, P.grey[4]); b.rect(340, 120, 140, 3, P.grey[4]);
  for (let x = 0; x < 140; x += 6) b.vline(x, 112, 120, P.grey[3]); for (let x = 340; x < W; x += 6) b.vline(x, 112, 120, P.grey[3]);
  b.hline(0, 139, 112, P.grey[5]); b.hline(340, W - 1, 112, P.grey[5]);
  // floor
  for (let y = 200; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (y - 200) / 70;
    let c = rampDither([P.grey[4], P.grey[3], P.grey[2], P.grey[1]], t, x, y);
    const persp = (x - 240) / (1 + (y - 200) / 18);
    if (Math.abs(persp % 24) < 0.6 || (y - 200) % 12 === 0) c = P.grey[2];
    b.set(x, y, c);
  }
  // build platform with hazard stripes
  b.poly([[150, 236], [330, 236], [346, 252], [134, 252]], (x, y) => rampDither([P.grey[6], P.grey[5]], (y - 236) / 16, x, y));
  for (let x = 134; x < 346; x++) for (let y = 252; y < 256; y++) b.set(x, y, Math.floor((x + y) / 4) % 2 ? P.gold[5] : P.ink);
  b.hline(150, 329, 236, P.grey[8]);
  // tool carts & crates
  b.rect(40, 210, 34, 18, P.red[3]); b.rect(40, 210, 34, 3, P.red[5]); b.rect(44, 228, 4, 4, P.ink); b.rect(66, 228, 4, 4, P.ink); for (let k = 0; k < 3; k++) b.hline(43, 70, 215 + k * 4, P.red[2]);
  b.rect(400, 206, 40, 26, P.brick[4]); b.frame(400, 206, 40, 26, P.brick[2]); b.line(400, 206, 439, 231, P.brick[2]); b.line(439, 206, 400, 231, P.brick[2]);
  b.rect(446, 214, 26, 18, P.brick[5]); b.frame(446, 214, 26, 18, P.brick[3]);
  // scaffolding around build area
  for (const sx of [156, 318]) { b.rect(sx, 46, 4, 190, P.gold[4]); b.vline(sx, 46, 235, P.gold[6]); for (let y = 54; y < 236; y += 20) b.line(sx + (sx < 200 ? 4 : -1), y, sx + (sx < 200 ? 16 : -12), y + 8, P.gold[3]); }
  save(b, 'backgrounds/hangar.png');
}

export function buildMissionControl() {
  const W = 480, H = 270;
  const b = new Bitmap(W, H);
  // room
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b.set(x, y, rampDither([P.space[0], P.space[1], P.space[2]], 0.2 + y / H * 0.6, x, y));
  // ceiling lights strip
  for (let x = 20; x < W - 20; x += 40) b.rect(x, 4, 24, 2, P.space[6]);
  // big wall screens (frames; content animated at runtime)
  const screens = [[16, 18, 140, 84], [170, 12, 140, 96], [324, 18, 140, 84]];
  for (const [x, y, w, h] of screens) {
    b.rect(x - 3, y - 3, w + 6, h + 6, P.grey[2]); b.frame(x - 3, y - 3, w + 6, h + 6, P.grey[4]);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) b.set(x + i, y + j, rampDither([P.space[1], P.space[2], P.teal[0]], 0.4 + Math.sin(j * 0.8) * 0.05, x + i, y + j));
    for (let j = 0; j < h; j += 2) for (let i = 0; i < w; i++) if (bayer(i, j) < 0.2) b.set(x + i, y + j, P.space[0]);
  }
  // left screen: world map silhouette dots
  for (let j = 0; j < 30; j++) for (let i = 0; i < 64; i++) { const lat = 75 - j * 5, lon = -180 + i * 5.6; if (isLand(lat, lon)) b.set(20 + i * 2, 30 + j * 2, P.teal[5]); }
  // clock bar
  b.rect(170, 112, 140, 12, P.ink); b.frame(170, 112, 140, 12, P.grey[3]);
  // console tiers
  for (let tier = 0; tier < 3; tier++) {
    const y = 150 + tier * 40, h = 16;
    const shade = [P.grey[2], P.grey[3], P.grey[4]][tier];
    b.rect(0, y, W, h, shade); b.hline(0, W - 1, y, P.grey[5 + Math.min(tier, 2)]);
    b.rect(0, y + h, W, 6, P.grey[1]);
    for (let x = 10 + tier * 6; x < W - 10; x += 52 - tier * 4) {
      const mw = 22 + tier * 4, mh = 12 + tier * 2;
      b.rect(x, y - mh, mw, mh, P.grey[1]); b.rect(x + 2, y - mh + 2, mw - 4, mh - 4, P.teal[1]);
      for (let k = 0; k < mw - 8; k += 3) b.set(x + 4 + k, y - mh + 4 + (k * 7) % (mh - 7), P.teal[5]);
      for (let k = 0; k < 6; k++) b.set(x + 2 + k * 3, y + 6, [P.red[5], P.gold[6], P.green[6]][k % 3]);
    }
  }
  // desk lamps glow near floor
  for (let y = 236; y < H; y++) for (let x = 0; x < W; x++) if (bayer(x, y) < 0.06) b.set(x, y, P.space[4]);
  save(b, 'backgrounds/mission_control.png');
}

// rough land mask shared with space.mjs
import { isLand } from './worldmap.mjs';
export { isLand };
