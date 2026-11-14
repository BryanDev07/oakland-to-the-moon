import { describe, expect, it } from 'vitest';
import { autopilot, createLanding, hazardAt, makeTerrain, stepLanding, abortLanding, agl } from '../../src/simulation/landing';

const opts = { massKg: 7800, propKg: 1200, thrustN: 45000, ispS: 311, trn: true };
function fly(seed: number, o = opts, hazard = 0.4) {
  const t = makeTerrain(seed, hazard);
  const L = createLanding(t, o);
  let n = 0;
  while (!L.done && n++ < 30 * 400) stepLanding(L, t, autopilot(L, t));
  return { L, t };
}

describe('landing', () => {
  it('terrain is deterministic and has safe zones', () => {
    const a = makeTerrain(5, 0.5), b = makeTerrain(5, 0.5);
    expect(a.heights).toEqual(b.heights);
    expect(a.safeZones.length).toBeGreaterThan(0);
  });
  it('TRN autopilot lands softly across seeds', () => {
    let soft = 0;
    for (let seed = 1; seed <= 15; seed++) { const { L } = fly(seed); if (L.outcome === 'soft') soft++; }
    expect(soft).toBeGreaterThanOrEqual(13);
  });
  it('without propellant the lander aborts to orbit', () => {
    const t = makeTerrain(3, 0.3);
    const L = createLanding(t, { ...opts, propKg: 5 });
    let n = 0;
    while (!L.done && n++ < 30 * 200) stepLanding(L, t, { throttle: 1, tilt: 0 });
    expect(L.outcome).toBe('abort');
  });
  it('free-fall impact is not a soft landing', () => {
    const t = makeTerrain(3, 0.3);
    const L = createLanding(t, opts);
    let n = 0;
    while (!L.done && n++ < 30 * 200) stepLanding(L, t, { throttle: 0, tilt: 0 });
    expect(L.outcome).toBe('crash');
  });
  it('crew abort is refused below 10 m', () => {
    const t = makeTerrain(3, 0.3);
    const L = createLanding(t, opts);
    expect(abortLanding(L, t)).toBe(true);
    const L2 = createLanding(t, opts);
    L2.y = L2.y - agl(L2, t) + 5;
    expect(abortLanding(L2, t)).toBe(false);
  });
  it('propellant decreases while thrusting', () => {
    const t = makeTerrain(3, 0.3);
    const L = createLanding(t, opts);
    for (let i = 0; i < 30; i++) stepLanding(L, t, { throttle: 0.8, tilt: 0 });
    expect(L.propKg).toBeLessThan(opts.propKg);
  });
  it('hazard detection reports boulders', () => {
    const t = makeTerrain(9, 0.8);
    expect(hazardAt(t, t.boulders[0].x)).toBe(true);
  });
});
