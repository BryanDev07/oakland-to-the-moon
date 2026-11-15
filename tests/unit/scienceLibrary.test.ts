/** Science library (Phase 5 item 4): formulas with words and sources; every part value tagged. */
import { describe, expect, it } from 'vitest';
import { FORMULAS, partValues } from '../../src/data/scienceLibrary';

describe('science library', () => {
  it('every formula has its maths, plain words and a source (a link unless it is a game rule)', () => {
    expect(FORMULAS.length).toBeGreaterThanOrEqual(15);
    for (const f of FORMULAS) {
      expect(f.math.length).toBeGreaterThan(5);
      expect(f.words.length).toBeGreaterThan(10);
      expect(f.source.label.length).toBeGreaterThan(3);
      if (!/Game rule/.test(f.source.label)) expect(f.source.url).toMatch(/^https:\/\//);
    }
    expect(FORMULAS.map((f) => f.name)).toContain('Speed gained (Δv)');
  });
  it('lists every tagged part value with R or G, and every R value has a source link', () => {
    const rows = partValues();
    expect(rows.length).toBeGreaterThan(150);
    for (const r of rows) {
      expect(['R', 'G']).toContain(r.tag);
      if (r.tag === 'R') expect(r.source.url).toMatch(/^https:\/\//);
    }
    const rl10 = rows.find((r) => r.part === 'RL10' && r.field.startsWith('exhaust speed'))!;
    expect(rl10).toMatchObject({ value: 4530, tag: 'R' });
  });
});
