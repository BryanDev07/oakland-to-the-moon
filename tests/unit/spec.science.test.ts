/**
 * Science (JOSEPH_SPEC tab 4): the mission needs 50 points (G); instruments carry spec points;
 * there is more than one path to 50 (light: seismometer + retroreflector + samples = 65;
 * heavy: rover + drill + radar = 60).
 */
import { describe, expect, it } from 'vitest';
import { cloneDesign, Design, REFERENCE_DESIGN } from '../../src/data/mission';
import { COMPONENT_BY_ID } from '../../src/data/components';
import { INSTRUMENTS, SCIENCE_TARGET_POINTS } from '../../src/data/specParts';
import { analyzeDesign } from '../../src/simulation/spacecraft';
import { reviewDesign } from '../../src/simulation/review';
import { createMission } from '../../src/simulation/mission';
import { ACTIVITIES } from '../../src/simulation/surface';
import { evaluate, SCIENCE_FULL_POINTS } from '../../src/simulation/scoring';
import { flyMission } from './helpers';

const withScience = (science: string[], mod: (d: Design) => void = () => {}) => {
  const d = cloneDesign(REFERENCE_DESIGN);
  d.science = science;
  mod(d);
  return d;
};
const LIGHT = ['sci_seismo', 'sci_retro', 'sci_samples'];
const HEAVY = ['sci_rover', 'sci_drill', 'sci_gpr'];

describe('science: scored out of 50', () => {
  it('the target is 50 points (G)', () => {
    expect(SCIENCE_TARGET_POINTS.v).toBe(50);
    expect(SCIENCE_TARGET_POINTS.tag).toBe('G');
    expect(SCIENCE_FULL_POINTS).toBe(50);
  });
  it('full success needs 50+ points: a mission home with fewer is only partial', () => {
    const s = flyMission(createMission(withScience(['sci_retro']), 21));
    expect(s.crewLost).toBe(false);
    const rep = evaluate(s);
    expect(rep.sciencePoints).toBeLessThan(50);
    expect(rep.outcome).toBe('PARTIAL_SUCCESS');
  });
});

describe('science: drill, radar and rover are hangar parts with spec values', () => {
  it.each(HEAVY)('%s is a lander instrument with the spec weight, power, data and price', (id) => {
    const c = COMPONENT_BY_ID[id], spec = INSTRUMENTS.find((i) => i.id === id)!;
    expect(c.slot).toBe('science');
    expect(c.onLander).toBe(true);
    expect(c.massKg / 0.45359237).toBeCloseTo(spec.weightLb.v, 6);
    expect(c.powerW ?? 0).toBe(spec.powerW.v);
    expect(c.dataMBPerDay).toBe(spec.mbPerDay.v);
    expect(c.costM).toBeCloseTo(spec.priceUsd.v / 1e6, 9);
  });
  it.each(HEAVY)('%s has a surface activity worth its spec points', (id) => {
    const a = ACTIVITIES.find((x) => x.requires === id)!;
    expect(a).toBeTruthy();
    expect(a.points).toBe(INSTRUMENTS.find((i) => i.id === id)!.points.v);
  });
});

describe('science: more than one path to 50', () => {
  it('light path: seismometer + retroreflector + samples = 65 planned points', () => {
    const s = analyzeDesign(withScience(LIGHT));
    expect(s.spec!.science.plannedPoints).toBeCloseTo(65, 6);
    expect(reviewDesign(withScience(LIGHT)).go).toBe(true);
  });
  it('heavy path: rover + drill + radar = 60 planned points, and it is heavy and power-hungry', () => {
    const d = withScience(HEAVY);
    const heavy = analyzeDesign(d), light = analyzeDesign(withScience(LIGHT));
    expect(heavy.spec!.science.plannedPoints).toBeCloseTo(60, 6);
    expect(heavy.lander.surfacePayloadKg).toBeGreaterThan(light.lander.surfacePayloadKg);
    expect(heavy.spec!.lander!.grossLoadW).toBeGreaterThan(light.spec!.lander!.grossLoadW);
    expect(reviewDesign(d).go).toBe(true);
  });
  it('a flown rover + drill + radar mission scores 50+ points and is a full success', () => {
    const s = flyMission(createMission(withScience(HEAVY), 1234));
    expect(s.crewLost).toBe(false);
    expect(s.phase).toBe('COMPLETE');
    const rep = evaluate(s);
    for (const id of ['rover', 'drill', 'gpr']) expect(rep.science.some((l) => l.id === id && l.points > 0)).toBe(true);
    expect(rep.sciencePoints).toBeGreaterThanOrEqual(50);
    expect(rep.outcome).toBe('FULL_SUCCESS');
  });
});
