import { describe, expect, it } from 'vitest';
import { deltaV, dvFromPropellant, massFlow, propellantForDv } from '../../src/simulation/rocket';
import { G0 } from '../../src/simulation/constants';

describe('rocket equation', () => {
  it('computes Δv = Isp·g0·ln(m0/mf)', () => {
    expect(deltaV(300, 1000, 500)).toBeCloseTo(300 * G0 * Math.log(2), 6);
  });
  it('propellantForDv is the inverse of deltaV', () => {
    const m0 = 40000, dv = 900, isp = 316;
    const p = propellantForDv(m0, dv, isp);
    expect(deltaV(isp, m0, m0 - p)).toBeCloseTo(dv, 6);
    expect(dvFromPropellant(m0, p, isp)).toBeCloseTo(dv, 6);
  });
  it('higher Isp needs less propellant', () => {
    expect(propellantForDv(40000, 1000, 360)).toBeLessThan(propellantForDv(40000, 1000, 316));
  });
  it('handles degenerate inputs safely', () => {
    expect(deltaV(300, 0, 0)).toBe(0);
    expect(deltaV(300, 100, 200)).toBe(0);
    expect(propellantForDv(1000, 0, 300)).toBe(0);
    expect(propellantForDv(1000, -5, 300)).toBe(0);
  });
  it('mass flow = F / (Isp g0)', () => {
    expect(massFlow(45000, 311)).toBeCloseTo(45000 / (311 * G0), 9);
  });
});
