/**
 * Regression: the flight simulation must burn propellant with the same Isp the design review used,
 * so the "Capsule burns" margin in the review matches the margin the crew actually flies with.
 * (Before the fix, flight burns fell back to 300 s because the spec model hides the engine slot.)
 */
import { describe, expect, it } from 'vitest';
import { cloneDesign, Design, REFERENCE_DESIGN } from '../../src/data/mission';
import { CAPSULE_BY_ID } from '../../src/data/specParts';
import { analyzeDesign } from '../../src/simulation/spacecraft';
import { createMission, executeLOI, isp, propMarginKg } from '../../src/simulation/mission';
import { G0 } from '../../src/simulation/constants';
import { coast } from './helpers';

const withSpec = (spec: Partial<NonNullable<Design['spec']>>) => { const d = cloneDesign(REFERENCE_DESIGN); d.spec = { ...d.spec, ...spec }; return d; };
const designs: [string, Design][] = [
  ['Apollo CSM, LLO, one launch', cloneDesign(REFERENCE_DESIGN)],
  ['Apollo CSM, NRHO, two launches', withSpec({ orbit: 'NRHO', architecture: 'artemis' })],
  ['Orion, NRHO, two launches', withSpec({ orbit: 'NRHO', architecture: 'artemis', capsule: 'cap_orion' })],
];

describe('flight Isp matches the design review', () => {
  for (const cap of ['cap_apollo', 'cap_orion', 'cap_budget']) {
    it(`uses the ${cap} engine exhaust speed in flight`, () => {
      const s = createMission(withSpec({ capsule: cap }), 3);
      expect(isp(s) * G0).toBeCloseTo(CAPSULE_BY_ID[cap].veMs.v, 6);
    });
  }

  for (const [name, d] of designs) {
    it(`flight propellant margin equals the review margin: ${name}`, () => {
      const st = analyzeDesign(d);
      const s = createMission(d, 3);
      // within 1 kg (the review and the flight projection walk the same burns with the same Isp)
      expect(Math.abs(propMarginKg(s) - st.propulsion.marginKg)).toBeLessThan(1);
    });
  }

  it('the LOI burn uses the propellant the review predicted', () => {
    const d = cloneDesign(REFERENCE_DESIGN);
    const st = analyzeDesign(d);
    const s = createMission(d, 3);
    s.schedule = []; // no emergencies: compare the pure burn
    coast(s);
    const before = s.propKg;
    expect(executeLOI(s).ok).toBe(true);
    // The crew used ~3 days of O2, water and food on the way, so the real stack is a little lighter
    // than at design time: allow 0.5% (the old 300 s fallback was ~3% off).
    const used = before - s.propKg, planned = st.propulsion.burns[0].propKg;
    expect(used).toBeLessThanOrEqual(planned);
    expect(Math.abs(used - planned) / planned).toBeLessThan(0.005);
  });
});
