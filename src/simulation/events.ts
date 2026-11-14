/**
 * Context-aware engineering events. Each event is only eligible when the relevant hardware is
 * installed, and its likelihood is weighted by the design (e.g. methalox engines are more prone to
 * propellant-management anomalies; missions without redundancy see more avionics trouble).
 * All randomness flows through the seeded Rng so runs are reproducible.
 */
import { HOUR } from './constants';
import type { Rng } from './rng';
import type { MissionState, PendingEvent, Phase } from './types';

export interface EventDef {
  id: string;
  phases: Phase[];
  eligible: (s: MissionState) => boolean;
  weight: (s: MissionState) => number;
  build: (s: MissionState) => PendingEvent;
  resolve: (s: MissionState, option: number, rng: Rng) => string;
}

const has = (s: MissionState, id: string) => s.stats.parts.some((p) => p.id === id);
const part = (s: MissionState, slot: string) => s.stats.parts.find((p) => p.slot === slot);

export const EVENTS: EventDef[] = [
  {
    id: 'solar_degrade',
    phases: ['TRANSIT_OUT', 'LUNAR_ORBIT', 'TRANSIT_BACK'],
    eligible: (s) => s.stats.power.genKind === 'solar' && s.solarFactor > 0.7,
    weight: () => 1.2,
    build: () => ({
      id: 'solar_degrade', title: 'SOLAR ARRAY PERFORMANCE LOSS',
      text: 'A string of cells on one wing has failed open. Array output is down to 55%.',
      learn: 'Power = what the arrays make minus what the systems use. When generation drops, operators shed non-critical loads to protect the battery.',
      options: [
        { label: 'Shed science loads & re-point wing', detail: 'Instruments off now. Re-pointing recovers output to ~80% after 6 h.' },
        { label: 'Cycle the array drive (50/50)', detail: 'May restore 100%, or jam the wing at 45%. Costs 1.5 kWh.' },
        { label: 'Accept 55% and manage power', detail: 'No immediate action. Watch the battery.' },
      ],
    }),
    resolve: (s, o, rng) => {
      s.solarFactor = 0.55;
      if (o === 0) {
        for (const k of Object.keys(s.instruments)) s.instruments[k].on = false;
        s.timed.push({ at: s.t + 6 * HOUR, kind: 'solarFactor', value: 0.8 });
        return 'Science instruments powered down. Wing re-pointing in progress (6 h).';
      }
      if (o === 1) {
        s.batteryWh = Math.max(0, s.batteryWh - 1500);
        if (rng.chance(0.5)) { s.solarFactor = 1; return 'The array drive cycled cleanly: full output restored!'; }
        s.solarFactor = 0.45; return 'The wing jammed at an off-sun angle. Output now 45%.';
      }
      return 'Continuing at 55% array output.';
    },
  },
  {
    id: 'fuelcell_degrade',
    phases: ['TRANSIT_OUT', 'LUNAR_ORBIT', 'TRANSIT_BACK'],
    eligible: (s) => s.stats.power.genKind === 'fuelcell' && s.fuelCellFactor > 0.8,
    weight: () => 1.2,
    build: () => ({
      id: 'fuelcell_degrade', title: 'FUEL CELL STACK DEGRADED',
      text: 'Stack 2 voltage is dropping: probable water flooding of the membranes. Output down to 65%.',
      learn: 'Fuel cells combine hydrogen and oxygen into electricity and water. Product water that is not removed blocks the reaction.',
      options: [
        { label: 'Purge the stack (4 h offline)', detail: 'Output 30% for 4 h, then ~95% restored.' },
        { label: 'Run degraded', detail: 'Stay at 65% output for the rest of the mission.' },
      ],
    }),
    resolve: (s, o) => {
      if (o === 0) { s.fuelCellFactor = 0.3; s.timed.push({ at: s.t + 4 * HOUR, kind: 'fuelCellFactor', value: 0.95 }); return 'Purge sequence started. Batteries carry the load for 4 h.'; }
      s.fuelCellFactor = 0.65; return 'Fuel cells running at 65%.';
    },
  },
  {
    id: 'comm_outage',
    phases: ['TRANSIT_OUT', 'LUNAR_ORBIT', 'LUNAR_ORBIT_POST', 'TRANSIT_BACK'],
    eligible: () => true,
    weight: (s) => (part(s, 'comms')?.id === 'com_laser' ? 1.6 : 0.9),
    build: (s) => {
      const laser = part(s, 'comms')?.id === 'com_laser';
      return {
        id: 'comm_outage', title: 'COMMUNICATION BLACKOUT',
        text: laser ? 'A storm front covers the optical ground stations. No laser link for ~16 h.' : 'A ground-station network failure: no high-rate link for ~10 h.',
        learn: 'The ground segment is part of the mission: if Earth cannot receive data, it piles up in onboard storage until it is full and new data is lost.',
        options: [
          { label: 'Pause instruments until link returns', detail: 'Protects the recorder. Science time is lost.' },
          { label: 'Keep observing into the recorder', detail: 'More science if the recorder has room; overflow is lost.' },
        ],
      };
    },
    resolve: (s, o) => {
      const laser = part(s, 'comms')?.id === 'com_laser';
      const dur = (laser ? 16 : 10) * HOUR;
      s.commOutageUntil = s.t + dur;
      if (o === 0) {
        for (const k of Object.keys(s.instruments)) if (s.instruments[k].on) { s.instruments[k].on = false; s.timed.push({ at: s.t + dur, kind: `instrumentOn:${k}`, value: 1 }); }
        return 'Instruments paused; they will resume when the link returns.';
      }
      return 'Instruments continue recording. Watch the storage gauge.';
    },
  },
  {
    id: 'prop_anomaly',
    phases: ['TRANSIT_OUT', 'LUNAR_ORBIT', 'LUNAR_ORBIT_POST'],
    eligible: (s) => s.propKg > 500,
    weight: (s) => (part(s, 'propulsion')?.id === 'eng_methalox' ? 2.2 : 0.9),
    build: (s) => {
      const meth = part(s, 'propulsion')?.id === 'eng_methalox';
      return {
        id: 'prop_anomaly', title: 'PROPULSION EFFICIENCY PROBLEM',
        text: meth ? 'Cryogenic boil-off is higher than predicted and the mixture ratio is drifting. About 4% of the remaining propellant is at risk.' : 'A pressurant regulator is leaking. About 3% of the remaining propellant is at risk.',
        learn: 'Propellant margin is your insurance. Every kg lost is Δv you cannot get back, and the return burn (TEI) must still be possible.',
        options: [
          { label: 'Isolate & recalibrate (3 h, 70%)', detail: 'Usually limits the loss to ~1%. Uses 0.8 kWh.' },
          { label: 'Accept the loss', detail: 'Lose the full amount and continue.' },
        ],
      };
    },
    resolve: (s, o, rng) => {
      const meth = part(s, 'propulsion')?.id === 'eng_methalox';
      const frac = meth ? 0.04 : 0.03;
      if (o === 0) {
        s.batteryWh = Math.max(0, s.batteryWh - 800);
        if (rng.chance(0.7)) { const lost = s.propKg * 0.01; s.propKg -= lost; return `Leak isolated. Lost ${Math.round(lost)} kg of propellant.`; }
        const lost = s.propKg * frac; s.propKg -= lost; s.ispFactor *= 0.99; s.entryDispersion = Math.max(s.entryDispersion, 1.1);
        return `Isolation failed. Lost ${Math.round(lost)} kg and engine efficiency dropped 1%.`;
      }
      const lost = s.propKg * frac; s.propKg -= lost; return `Lost ${Math.round(lost)} kg of propellant.`;
    },
  },
  {
    id: 'eclss_fault',
    phases: ['TRANSIT_OUT', 'LUNAR_ORBIT', 'TRANSIT_BACK', 'LUNAR_ORBIT_POST'],
    eligible: () => true,
    weight: (s) => (part(s, 'lifeSupport')?.id === 'ls_regen' ? 1.4 : 0.9),
    build: (s) => {
      const regen = part(s, 'lifeSupport')?.id === 'ls_regen';
      return {
        id: 'eclss_fault', title: 'LIFE SUPPORT LOAD INCREASE',
        text: regen ? 'The water processor has failed: no water is being recycled.' : 'A water tank fitting is leaking: 15% of drinking water lost before it was isolated.',
        learn: 'Consumption keeps going no matter what: oxygen ~0.84 kg and water ~3.5 kg per person per day. Reserves (and recycling) decide how long the crew can last.',
        options: regen
          ? [{ label: 'Repair processor (6 h, 75%)', detail: 'Crew time and 1.5 kWh. Crew fatigue +5.' }, { label: 'Ration water', detail: '20% less water used; crew condition slowly drops.' }]
          : [{ label: 'Ration water', detail: '20% less water used; crew condition slowly drops.' }, { label: 'Use reserves normally', detail: 'No rationing. Margins shrink.' }],
      };
    },
    resolve: (s, o, rng) => {
      const regen = part(s, 'lifeSupport')?.id === 'ls_regen';
      if (regen) {
        s.waterRecovery = 0;
        if (o === 0) {
          s.batteryWh = Math.max(0, s.batteryWh - 1500); s.condition -= 5;
          if (rng.chance(0.75)) { s.timed.push({ at: s.t + 6 * HOUR, kind: 'waterRecovery', value: 0.85 }); return 'Repair underway: recycling returns in 6 h.'; }
          s.rationing = true; return 'Repair failed. Rationing water for the rest of the mission.';
        }
        s.rationing = true; return 'Rationing water.';
      }
      s.waterKg *= 0.85;
      if (o === 0) { s.rationing = true; return 'Water lost; rationing in effect.'; }
      return 'Water lost; continuing normal consumption.';
    },
  },
  {
    id: 'instrument_fault',
    phases: ['LUNAR_ORBIT', 'LUNAR_ORBIT_POST'],
    eligible: (s) => !!s.instruments['sci_mapcam'] && !s.instruments['sci_mapcam'].failed,
    weight: () => 1.3,
    build: () => ({
      id: 'instrument_fault', title: 'INSTRUMENT FAILURE',
      text: 'The mapping camera stopped responding after a radiation upset in its electronics.',
      learn: 'Space radiation can flip bits in electronics (single-event upsets). A power cycle often clears it, but not always.',
      options: [
        { label: 'Power-cycle the camera (60%)', detail: 'Takes 1 h. May restore it.' },
        { label: 'Leave it off', detail: 'Save power; mapping stops for good.' },
      ],
    }),
    resolve: (s, o, rng) => {
      const inst = s.instruments['sci_mapcam'];
      inst.on = false;
      if (o === 0 && rng.chance(0.6)) { s.timed.push({ at: s.t + HOUR, kind: 'instrumentOn:sci_mapcam', value: 1 }); return 'Camera reboot successful; imaging resumes in 1 h.'; }
      inst.failed = true; return o === 0 ? 'The reboot failed. The mapping camera is lost.' : 'Mapping camera left powered off.';
    },
  },
  {
    id: 'spe',
    phases: ['TRANSIT_OUT', 'TRANSIT_BACK', 'LUNAR_ORBIT'],
    eligible: () => true,
    weight: () => 0.9,
    build: (s) => {
      const shelter = has(s, 'saf_shelter');
      return {
        id: 'spe', title: 'SOLAR PARTICLE EVENT',
        text: 'A solar flare has launched a storm of high-energy protons toward the Moon. Arrival in 30 minutes.',
        learn: 'Outside Earth’s magnetic field, crews need shielding mass (like water) between them and solar storms.',
        options: shelter
          ? [{ label: 'Crew to storm shelter', detail: 'Built-in water-wall shelter. 6 h of reduced activity.' }]
          : [{ label: 'Improvise a shelter with stowage', detail: 'Pile water bags and supplies. Ops paused 6 h. Some dose.' }, { label: 'Continue normal operations', detail: 'Keep working. High radiation dose.' }],
      };
    },
    resolve: (s, o) => {
      const shelter = has(s, 'saf_shelter');
      const pause = () => { for (const k of Object.keys(s.instruments)) if (s.instruments[k].on) { s.instruments[k].on = false; s.timed.push({ at: s.t + 6 * HOUR, kind: `instrumentOn:${k}`, value: 1 }); } };
      if (shelter) { pause(); s.radiationDoseMSv += 4; s.condition -= 2; return 'Crew sheltered behind the water wall. Dose kept low (4 mSv).'; }
      if (o === 0) { pause(); s.radiationDoseMSv += 25; s.condition -= 10; return 'Improvised shelter worked partially. Dose 25 mSv; crew shaken.'; }
      s.radiationDoseMSv += 90; s.condition -= 30; return 'Crew received a high dose (90 mSv). Condition badly affected.';
    },
  },
  {
    id: 'avionics_fault',
    phases: ['TRANSIT_OUT', 'LUNAR_ORBIT', 'TRANSIT_BACK'],
    eligible: () => true,
    weight: (s) => (has(s, 'saf_redund') ? 0.6 : 1.3),
    build: (s) => has(s, 'saf_redund')
      ? { id: 'avionics_fault', title: 'FLIGHT COMPUTER FAULT', text: 'The primary flight computer crashed. The redundant backup took over within milliseconds.', learn: 'Redundancy turns a failure into a non-event: this is why crewed spacecraft fly backups for critical systems.', options: [{ label: 'Acknowledge', detail: 'No impact on the mission.' }] }
      : { id: 'avionics_fault', title: 'FLIGHT COMPUTER FAULT', text: 'The flight computer crashed and the spacecraft entered safe mode. Arrays are no longer sun-tracking.', learn: 'Without a backup computer, recovering from a fault takes time, and safe mode costs power.', options: [{ label: 'Reboot now (3 h safe mode)', detail: 'Power generation reduced to 30% for 3 h.' }, { label: 'Patch & run degraded', detail: 'Stay in control, but link rate halves for the rest of the mission.' }] },
    resolve: (s, o) => {
      if (has(s, 'saf_redund')) return 'Backup computer in command. No action needed.';
      if (o === 0) { s.safeModeUntil = s.t + 3 * HOUR; return 'Rebooting... safe mode for 3 h.'; }
      s.timed.push({ at: s.t, kind: 'linkHalf', value: 1 }); return 'Running on a patched computer: downlink rate halved.';
    },
  },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/**
 * Build the event schedule at mission start: one event in each of three mission windows,
 * chosen by weighted draw among eligible events (no repeats).
 */
export function scheduleEvents(s: MissionState, rng: Rng): MissionState['schedule'] {
  const windows: { phases: Phase[]; at: [number, number]; pool: Phase }[] = [
    { phases: ['TRANSIT_OUT'], at: [14 * HOUR, 56 * HOUR], pool: 'TRANSIT_OUT' },
    { phases: ['LUNAR_ORBIT', 'LUNAR_ORBIT_POST'], at: [2 * HOUR, 8 * HOUR], pool: 'LUNAR_ORBIT' },
    { phases: ['TRANSIT_BACK'], at: [10 * HOUR, 50 * HOUR], pool: 'TRANSIT_BACK' },
  ];
  const used = new Set<string>();
  const out: MissionState['schedule'] = [];
  for (const w of windows) {
    const cands = EVENTS.filter((e) => e.phases.includes(w.pool) && !used.has(e.id) && e.eligible(s));
    const pick = rng.weighted(cands, (e) => e.weight(s));
    if (!pick) continue;
    used.add(pick.id);
    out.push({ id: pick.id, at: rng.range(w.at[0], w.at[1]), phases: w.phases });
  }
  return out;
}
