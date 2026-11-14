import { describe, expect, it } from 'vitest';
import { createMission, executeLOI, powerSnapshot, step, isSunlit, earthVisible, linkRateMbps, propMarginKg, chooseFreeReturn, ascentCheck, executeTEI, resolveEvent } from '../../src/simulation/mission';
import { REFERENCE_DESIGN, cloneDesign } from '../../src/data/mission';
import { evaluate } from '../../src/simulation/scoring';
import * as K from '../../src/simulation/constants';
import { coast, flyMission } from './helpers';

describe('mission phases', () => {
  it('starts in translunar coast and reaches LOI after 3 days', () => {
    const s = createMission(REFERENCE_DESIGN, 1);
    expect(s.phase).toBe('TRANSIT_OUT');
    coast(s);
    expect(s.phase).toBe('LOI_PENDING');
    expect(s.t).toBeGreaterThanOrEqual(K.TRANSIT_OUT_S);
  });
  it('LOI consumes propellant per the rocket equation and enters orbit', () => {
    const s = createMission(REFERENCE_DESIGN, 2); coast(s);
    const before = s.propKg;
    const r = executeLOI(s);
    expect(r.ok).toBe(true);
    expect(s.phase).toBe('LUNAR_ORBIT');
    expect(before - s.propKg).toBeGreaterThan(5000);
  });
  it('the reference design can complete the full mission', () => {
    const s = flyMission(createMission(REFERENCE_DESIGN, 1234));
    expect(s.crewLost).toBe(false);
    expect(s.phase).toBe('COMPLETE');
    expect(['soft', 'hard']).toContain(s.landing.outcome);
    const rep = evaluate(s);
    expect(rep.overall).toBeGreaterThan(50);
    expect(['FULL_SUCCESS', 'PARTIAL_SUCCESS']).toContain(rep.outcome);
  });
  it('several seeds of the reference design return the crew', () => {
    let safe = 0;
    for (let seed = 1; seed <= 12; seed++) { const s = flyMission(createMission(REFERENCE_DESIGN, seed * 97)); if (!s.crewLost) safe++; }
    expect(safe).toBeGreaterThanOrEqual(11);
  });
  it('is deterministic for a given seed', () => {
    const a = flyMission(createMission(REFERENCE_DESIGN, 42));
    const b = flyMission(createMission(REFERENCE_DESIGN, 42));
    expect(a.t).toBe(b.t);
    expect(a.propKg).toBe(b.propKg);
    expect(a.log.map((l) => l.text)).toEqual(b.log.map((l) => l.text));
  });
  it('free-return abort brings the crew home without landing', () => {
    const s = createMission(REFERENCE_DESIGN, 5); coast(s);
    expect(chooseFreeReturn(s)).toBe(true);
    coast(s);
    expect(s.phase).toBe('ENTRY');
    expect(s.landing.attempted).toBe(false);
  });
  it('insufficient propellant for TEI strands the crew (explainable failure)', () => {
    const s = createMission(REFERENCE_DESIGN, 6); coast(s); executeLOI(s);
    s.propKg = 100; s.landerAttached = false; s.phase = 'LUNAR_ORBIT_POST';
    const r = executeTEI(s);
    expect(r.ok).toBe(false);
    expect(s.crewLost).toBe(true);
    expect(s.lossCause).toMatch(/propellant/i);
    expect(evaluate(s).outcome).toBe('MISSION_LOST');
  });
});

