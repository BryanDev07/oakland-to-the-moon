/**
 * Hangar "Mission Style" panel text (JOSEPH_SPEC tab 2 "The big choice" and tab 3 section 5).
 * Rundowns are game text; every number shown next to them comes from specParts.ts.
 */
import type { OrbitId } from './specParts';

export const STYLE_RUNDOWN = {
  capsule: 'The capsule is where the crew lives on the way there and back, and its heat shield is the only thing between them and 5,000°F on re-entry. Its service module carries the fuel for getting into and out of lunar orbit.',
  orbit: 'Low lunar orbit makes the lander\'s trip short but the capsule\'s burns big. The halo orbit makes the capsule\'s burns small and keeps constant contact, but the lander\'s trip is long.',
  architecture: 'Apollo-style flies one launch and the capsule pushes the lander into orbit. Artemis-style flies two launches: the lander pays its own way in, but you buy two rockets.',
};

export const CAPSULE_RUNDOWN: Record<string, string> = {
  cap_orion: 'NASA\'s deep-space capsule: 4 seats, 21 days and a lunar-rated shield. Its small service module cannot do a low-orbit round trip.',
  cap_apollo: 'A 3-seat capsule with a big service module. It can push a lander into low lunar orbit and still get home.',
  cap_budget: 'Cheap and roomy, but built for Earth orbit. Its 17,500 mph shield fails a return from the Moon (a trap).',
};

/** ISS mission (E2): the Budget capsule, a trap on the Moon, is the smart pick here; Orion is overkill. */
export const ISS_CAPSULE_RUNDOWN: Record<string, string> = {
  cap_budget: 'The smart pick for the ISS: cheap, 4 seats, and its 17,500 mph shield is exactly what low orbit needs.',
  cap_orion: 'Overkill here: a $900,000,000 Moon capsule for a trip to low orbit.',
  cap_apollo: 'It works, but it is heavier and pricier than this trip needs.',
};
export const ORBIT_RUNDOWN: Record<OrbitId, string> = {
  LLO: 'Apollo\'s orbit, about 60 miles up. Big capsule burns, a short lander trip, and contact lost behind the Moon.',
  NRHO: 'Artemis\'s halo orbit. Small capsule burns and constant contact, but a long trip down and up for the lander.',
};

export const ARCH_RUNDOWN = {
  apollo: 'One launch: the capsule pushes the lander into lunar orbit. One rocket to buy, but a heavy stack. (~$1.9B in the prototype, G)',
  artemis: 'Two launches: the lander flies alone and pays its own way in. Lighter stacks, but two rockets. (~$4.3B in the prototype, G)',
};
