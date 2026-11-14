/**
 * JOSEPH_SPEC model, end to end through analyzeDesign() / reviewDesign() / the mission sim:
 * the physics lessons the spec says the game must enforce, plus PART C #26 and #28-#30.
 */
import { describe, expect, it } from 'vitest';
import { cloneDesign, Design, LAUNCH_VEHICLES, REFERENCE_DESIGN } from '../../src/data/mission';
import { ROCKET_PRESETS, SUPPLIES_LB_PER_CREW_DAY } from '../../src/data/specParts';
import { analyzeDesign } from '../../src/simulation/spacecraft';
import { reviewDesign } from '../../src/simulation/review';
import { analyzeRocket, assessRisks, maxPayloadKg, tankRisk } from '../../src/simulation/stack';
import { createMission } from '../../src/simulation/mission';
import { scheduleEvents } from '../../src/simulation/events';
import { Rng } from '../../src/simulation/rng';
import * as K from '../../src/simulation/constants';
import { budgetForM } from '../../src/simulation/specModel';
import { kgToLb } from '../../src/simulation/units';
import { flyMission } from './helpers';

const status = (d: Design, id: string) => reviewDesign(d).checks.find((c) => c.id === id)?.status;
const artemis = () => {
  const d = cloneDesign(REFERENCE_DESIGN);
  d.slots.lander = 'lander_hls'; d.plan.lv = 'goldenbear'; d.plan.crew = 4; delete d.slots.power;
  d.spec = { ...d.spec, architecture: 'artemis', orbit: 'NRHO', capsule: 'cap_orion' };
  return d;
};
const premiumArtemis = () => {
  const d = artemis(); d.slots.power = 'pwr_solar11'; d.slots.lifeSupport = 'ls_regen'; d.safety = ['saf_redund', 'saf_shelter'];
  d.spec = { ...d.spec, difficulty: 'hard' };
  return d;
};

describe('spec model: launch vehicles are staged rockets', () => {
  it('Mission Plan capacities and costs match the rocket equation for each preset', () => {
    for (const lv of LAUNCH_VEHICLES) {
      const b = ROCKET_PRESETS[lv.id];
      const cap = maxPayloadKg(b);
      expect(Math.abs(cap - lv.tliCapacityKg) / cap).toBeLessThan(0.01);
      expect(Math.abs(analyzeRocket(b, cap).costUsd / 1e6 - lv.costM)).toBeLessThan(1);
    }
  });
  it('a stack heavier than the rocket can push to 12,600 m/s is blocking', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.plan.lv = 'bayhawk';
    expect(status(d, 'launch_mass')).toBe('fail');
    expect(analyzeDesign(d).spec!.rocket.reachesMoon).toBe(false);
  });
  it('Artemis-style flies two launches: the rocket must carry the heavier payload, and both are paid for', () => {
    const s = analyzeDesign(artemis());
    expect(s.spec!.launches.length).toBe(2);
    expect(s.mass.tliKg).toBeCloseTo(Math.max(...s.spec!.launches.map((l) => l.payloadKg)), 6);
    const rocketLine = s.costLines.find((l) => /rocket x2/.test(l.label))!;
    expect(rocketLine.m).toBeCloseTo((2 * s.spec!.rocket.costUsd) / 1e6, 6);
  });
});

describe('spec model: the physics lessons', () => {
  it('Orion cannot do a low-lunar-orbit round trip (crew stuck)', () => {
    const d = artemis(); d.spec = { ...d.spec, orbit: 'LLO' };
    const s = analyzeDesign(d);
    expect(s.spec!.capsuleReturn.pass).toBe(false);
    expect(s.spec!.capsuleReturn.dvLeft).toBeLessThan(900);
    expect(status(d, 'propulsion')).toBe('fail');
    const apolloStyle = cloneDesign(REFERENCE_DESIGN); apolloStyle.spec = { ...apolloStyle.spec, capsule: 'cap_orion' }; apolloStyle.plan.crew = 4;
    expect(status(apolloStyle, 'propulsion')).toBe('fail');
  });
  it('Orion in the halo orbit gets home', () => {
    expect(status(artemis(), 'propulsion')).not.toBe('fail');
    expect(reviewDesign(artemis()).go).toBe(true);
  });
  it('an Apollo lander cannot land from the halo orbit', () => {
    for (const arch of ['apollo', 'artemis'] as const) {
      const d = cloneDesign(REFERENCE_DESIGN); d.spec = { ...d.spec, orbit: 'NRHO', architecture: arch };
      const s = analyzeDesign(d);
      expect(s.lander.descentDvAvail).toBeLessThan(2600);
      expect(status(d, 'lander_dv')).toBe('fail');
    }
  });
  it('both mission styles can win on Hard ($4.2B): Apollo with a wide margin, Artemis only without premium extras', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.spec = { ...d.spec, difficulty: 'hard' };
    const r = reviewDesign(d);
    expect(r.go).toBe(true);
    expect(budgetForM(d) - r.stats.costM).toBeGreaterThan(0.4 * budgetForM(d));
    const a = artemis(); a.spec = { ...a.spec, difficulty: 'hard' };
    expect(reviewDesign(a).go).toBe(true);
    expect(status(premiumArtemis(), 'budget')).toBe('fail');
  });
  it('the Budget LEO capsule fails re-entry from the Moon (72% shield)', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.spec = { ...d.spec, capsule: 'cap_budget' }; d.plan.crew = 3;
    expect(analyzeDesign(d).spec!.shieldHealth).toBeCloseTo(17_500 / 24_400, 6);
    expect(status(d, 'shield')).toBe('fail');
  });
  it('supplies use 14.97 lb per astronaut per day and days = 3 + orbit wait + surface + 3', () => {
    expect(SUPPLIES_LB_PER_CREW_DAY).toBeCloseTo(14.97, 6);
    const s = analyzeDesign(artemis());
    expect(s.missionDays).toBeCloseTo(3 + 6.5 + s.lander.plannedStayH / 24 + 3, 6);
    const perDay = kgToLb(K.O2_KG_PER_CREW_DAY + K.WATER_KG_PER_CREW_DAY + K.FOOD_KG_PER_CREW_DAY);
    expect(perDay).toBeCloseTo(14.97, 6);
  });
  it('a capsule rated for fewer days than the mission is blocking', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.spec = { ...d.spec, orbit: 'NRHO' }; d.plan.stayDays = 3; d.plan.crew = 3;
    // Apollo CSM: 14 days; 3 + 6.5 + 3 + 3 = 15.5
    expect(status(d, 'capsule')).toBe('fail');
  });
  it('the lander needs docking hardware and at least 8 thrusters', () => {
    const a = cloneDesign(REFERENCE_DESIGN); a.spec = { ...a.spec, docking: ['dock_nds'] };
    expect(status(a, 'docking')).toBe('fail');
    const b = cloneDesign(REFERENCE_DESIGN); b.spec = { ...b.spec, thrusterCount: 6 };
    expect(status(b, 'docking')).toBe('fail');
  });
  it('a slow radio cannot send camera footage home', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.slots.comms = 'com_sband';
    expect(status(d, 'data')).toBe('warn');
  });
});

