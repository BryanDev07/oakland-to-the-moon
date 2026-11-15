/** D3: each role gets exactly four decisions per Moon mission (two design, two flight) and they apply. */
import { describe, expect, it } from 'vitest';
import { cloneDesign, REFERENCE_DESIGN } from '../../src/data/mission';
import type { RoleId } from '../../src/data/specParts';
import { createMission } from '../../src/simulation/mission';
import { analyzeDesign } from '../../src/simulation/spacecraft';
import { applyDesignPick, applyFlightPick, cardsFor, dueDesignCard, dueFlightCard, FLIGHT_CARDS } from '../../src/simulation/roleDecisions';
import { em } from '../../src/simulation/deck';

const ROLES: RoleId[] = ['commander', 'propulsion', 'spacecraft', 'science'];
const withRole = (role: RoleId) => { const d = cloneDesign(REFERENCE_DESIGN); d.spec = { ...d.spec!, role }; return d; };

describe('role decisions', () => {
  it('each role gets exactly 4 decisions: design 1 and 2, flight 3 and 4', () => {
    for (const r of ROLES) {
      const c = cardsFor(r);
      expect(c.design.map((x) => x.when)).toEqual(['design1', 'design2']);
      expect(c.flight.map((x) => x.when)).toEqual(['flight3', 'flight4']);
      for (const card of [...c.design, ...c.flight]) { expect(card.options).toHaveLength(3); expect(card.tip).toHaveLength(3); }
    }
  });
  it('design picks change the design, are logged once, and their costs reach the budget', () => {
    let d = withRole('commander');
    const before = analyzeDesign(d).costM;
    const c1 = dueDesignCard(d, 'design1')!;
    d = applyDesignPick(d, c1, 0); // hold a 10% reserve
    expect(dueDesignCard(d, 'design1')).toBeNull();
    expect(analyzeDesign(d).costM - before).toBeCloseTo(analyzeDesign(d).spec!.budgetM * 0.1, 0);
    const c2 = dueDesignCard(d, 'design2')!;
    d = applyDesignPick(d, c2, 1); // wait two days: no lightning
    const s = createMission(d, 221);
    expect(s.schedule.some((x) => x.id === 'card2')).toBe(false);
    expect(em(s).safetyAdj).toBe(5);
    expect(s.decisions.filter((x) => x.event.startsWith('ROLE DECISION'))).toHaveLength(2);
    // propulsion: 4 boosters really changes the rocket
    let p = withRole('propulsion');
    p = applyDesignPick(p, dueDesignCard(p, 'design1')!, 1);
    expect(p.spec!.rocket!.boosterCount).toBe(4);
    // spacecraft: bigger battery really changes the battery
    let sc = withRole('spacecraft');
    const bat = sc.slots.battery;
    sc = applyDesignPick(sc, dueDesignCard(sc, 'design1')!, 0);
    expect(sc.slots.battery).not.toBe(bat);
  });
  it('flight picks change the mission and fire once each, in their phase', () => {
    const s = createMission(withRole('propulsion'), 221);
    expect(dueFlightCard(s)).toBeNull(); // not yet 6 hours into the coast
    s.t = 7 * 3600;
    const card = dueFlightCard(s)!;
    expect(card.id).toBe('prop3');
    const fuel = s.propKg;
    applyFlightPick(s, card, 0); // small burn now
    expect(s.propKg).toBeLessThan(fuel);
    expect(dueFlightCard(s)).toBeNull();
    const cmd = createMission(withRole('commander'), 221);
    const extend = FLIGHT_CARDS.find((x) => x.id === 'cmd4')!;
    const o2 = cmd.o2Kg;
    applyFlightPick(cmd, extend, 0);
    expect(em(cmd).scienceAdj).toBe(8);
    expect(cmd.o2Kg).toBeLessThan(o2);
  });
});
