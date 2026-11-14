/** The 16-card A/B/C emergency deck (JOSEPH_SPEC tab 7). */
import { describe, expect, it } from 'vitest';
import { cloneDesign, Design, REFERENCE_DESIGN } from '../../src/data/mission';
import { ROCKET_PRESETS } from '../../src/data/specParts';
import { buildCard, DECK, DECK_BY_ID, em, Stage, STAGE_ORDER } from '../../src/simulation/deck';
import { createMission, resolveEvent, triggerStage } from '../../src/simulation/mission';
import { evaluate } from '../../src/simulation/scoring';
import type { MissionState } from '../../src/simulation/types';
import { fmt } from '../../src/simulation/units';

const mode = (difficulty: 'easy' | 'hard', mod: (d: Design) => void = () => {}) => { const d = cloneDesign(REFERENCE_DESIGN); d.spec = { ...d.spec, difficulty }; mod(d); return d; };
const pend = (s: MissionState, id: string, stage: Stage) => { s.pending = buildCard(DECK_BY_ID[id], s, stage); return s.pending; };

describe('deck contents', () => {
  it('has 16 cards; every option has a Good and a Bad line', () => {
    expect(DECK.length).toBe(16);
    expect(DECK.map((c) => c.n)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    const s = createMission(REFERENCE_DESIGN, 1);
    for (const c of DECK) {
      const ev = buildCard(c, s, c.stages[0]);
      expect(ev.options.length).toBe(3);
      for (const o of ev.options) { expect(o.good!.length).toBeGreaterThan(3); expect(o.bad!.length).toBeGreaterThan(3); }
    }
  });
  it('cards 3, 6, 9, 10, 14, 15 are labeled scenario; the rest cite a real event', () => {
    for (const c of DECK) {
      if ([3, 6, 9, 10, 14, 15].includes(c.n)) expect(c.scenario).toBe(true);
      else if (c.n !== 13) expect(c.real).toBeTruthy(); // 13 is a real effect of low lunar orbit
    }
  });
  it('Bad lines use the player\'s real numbers', () => {
    const s = createMission(mode('hard'), 3);
    const ev = pend(s, 'card1', 'launch');
    expect(ev.options[0].bad).toContain(fmt(em(s).rocketSpare));
  });
});

describe('drawing (seeded, aimed at weak spots on Hard)', () => {
  const sceneOrStage = (s: MissionState) => s.schedule.map((e) => e.stage as Stage);
  it('PART C #28: Easy draws 3, Hard draws 5', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(createMission(mode('easy'), seed).schedule.length).toBe(3);
      expect(createMission(mode('hard'), seed).schedule.length).toBe(5);
    }
  });
  it('PART C #29: same design + same seed gives the same cards in the same order', () => {
    expect(createMission(mode('hard'), 42).schedule).toEqual(createMission(mode('hard'), 42).schedule);
    const mixes = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) mixes.add(createMission(mode('hard'), seed).schedule.map((e) => e.id).join(','));
    expect(mixes.size).toBeGreaterThan(10);
  });
  it('cards play in mission order (pad -> launch -> ... -> return)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const order = sceneOrStage(createMission(mode('hard'), seed)).map((st) => STAGE_ORDER.indexOf(st));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });
  it('the hydrogen-leak card only appears if the rocket burns hydrogen', () => {
    const kerosene = mode('hard', (d) => { d.spec = { ...d.spec, rocket: { ...ROCKET_PRESETS.estuary, stage2: { engine: 'mvac', count: 2, fuelLb: 700_000, material: 'alli' } } }; });
    for (let seed = 1; seed <= 60; seed++) expect(createMission(kerosene, seed).schedule.map((e) => e.id)).not.toContain('card16');
  });
  it('Hard aims at weak spots: few thrusters + low lunar orbit draw cards 12 and 13 far more often than Easy', () => {
    const weak = (difficulty: 'easy' | 'hard') => mode(difficulty, (d) => { d.spec = { ...d.spec, thrusterCount: 8 }; });
    const count = (difficulty: 'easy' | 'hard') => { let n = 0; for (let seed = 1; seed <= 200; seed++) n += createMission(weak(difficulty), seed).schedule.filter((e) => e.id === 'card12' || e.id === 'card13').length; return n; };
    const easyRate = count('easy') / 3, hardRate = count('hard') / 5; // per card drawn
    expect(hardRate).toBeGreaterThan(easyRate * 1.5);
  });
});

