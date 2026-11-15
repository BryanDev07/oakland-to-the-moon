/** A6: every "this really happened" card names its real event and source; scenarios do not. */
import { describe, expect, it } from 'vitest';
import { DECK } from '../../src/simulation/deck';
import { CARD_SOURCES, realEventLine } from '../../src/data/cardSources';

describe('real-event lines on emergency cards', () => {
  it('each real card has a one-line event with a source name and link; scenario cards have none', () => {
    for (const c of DECK) {
      const real = !c.scenario && c.n !== 13;
      expect(!!CARD_SOURCES[c.id]).toBe(real);
      if (real) { expect(realEventLine(c.id)).toMatch(/^Real event: .+ \(.+\)$/); expect(CARD_SOURCES[c.id].url).toMatch(/^https:\/\//); }
    }
    expect(realEventLine('card11')).toBe('Real event: Soyuz MS-09 leak, ISS, 2018 (NBC News)');
  });
});
