/**
 * Final-approach lunar landing simulation (2-D). Begins after the automatic braking phase at
 * ~500 m altitude. Point-mass lander with throttleable engine and tilt; lunar gravity; propellant
 * flow from the rocket equation's mass-flow relation. Deterministic for a given seed + inputs.
 */
import { MOON_G } from './constants';
import { massFlow } from './rocket';
import { Rng } from './rng';

export interface Boulder { x: number; r: number }
export interface Terrain { width: number; heights: number[]; boulders: Boulder[]; safeZones: { x0: number; x1: number }[]; designatedX: number }
export interface LanderInput { throttle: number; tilt: number } // throttle 0..1, tilt -1..1
export interface LandingSim {
  x: number; y: number; vx: number; vy: number;
  throttle: number; tilt: number;
  massKg: number; propKg: number; propStartKg: number; thrustN: number; ispS: number;
  t: number; done: boolean;
  outcome: 'none' | 'soft' | 'hard' | 'abort' | 'crash';
  vImpact: number; onHazard: boolean; trn: boolean;
  target: number; message: string;
}

export const TERRAIN_STEP = 2; // m per height sample
export const LANDER_HALF_WIDTH = 4; // m (footpad span ~8 m)

export function makeTerrain(seed: number, hazard: number): Terrain {
  const rng = new Rng(seed ^ 0x7e11);
  const width = 1600;
  const n = width / TERRAIN_STEP + 1;
  const phases = [rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)];
  const heights: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i * TERRAIN_STEP;
    heights.push(14 + 9 * Math.sin(x / 210 + phases[0]) + 5 * Math.sin(x / 77 + phases[1]) * hazard * 1.6 + 2.2 * Math.sin(x / 23 + phases[2]) * hazard + 0.8 * Math.sin(x / 7 + phases[3]) * hazard);
  }
  // craters
  const nCraters = Math.round(4 + hazard * 10);
  for (let k = 0; k < nCraters; k++) {
    const cx = rng.range(300, width - 100), r = rng.range(8, 30) * (0.6 + hazard);
    for (let i = 0; i < n; i++) {
      const d = Math.abs(i * TERRAIN_STEP - cx) / r;
      if (d < 1) heights[i] -= (1 - d * d) * r * 0.25;
      else if (d < 1.3) heights[i] += (1.3 - d) * r * 0.12;
    }
  }
  const boulders: Boulder[] = [];
  const nB = Math.round(10 + hazard * 46);
  for (let k = 0; k < nB; k++) boulders.push({ x: rng.range(250, width - 40), r: rng.range(1.2, 3.5) * (0.7 + hazard * 0.8) });
  const t: Terrain = { width, heights, boulders, safeZones: [], designatedX: 0 };
  // safe zones: >= 16 m wide, slope < 6 degrees, no boulders
  let run = -1;
  for (let x = 250; x < width - 30; x += 2) {
    const ok = slopeDeg(t, x) < 6 && !boulders.some((b) => Math.abs(b.x - x) < b.r + LANDER_HALF_WIDTH + 1);
    if (ok && run < 0) run = x;
    if ((!ok || x >= width - 32) && run >= 0) { if (x - run >= 16) t.safeZones.push({ x0: run, x1: x }); run = -1; }
  }
  t.designatedX = Math.round(rng.range(560, 760));
  return t;
}

export function heightAt(t: Terrain, x: number): number {
  const i = Math.max(0, Math.min(t.heights.length - 2, Math.floor(x / TERRAIN_STEP)));
  const f = Math.max(0, Math.min(1, x / TERRAIN_STEP - i));
  return t.heights[i] * (1 - f) + t.heights[i + 1] * f;
}
export function slopeDeg(t: Terrain, x: number): number {
  const a = heightAt(t, x - LANDER_HALF_WIDTH), b = heightAt(t, x + LANDER_HALF_WIDTH);
  return Math.abs(Math.atan2(b - a, LANDER_HALF_WIDTH * 2)) * 180 / Math.PI;
}
export function hazardAt(t: Terrain, x: number): boolean {
  return slopeDeg(t, x) > 8 || t.boulders.some((b) => Math.abs(b.x - x) < b.r + LANDER_HALF_WIDTH * 0.75);
}

export function createLanding(terrain: Terrain, opts: { massKg: number; propKg: number; thrustN: number; ispS: number; trn: boolean }): LandingSim {
  return {
    x: 150, y: 520 + heightAt(terrain, 150), vx: 14, vy: -16, throttle: 0.4, tilt: 0,
    massKg: opts.massKg, propKg: opts.propKg, propStartKg: opts.propKg, thrustN: opts.thrustN, ispS: opts.ispS,
    t: 0, done: false, outcome: 'none', vImpact: 0, onHazard: false, trn: opts.trn, target: terrain.designatedX, message: '',
  };
}

export const agl = (s: LandingSim, t: Terrain) => s.y - heightAt(t, s.x);