describe('spec model: thruster fuel', () => {
  it('thruster fuel = tank gallons × 8.52 lb/gal; two dockings use 40 lb each', () => {
    const s = analyzeDesign(REFERENCE_DESIGN);
    expect(kgToLb(s.spec!.rcs.fuelKg)).toBeCloseTo(136 * 8.52, 6);
    expect(s.spec!.rcs.dockings).toBe(2);
    expect(kgToLb(s.spec!.rcs.plannedKg)).toBeCloseTo(80, 6);
  });
  it('the mission drains thruster fuel at each docking (transposition, rendezvous)', () => {
    const m = createMission(REFERENCE_DESIGN, 11); m.schedule = [];
    const start = analyzeDesign(REFERENCE_DESIGN).spec!.rcs.fuelKg;
    expect(kgToLb(start - m.rcsFuelKg)).toBeCloseTo(40, 6); // transposition right after TLI
    const done = flyMission(m);
    expect(kgToLb(start - done.rcsFuelKg)).toBeCloseTo(80, 6);
  });
  it('no thruster tank means no fuel for docking: blocking', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.spec = { ...d.spec, thrusterTank: 'none' };
    expect(status(d, 'docking')).toBe('fail');
  });
});

describe('spec model: material + fuel risks', () => {
  const b = (material: 'carbon' | 'alli') => ({ ...ROCKET_PRESETS.estuary, stage2: { ...ROCKET_PRESETS.estuary.stage2, material } });
  it('carbon fiber + hydrogen is High; a metal liner drops it to Medium', () => {
    expect(assessRisks(b('carbon'), []).find((r) => r.id === 'carbon_h2')!.now).toBe('High');
    expect(assessRisks(b('carbon'), ['liner']).find((r) => r.id === 'carbon_h2')!.now).toBe('Medium');
  });
  it('the higher risk wins (any hydrogen = Medium) until the leak check is bought', () => {
    expect(tankRisk(assessRisks(b('alli'), []))).toBe('Medium');
    expect(tankRisk(assessRisks(b('alli'), ['leakCheck']))).toBe('Low');
  });
  it('the liner adds 10% tank weight; the leak check adds cost', () => {
    const plain = analyzeRocket(b('carbon'), 40_000), lined = analyzeRocket(b('carbon'), 40_000, ['liner']);
    expect(lined.stage2.tankKg / plain.stage2.tankKg).toBeCloseTo(1.1, 6);
    const d = cloneDesign(REFERENCE_DESIGN), e = cloneDesign(REFERENCE_DESIGN); e.spec = { ...e.spec, fixes: ['leakCheck'] };
    expect(analyzeDesign(e).costM - analyzeDesign(d).costM).toBeCloseTo(2, 6);
  });
  it('risky combos warn but never block the launch', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.spec = { ...d.spec, rocket: b('carbon') };
    expect(status(d, 'risk')).toBe('warn');
  });
});

describe('PART C #26, #28-#30', () => {
  it('#26 at $0 or below the review locks launch', () => {
    const d = premiumArtemis();
    const r = reviewDesign(d);
    expect(r.stats.costM).toBeGreaterThan(budgetForM(d));
    expect(status(d, 'budget')).toBe('fail');
    expect(r.go).toBe(false);
  });
  it.todo('#28 emergency count: Easy draws 3, Hard draws 5 (Phase 4: 16-card deck)');
  it('#29 same design + same seed gives the same emergencies in the same order', () => {
    const a = createMission(REFERENCE_DESIGN, 777), b = createMission(REFERENCE_DESIGN, 777);
    expect(a.schedule).toEqual(b.schedule);
    expect(scheduleEvents(a, new Rng(5))).toEqual(scheduleEvents(b, new Rng(5)));
  });
  it('#30 reliability rolls are disabled: no random failure without an emergency', () => {
    expect(K.RELIABILITY_ROLLS).toBe(false);
    for (let seed = 1; seed <= 20; seed++) {
      const s = createMission(REFERENCE_DESIGN, seed * 31);
      expect(s.flags.tliTrimDv).toBe(0);
      s.schedule = []; // no emergencies at all
      const done = flyMission(s);
      expect(done.crewLost).toBe(false);
      expect(done.phase).toBe('COMPLETE');
    }
  });
});