describe('power, comms & data', () => {
  it('lunar orbit has eclipses (~40%) and far-side loss of signal', () => {
    const s = createMission(REFERENCE_DESIGN, 3); coast(s); executeLOI(s);
    let dark = 0, los = 0;
    const n = 600;
    for (let i = 0; i < n; i++) { s.t += K.LLO_PERIOD_S / n; if (!isSunlit(s)) dark++; if (!earthVisible(s)) los++; }
    expect(dark / n).toBeCloseTo(K.LLO_SHADOW_FRACTION, 1);
    expect(los / n).toBeCloseTo(K.LLO_LOS_FRACTION, 1);
  });
  it('battery discharges in eclipse and charges in sunlight, clamped to capacity', () => {
    const s = createMission(REFERENCE_DESIGN, 3); coast(s); executeLOI(s);
    let sawDrop = false, maxE = 0;
    for (let i = 0; i < 60; i++) {
      const before = s.batteryWh; const sun = isSunlit(s);
      s.pending = null; step(s);
      if (!sun && s.batteryWh < before) sawDrop = true;
      maxE = Math.max(maxE, s.batteryWh);
    }
    expect(sawDrop).toBe(true);
    expect(maxE).toBeLessThanOrEqual(s.batteryCapWh);
  });
  it('empty battery sheds loads and records a brownout', () => {
    const s = createMission(REFERENCE_DESIGN, 3); coast(s); executeLOI(s);
    s.solarFactor = 0; s.batteryWh = 100;
    for (const k of Object.keys(s.instruments)) s.instruments[k].on = true;
    for (let i = 0; i < 6; i++) step(s);
    expect(s.batteryWh).toBe(0);
    expect(Object.values(s.instruments).every((v) => !v.on)).toBe(true);
    expect(s.powerMode).toBe('conserve');
    expect(s.flags.brownoutH).toBeGreaterThan(0);
  });
  it('a full recorder loses new data', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.slots.storage = 'dat_128'; d.slots.comms = 'com_sband';
    const s = createMission(d, 4); s.schedule = []; // no emergencies: this test is about the recorder
    coast(s); executeLOI(s);
    for (let i = 0; i < 12 * 30; i++) {
      if (s.pending) resolveEvent(s, 1);
      s.instruments['sci_mapcam'].on = !s.instruments['sci_mapcam'].failed;
      step(s);
    }
    const stored = Object.values(s.storedMB).reduce((a, b) => a + b, 0);
    expect(stored).toBeLessThanOrEqual(128000 + 1e-6);
    expect(s.lostMB).toBeGreaterThan(0);
  });
  it('no link means no downlink', () => {
    const s = createMission(REFERENCE_DESIGN, 3);
    s.commOutageUntil = s.t + 1e9;
    expect(linkRateMbps(s)).toBe(0);
  });
  it('conserve mode lowers the electrical load', () => {
    const s = createMission(REFERENCE_DESIGN, 3);
    const a = powerSnapshot(s).loadW; s.powerMode = 'conserve';
    expect(powerSnapshot(s).loadW).toBeLessThan(a);
  });
});

describe('life support', () => {
  it('consumes oxygen at ~0.84 kg per crew per day', () => {
    const s = createMission(REFERENCE_DESIGN, 8);
    s.schedule = [];
    const o2 = s.o2Kg;
    for (let i = 0; i < K.DAY / K.SIM_DT; i++) step(s);
    expect(o2 - s.o2Kg).toBeCloseTo(3 * K.O2_KG_PER_CREW_DAY, 1);
  });
  it('oxygen exhaustion is fatal', () => {
    const s = createMission(REFERENCE_DESIGN, 8);
    s.o2Kg = 0.001; step(s);
    expect(s.crewLost).toBe(true);
    expect(s.phase).toBe('COMPLETE');
  });
});

describe('events', () => {
  it('schedules up to three context-aware events deterministically', () => {
    const a = createMission(REFERENCE_DESIGN, 77), b = createMission(REFERENCE_DESIGN, 77);
    expect(a.schedule.length).toBeGreaterThanOrEqual(2);
    expect(a.schedule).toEqual(b.schedule);
    expect(new Set(a.schedule.map((e) => e.id)).size).toBe(a.schedule.length);
  });
  it('never schedules a fuel-cell event on a solar spacecraft', () => {
    for (let seed = 1; seed < 60; seed++) expect(createMission(REFERENCE_DESIGN, seed).schedule.map((e) => e.id)).not.toContain('fuelcell_degrade');
  });
  it('different seeds produce different event mixes', () => {
    const sets = new Set<string>();
    for (let seed = 1; seed < 30; seed++) sets.add(createMission(REFERENCE_DESIGN, seed).schedule.map((e) => e.id).join(','));
    expect(sets.size).toBeGreaterThan(3);
  });
});

describe('surface & ascent', () => {
  it('heavier samples reduce ascent delta-v', () => {
    const s = createMission(REFERENCE_DESIGN, 9);
    expect(ascentCheck(s, 0).dv).toBeGreaterThan(ascentCheck(s, 40).dv);
    expect(ascentCheck(s, 0).maxSamplesKg).toBeGreaterThan(40);
  });
  it('propellant margin projection is positive for the reference design', () => {
    const s = createMission(REFERENCE_DESIGN, 10);
    expect(propMarginKg(s)).toBeGreaterThan(0);
  });
});
