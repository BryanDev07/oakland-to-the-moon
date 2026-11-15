/**
 * The latest log message as one complete sentence that fits a small strip: card numbers ("2. ") and
 * option letters ("A. ") are dropped, then the first sentence is used, then its first clause, then the
 * sentence without its brackets. Never a cut-off fragment. Pure: the caller measures the text.
 */
export function headlineCandidates(text: string): string[] {
  const clean = text.replace(/^\d+\.\s+/, '').replace(/:\s+[A-C]\.\s+/, ': ').replace(/\s+/g, ' ').trim();
  const sentences = clean.split(/(?<=[.!?])\s+(?=[A-Z])/);
  const first = sentences[0].trim();
  const end = (x: string) => (/[.!?]$/.test(x) ? x : `${x}.`);
  const out = [first];
  const noBrackets = first.replace(/\s*\([^)]*\)/g, '').trim();
  if (noBrackets !== first) out.push(end(noBrackets));
  const colon = first.indexOf(': ');
  if (colon > 8) { out.push(end(first.slice(colon + 2))); out.push(end(first.slice(0, colon))); }
  const comma = first.indexOf(', ');
  if (comma > 12) out.push(end(first.slice(0, comma)));
  return out;
}
/** Pick the first candidate that fits (fits() measures it). */
export function headline(text: string, fits: (s: string) => boolean): string {
  const c = headlineCandidates(text);
  return c.find(fits) ?? c[c.length - 1];
}
