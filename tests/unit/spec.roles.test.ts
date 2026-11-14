/** Roles (JOSEPH_SPEC tab 5): single-player specialty with a perk and a weakness (G). */
import { describe, expect, it } from 'vitest';
import { cloneDesign, Design, REFERENCE_DESIGN } from '../../src/data/mission';
import { ROLES } from '../../src/data/roles';
import { RoleId } from '../../src/data/specParts';
import { analyzeDesign } from '../../src/simulation/spacecraft';
import { budgetForM } from '../../src/simulation/specModel';
import { createMission } from '../../src/simulation/mission';
import { evaluate } from '../../src/simulation/scoring';
import { flyMission } from './helpers';

const as = (role: RoleId | null): Design => { const d = cloneDesign(REFERENCE_DESIGN); d.spec = { ...d.spec, role }; return d; };
const line = (d: Design, re: RegExp) => analyzeDesign(d).costLines.filter((l) => re.test(l.label)).reduce((a, l) => a + l.m, 0);
const ROCKET = /rocket/, CAPSULE = /Apollo-class CSM/, SEISMO = /Seismometer/i, RADIO = /Ka-band/;

describe('roles', () => {
  it('there are four, following NASA segments, each owning hangar tabs', () => {
    expect(ROLES.map((r) => r.id)).toEqual(['commander', 'propulsion', 'spacecraft', 'science']);
    for (const r of ROLES) { expect(r.owns.length).toBeGreaterThan(0); expect(r.segment).toMatch(/segment/); }
  });
  it('Mission Commander: +5% budget, no discounts', () => {
    expect(budgetForM(as('commander'))).toBeCloseTo(budgetForM(as(null)) * 1.05, 6);
    expect(analyzeDesign(as('commander')).costM).toBeCloseTo(analyzeDesign(as(null)).costM, 6);
  });
  it('Propulsion Engineer: 10% off rocket parts, instruments cost 10% more', () => {
    expect(line(as('propulsion'), ROCKET)).toBeCloseTo(line(as(null), ROCKET) * 0.9, 6);
    expect(line(as('propulsion'), SEISMO)).toBeCloseTo(line(as(null), SEISMO) * 1.1, 6);
  });
  it('Spacecraft Engineer: 10% off spacecraft parts, rocket parts cost 10% more', () => {
    expect(line(as('spacecraft'), CAPSULE)).toBeCloseTo(line(as(null), CAPSULE) * 0.9, 6);
    expect(line(as('spacecraft'), ROCKET)).toBeCloseTo(line(as(null), ROCKET) * 1.1, 6);
  });
  it('Science & Comms Lead: 10% off instruments and radios, spacecraft cost 10% more, +20% science', () => {
    expect(line(as('science'), SEISMO)).toBeCloseTo(line(as(null), SEISMO) * 0.9, 6);
    expect(line(as('science'), RADIO)).toBeCloseTo(line(as(null), RADIO) * 0.9, 6);
    expect(line(as('science'), CAPSULE)).toBeCloseTo(line(as(null), CAPSULE) * 1.1, 6);
    expect(analyzeDesign(as('science')).spec!.science.plannedPoints).toBeCloseTo(analyzeDesign(as(null)).spec!.science.plannedPoints * 1.2, 6);
    const base = evaluate(flyMission(createMission(as(null), 99))).sciencePoints;
    const lead = evaluate(flyMission(createMission(as('science'), 99))).sciencePoints;
    expect(lead).toBeCloseTo(base * 1.2, 6);
  });
});