describe('resolving', () => {
  it('Easy halves every Bad number', () => {
    const e = createMission(mode('easy'), 5), h = createMission(mode('hard'), 5);
    pend(e, 'card1', 'launch'); resolveEvent(e, 1);
    pend(h, 'card1', 'launch'); resolveEvent(h, 1);
    expect(em(e).extraCostM).toBeCloseTo(150, 6);
    expect(em(h).extraCostM).toBeCloseTo(300, 6);
  });
  it('Easy turns a mission failure into "abort, crew safe"; Hard does not', () => {
    for (const difficulty of ['easy', 'hard'] as const) {
      const s = createMission(mode(difficulty), 8);
      s.o2Kg *= 0.3; // oxygen margin far below 50%
      pend(s, 'card4', 'coast');
      resolveEvent(s, 1); // B: continue on the remaining oxygen
      if (difficulty === 'easy') { expect(s.crewLost).toBe(false); expect(em(s).abortReason).toBeTruthy(); expect(evaluate(s).outcome).toBe('ABORT_SAFE'); }
      else expect(s.crewLost).toBe(true);
    }
  });
  it('the Flight Director bonus (+50) is earned on Hard for the sound pick, and logged with a star', () => {
    const h = createMission(mode('hard'), 9);
    const ev = pend(h, 'card5', 'coast'); // pick: A
    expect(ev.fdPick).toBe(0);
    resolveEvent(h, 0);
    expect(em(h).fdBonus).toBe(50);
    expect(h.decisions[h.decisions.length - 1].fd).toBe(true);
    const rep = evaluate(h);
    expect(rep.fdBonus).toBe(50);
    expect(rep.decisions.some((d) => d.fd)).toBe(true);
    const e = createMission(mode('easy'), 9);
    pend(e, 'card5', 'coast'); resolveEvent(e, 0);
    expect(em(e).fdBonus).toBe(0); // Easy explains, but no bonus
  });
  it('the pick depends on the player\'s numbers (engine out: keep burning only with 240+ m/s margin)', () => {
    const s = createMission(mode('hard'), 10);
    em(s).rocketSpare = 500; expect(pend(s, 'card1', 'launch').fdPick).toBe(0);
    em(s).rocketSpare = 100; expect(pend(s, 'card1', 'launch').fdPick).toBe(2);
  });
  it('Spacecraft Engineer free fix cancels the Bad effect once', () => {
    const s = createMission(mode('hard', (d) => { d.spec = { ...d.spec, role: 'spacecraft' }; }), 11);
    pend(s, 'card1', 'launch');
    resolveEvent(s, 1, true);
    expect(em(s).extraCostM).toBe(0);
    expect(em(s).freeFixUsed).toBe(true);
  });
  it('launch-phase cards fire from the scene hook and can abort with the crew safe', () => {
    const s = createMission(mode('hard'), 12);
    s.schedule = [{ id: 'card1', at: 0, phases: [], stage: 'launch' }];
    expect(triggerStage(s, 'launch')).toBe(true);
    expect(triggerStage(s, 'launch')).toBe(false); // pending already
    resolveEvent(s, 2); // C: launch abort
    expect(s.phase).toBe('COMPLETE');
    expect(s.crewLost).toBe(false);
    const rep = evaluate(s);
    expect(rep.outcome).toBe('ABORT_SAFE');
    expect(rep.overall).toBeLessThanOrEqual(20);
  });
  it('the decision log records every pick with its cost and the seed is in the report', () => {
    const s = createMission(mode('hard'), 13);
    pend(s, 'card11', 'coast'); resolveEvent(s, 0);
    const d = s.decisions[s.decisions.length - 1];
    expect(d.choice).toMatch(/^A\./);
    expect(d.bad).toMatch(/lb of oxygen/);
    expect(evaluate(s).seed).toBe(s.seed);
  });
});
