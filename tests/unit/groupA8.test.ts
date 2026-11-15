/** A8: upper-stage push check and the cabin-leak oxygen estimate. */
import { describe, expect, it } from 'vitest';
import { cloneDesign, REFERENCE_DESIGN } from '../../src/data/mission';
import { analyzeDesign } from '../../src/simulation/spacecraft';
import { reviewDesign } from '../../src/simulation/review';
import { createMission } from '../../src/simulation/mission';
import { LEAK_O2_LB_PER_DAY, oxygenDays } from '../../src/simulation/deck';
import { kgToLb } from '../../src/simulation/units';

describe('A8 physics and consistency', () => {
  it('stage 2 push / starting weight is checked against 0.3 with a plain-words reason', () => {
    const s = analyzeDesign(REFERENCE_DESIGN);
    const R = s.spec!.rocket;
    expect(R.upperTwr).toBeCloseTo(R.stage2.thrustN / ((R.payloadKg + R.stage2.fullKg) * 9.80665), 6);
    // a preset rocket: the player cannot change its stage 2 and the game charges no extra loss,
    // so the ratio is shown for learning without a warning
    const c = reviewDesign(REFERENCE_DESIGN).checks.find((x) => x.id === 'upper_push')!;
    expect(R.upperTwr).toBeLessThan(0.3);
    expect(c.status).toBe('pass');
    expect(c.value).toMatch(/info/);
    expect(c.detail).toMatch(/rule of thumb/);
  });
  it('a custom rocket with a weak stage 2 still warns (the player can add engines)', () => {
    const d = cloneDesign(REFERENCE_DESIGN);
    const preset = analyzeDesign(d).spec!.rocketBuild;
    d.spec = { ...d.spec, rocket: { ...JSON.parse(JSON.stringify(preset)), name: 'Custom (test)' } };
    const c = reviewDesign(d).checks.find((x) => x.id === 'upper_push')!;
    expect(c.status).toBe('warn'); // warning (Hard blocking is behind UPPER_PUSH_BLOCKS_HARD)
    expect(c.detail).toMatch(/Too weak: the stage wastes fuel fighting gravity/);
    expect(c.fix).toMatch(/stage 2 engines/);
  });
  it('the leak card\'s oxygen days are oxygen / (crew x 2.0 + leak)', () => {
    const m = createMission(cloneDesign(REFERENCE_DESIGN), 221);
    const lb = kgToLb(m.o2Kg);
    expect(oxygenDays(m)).toBeCloseTo(lb / (m.stats.crew * 2.0 + LEAK_O2_LB_PER_DAY), 6);
    expect(oxygenDays(m, false)).toBeCloseTo(lb / (m.stats.crew * 2.0), 6);
    // the spec's example: 55 lb for 3 crew is about 9 days without the leak
    expect(55 / (3 * 2.0)).toBeCloseTo(9.17, 2);
  });
});
