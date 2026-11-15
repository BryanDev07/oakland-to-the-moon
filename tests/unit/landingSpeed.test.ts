/** D4: autopilot fast-forward uses fixed 1/30 s steps, so 4x lands exactly like 1x. */
import { describe, expect, it } from 'vitest';
import { cloneDesign, REFERENCE_DESIGN } from '../../src/data/mission';
import * as Sim from '../../src/simulation/mission';
import { advanceLanding, autopilot, createLanding, makeTerrain } from '../../src/simulation/landing';

function fly(speed: number) {
  const s = Sim.createMission(cloneDesign(REFERENCE_DESIGN), 221);
  const ap = Sim.approachState(s);
  const T = makeTerrain(s.seed, ap.hazard);
  const L = createLanding(T, ap);
  let acc = 0, frames = 0;
  while (!L.done && frames < 60 * 60 * 10) { acc = advanceLanding(L, T, acc, 1 / 60, speed, () => autopilot(L, T)); frames++; }
  return { L, frames };
}

describe('landing autopilot speed-up', () => {
  it('a 4x autopilot descent ends with the same fuel (within 0.5%) and touchdown speed as 1x, in a quarter of the frames', () => {
    const a = fly(1), b = fly(4);
    expect(a.L.done && b.L.done).toBe(true);
    expect(b.L.outcome).toBe(a.L.outcome);
    expect(Math.abs(b.L.propKg - a.L.propKg)).toBeLessThanOrEqual(Math.abs(a.L.propKg) * 0.005 + 1e-9);
    expect(b.L.vImpact).toBeCloseTo(a.L.vImpact, 6);
    expect(b.frames).toBeLessThan(a.frames / 3);
    expect(fly(2).L.propKg).toBeCloseTo(a.L.propKg, 6);
  });
});
