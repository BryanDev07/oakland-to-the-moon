/**
 * Mission-planning options: launch vehicles, landing sites, operations tempo.
 * Launch vehicles and agency are FICTIONAL. Δv values are rounded Apollo-era style estimates.
 */
export interface LaunchVehicle {
  id: 'bayhawk' | 'estuary' | 'goldenbear';
  name: string;
  short: string;
  tliCapacityKg: number; // payload mass deliverable to trans-lunar injection
  costM: number;
  reliability: number; // success probability; drives chance of upper-stage underperformance event
  desc: string;
  learn: string;
}

export const LAUNCH_VEHICLES: LaunchVehicle[] = [
  { id: 'bayhawk', name: 'Bayhawk-M', short: 'Bayhawk-M', tliCapacityKg: 38500, costM: 850, reliability: 0.985,
    desc: 'Medium lift. Cheapest, many flights of heritage, but only 38.5 t to the Moon.',
    learn: 'A smaller rocket is cheaper and more proven, but forces a lighter spacecraft.' },
  { id: 'estuary', name: 'Estuary Heavy', short: 'Estuary Heavy', tliCapacityKg: 45000, costM: 1350, reliability: 0.98,
    desc: 'Core stage + two side boosters. 45 t to trans-lunar injection.',
    learn: 'Strap-on boosters add thrust at liftoff and are dropped when empty (staging).' },
  { id: 'goldenbear', name: 'Golden Bear SHLV', short: 'Golden Bear', tliCapacityKg: 56000, costM: 1850, reliability: 0.97,
    desc: 'Super heavy lift. 56 t to the Moon, but new and expensive.',
    learn: 'More capability costs money and a newer vehicle carries more risk of underperformance.' },
];

export interface LandingSite {
  id: 'equator' | 'marius' | 'pole';
  name: string;
  short: string;
  dvLoi: number; dvTei: number; dvDescent: number; // m/s
  scienceMult: number;
  surfaceCommAvailability: number;
  landerHeaterW: number;
  hazardDensity: number; // 0..1 boulder/crater density for landing
  desc: string;
  learn: string;
  special: string; // special activity id
}

export const SITES: LandingSite[] = [
  { id: 'equator', name: 'Sea of Tranquility', short: 'Tranquility', dvLoi: 900, dvTei: 950, dvDescent: 2250, scienceMult: 1.0, surfaceCommAvailability: 1, landerHeaterW: 0, hazardDensity: 0.25,
    desc: 'Flat volcanic plain near the equator. Easy to reach, Earth always overhead.',
    learn: 'Equatorial near-side sites need the least Δv and have continuous Earth contact.', special: 'regolith' },
  { id: 'marius', name: 'Marius Hills Skylight', short: 'Marius Hills', dvLoi: 930, dvTei: 980, dvDescent: 2280, scienceMult: 1.3, surfaceCommAvailability: 1, landerHeaterW: 0, hazardDensity: 0.45,
    desc: 'Volcanic domes and a pit opening into a lava tube. Rougher terrain.',
    learn: 'Lava tubes could shelter future bases from radiation and temperature extremes.', special: 'skylight' },
  { id: 'pole', name: 'Shackleton Rim (South Pole)', short: 'South Pole', dvLoi: 1050, dvTei: 1100, dvDescent: 2320, scienceMult: 1.6, surfaceCommAvailability: 0.55, landerHeaterW: 250, hazardDensity: 0.6,
    desc: 'Rugged rim near craters that may hold water ice. Earth low on the horizon.',
    learn: 'Polar orbits cost extra Δv; low Earth elevation blocks the radio link part of the time; ice is the prize.', special: 'ice' },
];

export interface Tempo { id: 'conservative' | 'balanced' | 'aggressive'; name: string; evaHoursPerDay: number; reserveDays: number; stressPerDay: number; desc: string }
export const TEMPOS: Tempo[] = [
  { id: 'conservative', name: 'Conservative', evaHoursPerDay: 4, reserveDays: 3, stressPerDay: 0, desc: '4 EVA hours/day, 3 days of reserve consumables.' },
  { id: 'balanced', name: 'Balanced', evaHoursPerDay: 6, reserveDays: 2, stressPerDay: 2, desc: '6 EVA hours/day, 2 days of reserve.' },
  { id: 'aggressive', name: 'Aggressive', evaHoursPerDay: 8, reserveDays: 1, stressPerDay: 6, desc: '8 EVA hours/day, 1 day of reserve. Fatiguing.' },
];

export interface MissionPlan {
  lv: LaunchVehicle['id'];
  site: LandingSite['id'];
  crew: 3 | 4;
  stayDays: 1 | 2 | 3;
  tempo: Tempo['id'];
  lunarOrbitDays: number; // planned orbit time before descent (for consumables), days
}

export interface Design {
  slots: Partial<Record<string, string>>; // single-choice slots -> component id
  safety: string[];
  science: string[];
  plan: MissionPlan;
}

export const DEFAULT_PLAN: MissionPlan = { lv: 'estuary', site: 'equator', crew: 3, stayDays: 2, tempo: 'balanced', lunarOrbitDays: 1 };

/** Starting baseline: a deliberately UNFINISHED design (no lander picked, small tanks) to teach the builder. */
export const BASELINE_DESIGN: Design = {
  slots: { propulsion: 'eng_hyper', tank: 'tank_s', lander: 'lander_scout', power: 'pwr_solar6', battery: 'bat_12', comms: 'com_sband', storage: 'dat_128', lifeSupport: 'ls_open', thermal: 'thr_std', heatShield: 'hs_std', guidance: 'gnc_std' },
  safety: [],
  science: ['sci_samples'],
  plan: { ...DEFAULT_PLAN },
};

/** A known-good reference design used by tests and the "Suggested build" helper. */
export const REFERENCE_DESIGN: Design = {
  slots: { propulsion: 'eng_methalox', tank: 'tank_m', lander: 'lander_scout', power: 'pwr_solar6', battery: 'bat_24', comms: 'com_hga', storage: 'dat_1t', lifeSupport: 'ls_open', thermal: 'thr_std', heatShield: 'hs_std', guidance: 'gnc_trn' },
  safety: ['saf_shelter'],
  science: ['sci_mapcam', 'sci_samples', 'sci_seismo', 'sci_pancam'],
  plan: { ...DEFAULT_PLAN },
};

export const LV_BY_ID = Object.fromEntries(LAUNCH_VEHICLES.map((v) => [v.id, v])) as Record<LaunchVehicle['id'], LaunchVehicle>;
export const SITE_BY_ID = Object.fromEntries(SITES.map((s) => [s.id, s])) as Record<LandingSite['id'], LandingSite>;
export const TEMPO_BY_ID = Object.fromEntries(TEMPOS.map((t) => [t.id, t])) as Record<Tempo['id'], Tempo>;

export function cloneDesign(d: Design): Design {
  return JSON.parse(JSON.stringify(d));
}
