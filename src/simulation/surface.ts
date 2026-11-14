/**
 * Surface operations: EVA activities consume crew time (EVA hours), lander battery energy and
 * suit oxygen, and produce science points. Time on the surface also advances the orbiting CSM.
 */
import { SITE_BY_ID, TEMPO_BY_ID } from '../data/mission';
import { DAY, EVA_O2_KG_PER_HOUR, HOUR } from './constants';
import { advance, ascentCheck, log } from './mission';
import { Rng } from './rng';
import type { MissionState } from './types';
import { INSTRUMENTS } from '../data/specParts';

/** Science points per instrument come from the spec (tab 4, G). Samples: 30 points for a full 100 lb kit. */
const pts = (id: string) => INSTRUMENTS.find((i) => i.id === id)!.points.v;
const SAMPLE_POINTS_PER_10KG = pts('sci_samples') * 10 / (INSTRUMENTS.find((i) => i.id === 'sci_samples')!.rockLb!.v * 0.45359237);

export interface Activity {
  id: string;
  name: string;
  icon: string;
  hours: number;
  requires?: string; // component id
  site?: string;
  max: number; // times it can be done
  points: number; // base science points (site multiplier applies)
  sampleKg?: number;
  dataMB?: number;
  desc: string;
  learn: string;
}

export const ACTIVITIES: Activity[] = [
  { id: 'plaque', name: 'Place the Oakland plaque', icon: 'star', hours: 0.5, max: 1, points: 0, desc: '"From the Town to the Stars." A plaque from the kids at Eastlake Rec Center.', learn: 'Exploration is a human story: missions carry the hopes of the communities behind them.' },
  { id: 'broadcast', name: 'Live broadcast to Oakland', icon: 'comms', hours: 0.5, max: 1, points: 4, desc: 'Talk to students watching at the rec center. Needs an Earth link.', learn: 'Public engagement is part of every NASA mission. At the poles, Earth is low and terrain can block the signal.' },
  { id: 'seismo', name: 'Deploy seismometer', icon: 'science', hours: 2, requires: 'sci_seismo', max: 1, points: pts('sci_seismo'), desc: 'Level the package and connect its radio. It will listen for moonquakes for years.', learn: 'Long-lived surface stations keep returning science long after the crew leaves.' },
  { id: 'samples', name: 'Collect geology samples', icon: 'sample', hours: 1.5, requires: 'sci_samples', max: 9, points: SAMPLE_POINTS_PER_10KG, sampleKg: 10, desc: 'Grab samples, rake soil and seal 10 kg in containers.', learn: 'Every kg of sample must be lifted by the ascent stage: watch the ascent margin!' },
  { id: 'pancam', name: 'Panoramic survey', icon: 'science', hours: 1, requires: 'sci_pancam', max: 1, points: pts('sci_pancam'), dataMB: 5000, desc: 'Shoot stereo panoramas to document the geology around the site.', learn: 'Context images let scientists on Earth plan the next traverse.' },
  { id: 'retro', name: 'Place laser retroreflector', icon: 'star', hours: 1, requires: 'sci_retro', max: 1, points: pts('sci_retro'), desc: 'Aim the mirror array at Earth for laser ranging.', learn: 'Laser ranging shows the Moon drifts ~3.8 cm farther from Earth each year.' },
  { id: 'drill', name: 'Drill a deep core', icon: 'sample', hours: 3, requires: 'sci_drill', max: 1, points: pts('sci_drill'), dataMB: 20, desc: 'Drill a few feet down to sample buried layers.', learn: 'The drill draws 300 W. Every surface watt has to be covered by batteries or a solar array.' },
  { id: 'gpr', name: 'Radar traverse', icon: 'science', hours: 2, requires: 'sci_gpr', max: 1, points: pts('sci_gpr'), dataMB: 2000, desc: 'Walk the radar across the site to map what is under the surface.', learn: 'Radar makes huge amounts of data: you need Ka-band or laser comms to send it home.' },
  { id: 'rover', name: 'Rover traverse', icon: 'moon', hours: 3, requires: 'sci_rover', max: 1, points: pts('sci_rover'), dataMB: 100, desc: 'Drive miles from the lander to reach new rocks, like Apollo 15-17.', learn: 'A rover multiplies how much ground the crew can cover, but it weighs about 460 lb and draws 500 W.' },
  { id: 'regolith', name: 'Drive a core tube', icon: 'sample', hours: 2, requires: 'sci_samples', site: 'equator', max: 1, points: 8, sampleKg: 4, desc: 'Hammer a core tube to sample buried layers of regolith.', learn: 'Layers of lunar soil record billions of years of solar wind.' },
  { id: 'skylight', name: 'Survey the lava-tube skylight', icon: 'science', hours: 2.5, requires: 'sci_pancam', site: 'marius', max: 1, points: 15, dataMB: 9000, desc: 'Image the walls of the pit and peer into the lava tube.', learn: 'Lava tubes may be natural shelters for future lunar bases.' },
  { id: 'ice', name: 'Sample shadowed ice regolith', icon: 'sample', hours: 3, requires: 'sci_samples', site: 'pole', max: 1, points: 20, sampleKg: 6, desc: 'Venture to the edge of permanent shadow and seal a cold sample.', learn: 'Water ice could be turned into drinking water, oxygen and rocket propellant.' },
];

