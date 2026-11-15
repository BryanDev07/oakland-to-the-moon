/**
 * A6: the real event behind each "this really happened" emergency card, in one line, with the source
 * name and link (JOSEPH_SPEC tab 8 / SOURCES.md). Cards not listed here are scenarios (3, 6, 9, 10,
 * 14, 15) or a real effect (13).
 */
export interface CardSource { event: string; source: string; url: string }
export const CARD_SOURCES: Record<string, CardSource> = {
  card1: { event: 'Falcon 9 engine shut down on the way up, CRS-1, 2012', source: 'NASASpaceflight', url: 'https://www.nasaspaceflight.com/2012/10/dragon-iss-spacex-review-falcon-9-ascent-issues/' },
  card2: { event: 'Apollo 12 struck by lightning twice after liftoff, 1969', source: 'Space.com', url: 'https://www.space.com/apollo-12-lightning-strike-twice-launch-video.html' },
  card4: { event: 'Apollo 13 oxygen tank exploded, 1970', source: 'History.com', url: 'https://www.history.com/this-day-in-history/apollo-13-oxygen-tank-explodes' },
  card5: { event: 'Apollo 13 crew built a CO2 filter adapter, 1970', source: 'Planetary Society', url: 'https://www.planetary.org/space-missions/apollo-13' },
  card7: { event: 'Apollo 11 computer alarms 1202 / 1201 during landing, 1969', source: 'Space.com', url: 'https://www.space.com/26593-apollo-11-moon-landing-scariest-moments.html' },
  card8: { event: 'Apollo 11 landed with very little fuel left, 1969', source: 'Space.com', url: 'https://www.space.com/26593-apollo-11-moon-landing-scariest-moments.html' },
  card11: { event: 'Soyuz MS-09 leak, ISS, 2018', source: 'NBC News', url: 'https://www.nbcnews.com/mach/science/astronauts-use-gauze-high-tech-tape-plug-hole-iss-ncna905326' },
  card12: { event: 'Starliner thrusters failed near the ISS, 2024', source: 'Space.com', url: 'https://www.space.com/nasa-boeing-starliner-astronauts-will-return-on-spacex-dragon-2025' },
  card16: { event: 'Hydrogen leak scrubbed Artemis I, 2022', source: 'Space.com', url: 'https://www.space.com/artemis-1-launch-scrub-hydrogen-leak' },
};
/** "Real event: Soyuz MS-09 leak, ISS, 2018 (NBC News)" */
export const realEventLine = (id: string): string | null => { const c = CARD_SOURCES[id]; return c ? `Real event: ${c.event} (${c.source})` : null; };
