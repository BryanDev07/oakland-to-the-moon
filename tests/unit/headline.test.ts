/** Fix 3: the coast screen shows the latest message as one complete sentence, never a fragment. */
import { describe, expect, it } from 'vitest';
import { headline, headlineCandidates } from '../../src/game/ui/headline';

const fitsChars = (n: number) => (s: string) => s.length <= n;

describe('log headline', () => {
  it('drops card numbers and option letters and keeps the first sentence', () => {
    expect(headline('2. LIGHTNING STRIKE AFTER LIFTOFF: A. Switch to the backup power supply. Backup supply took over.', fitsChars(76)))
      .toBe('LIGHTNING STRIKE AFTER LIFTOFF: Switch to the backup power supply.');
  });
  it('falls back to a shorter complete clause, never a cut-off word', () => {
    const long = 'Transposition: the capsule turned around and docked with the lander, using 40 lb of thruster fuel. Next up: the coast.';
    const h = headline(long, fitsChars(60));
    expect(h.length).toBeLessThanOrEqual(60);
    expect(h).toMatch(/[.!?]$/);
    expect(long.replace(/\s+/g, ' ')).toContain(h.replace(/\.$/, ''));
    expect(headlineCandidates('Hard landing (3.4 m/s)! The camera was damaged.')[0]).toBe('Hard landing (3.4 m/s)!');
  });
});
