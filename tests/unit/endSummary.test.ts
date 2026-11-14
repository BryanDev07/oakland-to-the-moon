/** End screen (Phase 5 item 3): Apollo / Artemis / hybrid, thinnest margin, costliest call. */
import { describe, expect, it } from 'vitest';
import { cloneDesign, REFERENCE_DESIGN } from '../../src/data/mission';
import { createMission } from '../../src/simulation/mission';
import { evaluate } from '../../src/simulation/scoring';
import { costliestCall, endSummary, margins, missionLikeness } from '../../src/simulation/endSummary';

describe('end summary', () => {
  it('names Apollo, Artemis or a hybrid from launch count, orbit and capsule', () => {
    expect(missionLikeness('apollo', 'LLO', 'cap_apollo').like).toBe('Apollo');
    expect(missionLikeness('artemis', 'NRHO', 'cap_orion').like).toBe('Artemis');
    const h = missionLikeness('apollo', 'NRHO', 'cap_orion');
    expect(h.like).toBe('a hybrid');
    expect(h.why).toMatch(/Apollo's one launch with Artemis's the halo orbit and Orion/);
  });
  it('the thinnest margin comes first and uses the design\'s real numbers', () => {
    const s = createMission(cloneDesign(REFERENCE_DESIGN), 221);
    const ms = margins(s);
    expect(ms.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < ms.length; i++) expect(ms[i].spare).toBeGreaterThanOrEqual(ms[i - 1].spare);
    const es = endSummary(s, evaluate(s));
    expect(es.lines[0]).toBe('Your mission is most like Apollo.');
    expect(es.margin).toContain(ms[0].what);
  });
  it('the costliest call skips cancelled effects and prefers crew safety over time', () => {
    const rep = { decisions: [
      { event: 'Time', choice: 'A. Wait', fd: false, bad: '-2 hours of crew time' },
      { event: 'Crew', choice: 'B. Push on', fd: false, bad: '-10 crew safety' },
      { event: 'Fixed', choice: 'C. Fix', fd: false, bad: 'Cancelled by your free fix.' },
    ] } as unknown as Parameters<typeof costliestCall>[0];
    expect(costliestCall(rep)).toMatch(/^Crew: you chose "Push on"/);
  });
});
