/**
 * Spec landers (JOSEPH_SPEC.md tab 3 §6) expressed as hangar components. Numbers come from
 * specParts.ts (lb, R/G tagged) and are converted to kg here, once.
 */
import type { Component } from './components';
import { LANDERS, LANDER_BASE_LOAD_W, INSTRUMENTS } from './specParts';
import { G0 } from '../simulation/constants';
import { lbToKg } from '../simulation/units';

const ROCK_LB = INSTRUMENTS.find((i) => i.id === 'sci_samples')!.rockLb!.v;

const blurb: Record<string, { short: string; sprite: string; desc: string; learn: string }> = {
  lander_apollo: { short: 'Apollo LM (2)', sprite: 'lander_scout', desc: '2 crew, 48 h on the surface. Light and proven: built for low lunar orbit.', learn: 'Short trip down and up from low orbit (1,870 m/s each way). From the halo orbit (2,600 m/s down) it runs out of fuel.' },
  lander_xlm: { short: 'Extended LM (2)', sprite: 'lander_scout', desc: '2 crew, 75 h stays and more descent fuel (Apollo 15-17).', learn: 'More descent fuel buys a longer stay and room for a rover, at the cost of weight the capsule must push into orbit.' },
  lander_hls: { short: 'Large lander (4)', sprite: 'lander_path', desc: '4 crew, 7-day stays. Big enough for the long trip down from the halo orbit.', learn: 'An Artemis-style lander flies to the halo orbit on its own launch and pays its own 430 m/s to get there.' },
};

export const SPEC_LANDER_COMPONENTS: Component[] = LANDERS.map((l) => ({
  id: l.id, slot: 'lander', name: l.name, short: blurb[l.id].short, sprite: blurb[l.id].sprite,
  desc: blurb[l.id].desc, learn: blurb[l.id].learn,
  massKg: 0, costM: l.priceUsd.v / 1e6, specTag: l.priceUsd.tag,
  crewCapacity: l.crew.v,
  descentDryKg: lbToKg(l.descentDryLb.v), descentPropKg: lbToKg(l.descentFuelLb.v),
  ascentDryKg: lbToKg(l.ascentDryLb.v), ascentPropKg: lbToKg(l.ascentFuelLb.v),
  ispS: l.veMs.v / G0, thrustN: l.descentThrustN.v, ascentThrustN: l.ascentThrustN.v,
  landerBatteryWh: 0, // surface power comes from 5 kWh packs and/or the surface solar array
  landerLoadW: LANDER_BASE_LOAD_W.v, stayRatedH: l.maxStayH.v,
  sampleCapacityKg: lbToKg(ROCK_LB),
}));