export function stepLanding(s: LandingSim, t: Terrain, input: LanderInput, dt = 1 / 30) {
  if (s.done) return;
  s.t += dt;
  // actuator dynamics
  const thrCmd = Math.max(0, Math.min(1, input.throttle));
  s.throttle += Math.max(-1.5 * dt, Math.min(1.5 * dt, thrCmd - s.throttle));
  const tiltCmd = Math.max(-1, Math.min(1, input.tilt)) * 0.4;
  s.tilt += Math.max(-0.8 * dt, Math.min(0.8 * dt, tiltCmd - s.tilt));
  let thrust = s.propKg > 0 ? s.thrustN * s.throttle : 0;
  if (thrust > 0) {
    const used = massFlow(thrust, s.ispS) * dt;
    if (used > s.propKg) { thrust *= s.propKg / used; s.massKg -= s.propKg; s.propKg = 0; }
    else { s.propKg -= used; s.massKg -= used; }
  }
  const a = thrust / s.massKg;
  s.vx += a * Math.sin(s.tilt) * dt;
  s.vy += (a * Math.cos(s.tilt) - MOON_G) * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.x = Math.max(20, Math.min(t.width - 20, s.x));
  const h = agl(s, t);
  if (s.propKg <= 0 && h > 30) { finish(s, 'abort', 0, 'Out of descent propellant! ABORT STAGE fired.'); return; }
  if (h <= 0) {
    s.y = heightAt(t, s.x);
    const v = Math.abs(s.vy), vh = Math.abs(s.vx);
    s.onHazard = hazardAt(t, s.x);
    if (v > 6 || vh > 4 || (s.onHazard && v > 3.5)) finish(s, 'crash', v, 'Impact.');
    else if (v > 3 || vh > 2 || s.onHazard) finish(s, 'hard', v, s.onHazard ? 'Landed on a hazard: the lander tilted on rocks/slope.' : 'Hard touchdown.');
    else finish(s, 'soft', v, 'Contact light! Engine stop.');
  }
}

function finish(s: LandingSim, outcome: LandingSim['outcome'], v: number, msg: string) {
  s.done = true; s.outcome = outcome; s.vImpact = v; s.message = msg;
}

export function abortLanding(s: LandingSim, t: Terrain): boolean {
  if (s.done || agl(s, t) < 10) return false;
  finish(s, 'abort', 0, 'ABORT STAGE commanded by the crew.');
  return true;
}

/** Choose an autopilot target. With TRN the guidance knows the true safe zones from far away. */
export function inSafeZone(t: Terrain, x: number) { return t.safeZones.some((z) => x >= z.x0 + LANDER_HALF_WIDTH && x <= z.x1 - LANDER_HALF_WIDTH); }
export function chooseTarget(s: LandingSim, t: Terrain): number {
  if (inSafeZone(t, s.target)) return s.target;
  const h = agl(s, t);
  if (s.trn || h < 110) {
    // hazard detection: lidar (TRN) from high up, or the crew's eyes only at low altitude
    const reach = s.trn ? 420 : 70;
    const cands = t.safeZones.filter((z) => Math.abs((z.x0 + z.x1) / 2 - s.target) < reach);
    if (cands.length) return pickWide(cands, s);
  }
  return s.target;
}
function pickWide(cands: { x0: number; x1: number }[], s: LandingSim): number {
  let best = cands[0], bestScore = -Infinity;
  for (const z of cands) { const c = (z.x0 + z.x1) / 2; const score = (z.x1 - z.x0) * 2 - Math.abs(c - s.target) * 0.5 - Math.abs(c - s.x) * 0.15; if (score > bestScore) { bestScore = score; best = z; } }
  return (best.x0 + best.x1) / 2;
}

/** Simple guidance law: velocity-tracking controller for vertical and horizontal channels. */
export function autopilot(s: LandingSim, t: Terrain): LanderInput {
  s.target = chooseTarget(s, t);
  const dx = s.target - s.x;
  const h = agl(s, t);
  const wantVx = Math.max(-14, Math.min(14, dx * 0.07));
  const tiltRad = Math.max(-0.4, Math.min(0.4, (wantVx - s.vx) * 0.09));
  let wantVy: number;
  if (Math.abs(dx) > 12 && h < 60) wantVy = -0.6;
  else wantVy = -Math.max(0.9, Math.min(18, h * 0.09));
  const aNeed = MOON_G + (wantVy - s.vy) * 1.4;
  const throttle = (aNeed * s.massKg) / (s.thrustN * Math.cos(s.tilt));
  return { throttle: Math.max(0, Math.min(1, throttle)), tilt: tiltRad / 0.4 };
}

/** D4: autopilot time speed-up (1x / 2x / 4x). Manual flying stays at 1x. */
export const LANDING_SPEEDS = [1, 2, 4] as const;
export const LANDING_STEP = 1 / 30;
/**
 * Advance the landing by one frame of real time `frameDt` at `speed`, always in fixed 1/30 s physics
 * steps (never a bigger step), so fuel, altitude and touchdown are the same at every speed.
 * Returns the leftover time to carry into the next frame.
 */
export function advanceLanding(s: LandingSim, t: Terrain, acc: number, frameDt: number, speed: number, input: () => LanderInput): number {
  acc += frameDt * speed;
  let n = 0;
  while (acc >= LANDING_STEP && !s.done && n < 64) { stepLanding(s, t, input(), LANDING_STEP); acc -= LANDING_STEP; n++; }
  return s.done ? 0 : acc;
}