export interface AvailableActivity { a: Activity; ok: boolean; reason: string }

export function surfaceStatus(s: MissionState) {
  const tempo = TEMPO_BY_ID[s.design.plan.tempo];
  const stayH = Math.min(s.design.plan.stayDays * 24, s.stats.lander.stayCapacityH - (s.em?.landerLostH ?? 0)); // card 5: borrowed lander supplies
  const evaLeftToday = tempo.evaHoursPerDay - s.surface.evaUsedToday;
  const daysLeft = s.design.plan.stayDays - s.surface.day;
  const asc = ascentCheck(s);
  return { tempo, stayH, evaLeftToday, daysLeft, landerBatteryWh: s.landerBatteryWh, landerBatteryCap: Math.max(1, s.stats.lander.batteryWh ?? s.stats.parts.find((p) => p.slot === 'lander')?.landerBatteryWh ?? 1), ascent: asc };
}

export function availableActivities(s: MissionState): AvailableActivity[] {
  const st = surfaceStatus(s);
  const site = s.design.plan.site;
  return ACTIVITIES.filter((a) => !a.site || a.site === site).map((a) => {
    const n = s.surface.done[a.id] ?? 0;
    if (a.requires && !s.stats.parts.some((p) => p.id === a.requires)) return { a, ok: false, reason: 'Instrument not installed' };
    if (a.requires && s.landing.damaged === a.requires) return { a, ok: false, reason: 'Damaged in hard landing' };
    if (n >= a.max) return { a, ok: false, reason: a.max > 1 ? 'Kit full' : 'Done' };
    if (a.sampleKg && s.surface.samplesKg + a.sampleKg > s.stats.lander.sampleCapacityKg) return { a, ok: false, reason: 'Sample containers full' };
    if (a.hours > st.evaLeftToday) return { a, ok: false, reason: st.daysLeft > 0 ? 'Not enough EVA time today' : 'No EVA time left' };
    return { a, ok: true, reason: '' };
  });
}

/** Perform an activity. Advances mission time (CSM keeps orbiting). */
export function doActivity(s: MissionState, id: string): { ok: boolean; message: string; points: number } {
  const av = availableActivities(s).find((x) => x.a.id === id);
  if (!av || !av.ok) return { ok: false, message: av?.reason ?? 'Unknown activity', points: 0 };
  const a = av.a;
  const site = SITE_BY_ID[s.design.plan.site];
  const st = surfaceStatus(s);
  let points = a.points * (a.points ? site.scienceMult : 1);
  let message = a.desc;
  if (a.id === 'broadcast') {
    const rng = new Rng(s.rngState ^ 0xb0ad);
    const ok = rng.chance(site.surfaceCommAvailability);
    s.rngState = rng.state;
    if (!ok) { points = 0; message = 'The Earth dipped behind the crater rim: the broadcast dropped out. (Polar comms limits!)'; }
    else { s.surface.broadcast = true; message = 'Hundreds of students at Eastlake Rec cheer as Commander Kai waves from the Moon!'; }
  }
  if (a.sampleKg) s.surface.samplesKg += a.sampleKg;
  if (a.id === 'seismo') s.storedMB.seismo += 500;
  if (a.dataMB) { s.acquiredMB.pancam += a.dataMB; s.downMB.pancam += a.dataMB; } // relayed via lander link / carried home
  s.surface.done[a.id] = (s.surface.done[a.id] ?? 0) + 1;
  s.surface.points[a.id] = (s.surface.points[a.id] ?? 0) + points;
  s.surface.evaUsedToday += a.hours;
  s.surface.hoursOnSurface += a.hours;
  s.landerBatteryWh = Math.max(0, s.landerBatteryWh - s.stats.lander.landerLoadW * a.hours);
  void st; void EVA_O2_KG_PER_HOUR;
  advance(s, a.hours * HOUR, false);
  log(s, `EVA: ${a.name} (+${points.toFixed(0)} science)`, 'good');
  return { ok: true, message, points };
}

/** End the EVA day: rest period until the next day (or until the planned stay ends). */
export function restUntilNextDay(s: MissionState): { ok: boolean; message: string } {
  const st = surfaceStatus(s);
  if (st.daysLeft <= 0) return { ok: false, message: 'Planned stay complete: time to lift off.' };
  const restH = 24 - s.surface.evaUsedToday;
  if (s.surface.hoursOnSurface + restH > st.stayH + 1e-6) return { ok: false, message: 'The lander cannot support another night: time to lift off.' };
  s.landerBatteryWh = Math.max(0, s.landerBatteryWh - s.stats.lander.landerLoadW * restH);
  s.surface.hoursOnSurface += restH;
  s.surface.day += 1;
  s.surface.evaUsedToday = 0;
  s.condition = Math.max(1, s.condition - st.tempo.stressPerDay);
  advance(s, restH * HOUR, false);
  void DAY;
  log(s, `Sleep period. Surface day ${s.surface.day} begins.`, 'info');
  if (s.landerBatteryWh <= 0) return { ok: false, message: 'Lander batteries depleted! Emergency liftoff required.' };
  return { ok: true, message: `Day ${s.surface.day}: ${st.tempo.evaHoursPerDay} EVA hours available.` };
}

export function surfaceScience(s: MissionState) { return Object.values(s.surface.points).reduce((a, b) => a + b, 0); }
