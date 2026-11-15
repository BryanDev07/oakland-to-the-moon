/** E8: ISS mission rules: the 9,400 m/s target, docking contact speed, suit oxygen timing, budget fit, deck and flow. */
import { describe, expect, it } from 'vitest';
import { cloneDesign, REFERENCE_DESIGN } from '../../src/data/mission';
import { componentsInSlot } from '../../src/data/components';
import { analyzeDesign } from '../../src/simulation/spacecraft';
import { reviewDesign } from '../../src/simulation/review';
import * as Sim from '../../src/simulation/mission';
import { evaluate } from '../../src/simulation/scoring';
import { advanceDock, newDock, nudge, stepDock } from '../../src/simulation/docking';
import { evaResult, o2LeftMin, plannedMin, planFits } from '../../src/simulation/spacewalk';
import { issOf, ISS_CARDS } from '../../src/simulation/issDeck';
import { buildFiveSheets } from '../../src/simulation/deskFive';
import type { Design } from '../../src/data/mission';

const issDesign = (diff: 'easy' | 'hard' = 'easy', cap = 'cap_budget'): Design => { const d = cloneDesign(REFERENCE_DESIGN); d.spec = { ...d.spec!, mission: 'iss', capsule: cap, difficulty: diff, role: null }; return d; };

describe('ISS mission', () => {
  it('the rocket target is 9,400 m/s and the presets reach it; the Moon stays 12,600', () => {
    const s = analyzeDesign(issDesign());
    expect(s.spec!.rocket.target).toBe(9_400);
    expect(s.spec!.rocket.reachesMoon).toBe(true);
    expect(analyzeDesign(REFERENCE_DESIGN).spec!.rocket.target).toBe(12_600);
    expect(s.lander.present).toBe(false); // no lander on this mission
    expect(reviewDesign(issDesign()).checks.some((c) => c.id === 'lander_dv' || c.id === 'stay')).toBe(false);
  });
  it('the Budget capsule is fine for a 17,500 mph return; Golden Bear is flagged as a waste of money', () => {
    expect(analyzeDesign(issDesign()).spec!.shieldHealth).toBe(1);
    const d = issDesign(); d.plan.lv = 'goldenbear';
    const lm = reviewDesign(d).checks.find((c) => c.id === 'launch_mass')!;
    expect(lm.detail).toMatch(/Overkill: .* also reaches 9,400 m\/s and saves/);
  });
  it('docking: contact at 0.1 m/s or less docks; faster bounces, and three bounces abort', () => {
    const slow = newDock(200); slow.dist = 0.02; slow.v = 0.08; stepDock(slow, false, 12);
    expect(slow.docked).toBe(true);
    const fast = newDock(200); fast.dist = 0.1; fast.v = 0.3; stepDock(fast, false, 12);
    expect(fast.docked).toBe(false); expect(fast.contacts).toBe(1);
    for (let i = 0; i < 2; i++) { fast.dist = 0.1; fast.v = 0.3; stepDock(fast, false, 12); }
    expect(fast.failed).toBe(true);
    const fuel = newDock(10); nudge(fuel, -1, 12); expect(fuel.fuelLb).toBeCloseTo(9.4, 6); // every nudge uses fuel
  });
  it('autopilot docks safely, and 4x gives the same result as 1x', () => {
    const run = (scale: number) => { const st = newDock(300); let acc = 0; for (let i = 0; i < 20000 && !st.docked && !st.failed; i++) acc = advanceDock(st, acc, 1 / 60, scale * 8, true, 12); return st; };
    const a = run(1), b = run(4);
    expect(a.docked).toBe(true);
    expect(b.usedLb).toBeCloseTo(a.usedLb, 6);
  });
  it('suit oxygen: 8 hours covers the planned spacewalk with the 30-minute reserve; too many slips break it', () => {
    expect(plannedMin('power', 'double', false)).toBe(2 * 6 * 18 + 30 + 20);
    expect(planFits('power', 'double', false)).toBe(true);
    expect(planFits('wrench', 'double', true)).toBe(true);
    const s = Sim.createMission(issDesign(), 7);
    const p = issOf(s);
    expect(o2LeftMin(p)).toBe(480);
    p.evaMin = 460; expect(evaResult(p)).toBe('reserve');
    p.evaMin = 490; expect(evaResult(p)).toBe('out');
  });
  it('a lean build fits the Hard budget ($700M)', () => {
    const d = issDesign('hard');
    d.spec = { ...d.spec!, rocket: { name: 'Custom', stage1: { engine: 'merlin1d', count: 9, fuelLb: 900_000, material: 'alli' }, stage2: { engine: 'mvac', count: 1, fuelLb: 200_000, material: 'alli' }, booster: null, boosterCount: 0 } };
    for (const slot of Object.keys(d.slots)) { const o = componentsInSlot(slot as never); if (o.length) d.slots[slot] = o.slice().sort((a, b) => a.costM - b.costM)[0].id; }
    d.slots.power = 'pwr_solar6'; d.safety = []; d.science = [];
    const r = reviewDesign(d);
    expect(r.stats.spec!.budgetM).toBe(700);
    expect(r.stats.costM).toBeLessThan(700);
    expect(r.checks.filter((c) => c.status === 'fail').map((c) => c.id)).toEqual([]);
  });
  it('the flow: a 1-day phasing coast, the ISS deck, then the report scores the repair', () => {
    const s = Sim.createMission(issDesign(), 221);
    expect(s.schedule.every((e) => ['card1', 'card2', 'card11', ...ISS_CARDS.map((c) => c.id)].includes(e.id))).toBe(true);
    for (let i = 0; i < 400 && s.phase === 'TRANSIT_OUT'; i++) { if (s.pending) Sim.resolveEvent(s, 0); else Sim.step(s); }
    expect(s.phase).toBe('LOI_PENDING'); // at the station after about a day
    expect(s.t).toBeLessThan(1.2 * 86400);
    const p = issOf(s); p.docked = true; p.panelFixed = true;
    Sim.issUndock(s); expect(s.phase).toBe('ENTRY');
    Sim.performEntry(s);
    const rep = evaluate(s);
    expect(rep.outcomeLabel).toMatch(/^ISS: /);
    expect(rep.outcome).toBe('FULL_SUCCESS');
  });
  it('the desk uses the ISS sheets', () => {
    const d = issDesign();
    const sh = buildFiveSheets(d, analyzeDesign(d));
    expect(sh.map((x) => x.title)).toEqual(['CAN IT LIFT OFF?', 'CAN IT REACH THE STATION?', 'CAN WE CATCH THE STATION AND DOCK?', 'CAN THE SPACEWALKER BREATHE?', 'CAN WE TALK AND AFFORD IT?']);
    expect(sh[1].target).toMatch(/9,400 m\/s to reach the ISS/);
  });
});
