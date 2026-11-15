/**
 * D2: key terms, underlined on the desk paper (hover or click for a one-sentence definition) and listed
 * on the science library's Glossary page.
 */
export interface GlossaryTerm { term: string; match: RegExp; def: string }
export const GLOSSARY_TERMS: GlossaryTerm[] = [
  { term: 'Speed gained (Δv)', match: /speed gained|Δv/i, def: 'How much a rocket can change its speed by burning its fuel; every trip costs some.' },
  { term: 'Thrust-to-weight', match: /thrust-to-weight/i, def: 'Engine push divided by weight; above 1 the rocket can climb.' },
  { term: 'Exhaust speed', match: /exhaust speed/i, def: 'How fast the gas leaves the nozzle; faster means more speed from each pound of fuel.' },
  { term: 'Staging', match: /staging|dropp?(ing|ed)? stage \d|dead weight/i, def: 'Dropping empty rocket stages so you stop carrying their dead weight.' },
  { term: 'LLO (low lunar orbit)', match: /\bLLO\b|low lunar orbit|low orbit/i, def: 'Apollo\'s orbit about 60 miles above the Moon: short lander trips, big capsule burns.' },
  { term: 'NRHO (halo orbit)', match: /\bNRHO\b|halo orbit/i, def: 'Artemis\'s stretched orbit: small capsule burns and constant contact, long lander trips.' },
  { term: 'TLI (trans-lunar injection)', match: /\bTLI\b|trans-lunar injection/i, def: 'The burn that leaves Earth orbit and aims the ship at the Moon.' },
  { term: 'Docking', match: /docking|dock\b/i, def: 'Two spacecraft joining together gently, with sealed hatches between them.' },
  { term: 'EVA (spacewalk)', match: /\bEVA\b|spacewalk|moonwalk/i, def: 'Going outside the spacecraft in a spacesuit.' },
  { term: 'Heat shield', match: /heat shield|shield health/i, def: 'The capsule\'s base that takes the 5,000°F heat of coming home through the air.' },
];

/** Every glossary term found in a line: [start, end) character ranges with the term's definition. */
export function findTerms(text: string): { start: number; end: number; term: GlossaryTerm }[] {
  const out: { start: number; end: number; term: GlossaryTerm }[] = [];
  for (const t of GLOSSARY_TERMS) {
    const re = new RegExp(t.match.source, t.match.flags.includes('g') ? t.match.flags : t.match.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (!out.some((o) => m!.index < o.end && m!.index + m![0].length > o.start)) out.push({ start: m.index, end: m.index + m[0].length, term: t });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
