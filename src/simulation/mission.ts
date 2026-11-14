/**
 * Deterministic mission simulation. State is plain JSON (saveable). Coast phases advance with a
 * fixed timestep (SIM_DT); player actions (burns, landing, surface activities) are discrete calls.
 */
import { COMPONENT_BY_ID } from '../data/components';
import { cloneDesign, Design, LV_BY_ID, SITE_BY_ID, TEMPO_BY_ID } from '../data/mission';
import * as K from './constants';
import { EVENT_BY_ID, scheduleEvents } from './events';
import { buildCard, DECK_BY_ID, em, FD_BONUS, newEmergencyState, resolveCard, scheduleDeck, Stage } from './deck';
import { Rng } from './rng';
import { deltaV, propellantForDv } from './rocket';
import { analyzeDesign } from './spacecraft';
import { missionDv, orbitGeom, specOf } from './specModel';
import { shieldHealth, shieldResult } from './formulas';
import { fmt, fmtLb } from './units';
import type { DataSource, LogEntry, MissionState, Phase } from './types';

export type { MissionState, Phase } from './types';

const SOURCES: DataSource[] = ['map', 'neutron', 'pancam', 'seismo'];
const zeroData = (): Record<DataSource, number> => ({ map: 0, neutron: 0, pancam: 0, seismo: 0 });

// ------------------------------------------------------------------ creation
export function createMission(design: Design, seed: number): MissionState {
  const d = cloneDesign(design);
  const stats = analyzeDesign(d);
  const rng = new Rng(seed);
  const lander = stats.parts.find((p) => p.slot === 'lander');
  const ls = stats.parts.find((p) => p.slot === 'lifeSupport');
  const instruments: MissionState['instruments'] = {};
  for (const p of stats.parts) if (p.slot === 'science' && !p.onLander) instruments[p.id] = { on: false, failed: false, hours: 0 };
  const weather: boolean[] = [];
  for (let i = 0; i < 64; i++) weather.push(rng.chance(stats.comms.availability || 1));
  const s: MissionState = {
    version: 2, seed, rngState: 0, design: d, stats,
    t: 0, phase: 'TRANSIT_OUT', phaseStart: 0,
    propKg: stats.mass.smPropKg, ispFactor: 1,
    batteryWh: stats.power.batteryWh, batteryCapWh: stats.power.batteryWh,
    solarFactor: 1, fuelCellFactor: 1, reactantWh: stats.power.reactantWh, safeModeUntil: -1,
    landerAttached: !!lander,
    rcsFuelKg: stats.spec?.rcs.fuelKg ?? 0,
    landerDescentPropKg: lander?.descentPropKg ?? 0, landerAscentPropKg: lander?.ascentPropKg ?? 0, landerBatteryWh: stats.lander.batteryWh ?? lander?.landerBatteryWh ?? 0,
    crewOnCsm: stats.crew, condition: 100,
    o2Kg: stats.consumables.o2Kg, waterKg: stats.consumables.waterKg, foodKg: stats.consumables.foodKg,
    waterRecovery: ls?.waterRecovery ?? 0, o2Recovery: ls?.o2Recovery ?? 0, rationing: false, radiationDoseMSv: 0,
    powerMode: 'normal', commsMode: 'high', instruments, autoShed: true, commOutageUntil: -1, weather,
    storedMB: zeroData(), downMB: zeroData(), acquiredMB: zeroData(), lostMB: 0,
    schedule: [], pending: null, timed: [], eventsSeen: [], decisions: [], entryDispersion: 1,
    landing: { attempted: false, outcome: 'none', vImpact: 0, propLeftKg: 0, damaged: null },
    surface: { day: 1, evaUsedToday: 0, hoursOnSurface: 0, done: {}, samplesKg: 0, points: {}, broadcast: false },
    samplesAboardKg: 0,
    flags: { brownoutH: 0, thermalH: 0, minBatteryFrac: 1, minPropMarginKg: Infinity, tliTrimDv: 0, stranded: false, entryOk: null, entryHealth: null },
    crewLost: false, lossCause: null, log: [],
  };
  // Spec model: the 16-card A/B/C deck (deck.ts). Legacy events stay in events.ts for the old model.
  s.em = newEmergencyState(stats.spec?.rocket.spare ?? 0);
  s.schedule = K.SPEC_MODEL ? scheduleDeck(s, rng) : scheduleEvents(s, rng);
  // Launch vehicle performance: chance of an upper-stage shortfall scales with LV unreliability.
  // Reliability rolls are OFF in the spec model (RELIABILITY_ROLLS): risk comes only from emergencies.
  const lv = LV_BY_ID[d.plan.lv];
  if (K.RELIABILITY_ROLLS && rng.chance((1 - lv.reliability) * 12)) {
    s.flags.tliTrimDv = 45;
    const need = propellantForDv(totalMass(s), 45, isp(s));
    s.propKg = Math.max(0, s.propKg - need);
    log(s, `${lv.name} upper stage underperformed by 45 m/s. The service module burned ${fmtLb(need)} of propellant to complete trans-lunar injection.`, 'warn');
  }
  // Artemis-style: the lander flew on its own rocket and pays its own way into the halo orbit.
  const dv0 = missionDv(d);
  if (lander && dv0.landerArrival > 0) {
    const p = propellantForDv(stats.mass.landerWetKg, dv0.landerArrival, lander.ispS!);
    s.landerDescentPropKg = Math.max(0, s.landerDescentPropKg - p);
    log(s, `The lander launched separately and braked into the halo orbit on its own (${fmt(dv0.landerArrival)} m/s). It is waiting for you there.`, 'info');
  }
  s.rngState = rng.state;
  log(s, 'Trans-lunar injection complete. TOWN-1 is on its way to the Moon!', 'good');
  if (lander && K.SPEC_MODEL && specOf(d).architecture === 'apollo') dock(s, 'Transposition: the capsule turned around and docked with the lander');
  return s;
}

// ------------------------------------------------------------------ helpers
export function log(s: MissionState, text: string, kind: LogEntry['kind'] = 'info') {
  s.log.push({ t: s.t, text, kind });
  if (s.log.length > 200) s.log.shift();
}
const comp = (s: MissionState, slot: string) => s.stats.parts.find((p) => p.slot === slot);
export const isp = (s: MissionState) => (comp(s, 'propulsion')?.ispS ?? 300) * s.ispFactor;

function consumablesMass(s: MissionState) { return Math.max(0, s.o2Kg) + Math.max(0, s.waterKg) + Math.max(0, s.foodKg); }

/** Current crew-vehicle (CSM) mass: dry + propellant + consumables + crew aboard + samples. */
export function csmMass(s: MissionState): number {
  const st = s.stats;
  const dryNoCrew = st.mass.csmDryKg - st.crew * K.CREW_MASS_KG - st.consumables.totalKg;
  return dryNoCrew + s.propKg + consumablesMass(s) + s.crewOnCsm * K.CREW_MASS_KG + s.samplesAboardKg;
}
/** Artemis-style: the lander is not docked to the capsule until both are in lunar orbit. */
export function landerSeparate(s: MissionState) {
  return specOf(s.design).architecture === 'artemis' && K.SPEC_MODEL && (s.phase === 'TRANSIT_OUT' || s.phase === 'LOI_PENDING' || s.phase === 'FREE_RETURN');
}
const landerSeparateArch = (s: MissionState) => K.SPEC_MODEL && specOf(s.design).architecture === 'artemis';
export function landerMass(s: MissionState): number {
  const L = comp(s, 'lander');
  if (!L || !s.landerAttached || landerSeparate(s)) return 0;
  return L.descentDryKg! + s.landerDescentPropKg + L.ascentDryKg! + s.landerAscentPropKg + s.stats.lander.surfacePayloadKg;
}
export function totalMass(s: MissionState) { return csmMass(s) + landerMass(s); }

export function phaseTime(s: MissionState) { return s.t - s.phaseStart; }
function setPhase(s: MissionState, p: Phase) { s.phase = p; s.phaseStart = s.t; }

/** Remaining SM burns from the current phase, with propellant projections. */
export function projectBurns(s: MissionState): { name: string; dv: number; propKg: number }[] {
  const dv = missionDv(s.design);
  const I = isp(s);
  const out: { name: string; dv: number; propKg: number }[] = [];
  let m = 0;
  const burnP = (name: string, dv: number) => { const p = propellantForDv(m, dv, I); out.push({ name, dv, propKg: p }); m -= p; };
  const lc = s.stats.landingCrew * K.CREW_MASS_KG;
  const samples = s.stats.lander.sampleCapacityKg;
  const landing = s.landerAttached;
  switch (s.phase) {
    case 'TRANSIT_OUT': case 'LOI_PENDING':
      m = totalMass(s);
      burnP('Trajectory corrections', dv.tcmOut);
      burnP('Lunar orbit insertion', dv.loi);
      if (landing) m -= landerMass(s) + lc;
      burnP('Orbit ops', dv.ops);
      if (landing) m += lc + samples;
      burnP('Trans-Earth injection', dv.tei); burnP('Return corrections', dv.tcmBack); break;
    case 'LUNAR_ORBIT':
      m = csmMass(s) - (landing ? lc : 0);
      if (landing) burnP('Orbit ops', dv.ops);
      if (landing) m += lc + samples;
      burnP('Trans-Earth injection', dv.tei); burnP('Return corrections', dv.tcmBack); break;
    case 'DESCENT': case 'SURFACE':
      m = csmMass(s) + lc + samples;
      burnP('Trans-Earth injection', dv.tei); burnP('Return corrections', dv.tcmBack); break;
    case 'LUNAR_ORBIT_POST':
      m = csmMass(s);
      burnP('Trans-Earth injection', dv.tei); burnP('Return corrections', dv.tcmBack); break;
    default: break;
  }
  return out;
}
export function propMarginKg(s: MissionState) { return s.propKg - projectBurns(s).reduce((a, b) => a + b.propKg, 0); }

// ------------------------------------------------------------------ environment geometry
export function inLunarOrbit(s: MissionState) { return s.phase === 'LUNAR_ORBIT' || s.phase === 'LUNAR_ORBIT_POST' || s.phase === 'DESCENT' || s.phase === 'SURFACE'; }
export function orbitPhase(s: MissionState) { const g = orbitGeom(s.design); return ((s.t - s.phaseStart) % g.periodS) / g.periodS; }
export function isSunlit(s: MissionState) {
  if (!inLunarOrbit(s)) return true; // translunar coast: continuous sunlight (eclipses ignored)
  const g = orbitGeom(s.design);
  const ph = ((s.t) % g.periodS) / g.periodS;
  return Math.abs(ph - 0.5) > g.shadowFraction / 2;
}
export function earthVisible(s: MissionState) {
  if (!inLunarOrbit(s)) return true;
  const g = orbitGeom(s.design);
  const ph = ((s.t) % g.periodS) / g.periodS;
  return Math.abs(ph - g.losCenter) > g.losFraction / 2;
}
export function groundClear(s: MissionState) {
  const c = comp(s, 'comms');
  if (!c || (c.linkAvailability ?? 1) >= 1) return true;
  return s.weather[Math.floor(s.t / (6 * K.HOUR)) % s.weather.length];
}
/** Current downlink rate in Mbps (0 if no link). */
export function linkRateMbps(s: MissionState): number {
  const c = comp(s, 'comms');
  if (!c) return 0;
  if (!earthVisible(s)) return 0;
  let rate = c.downlinkMbps ?? 0;
  const outage = s.t < s.commOutageUntil;
  if (outage || !groundClear(s)) rate = c.id === 'com_laser' ? (c.backupMbps ?? 0) : outage ? 0 : rate;
  if (s.timed.some((e) => e.kind === 'linkHalf' && e.at <= s.t)) rate *= 0.5;
  if (s.commsMode === 'low') rate *= 0.1;
  return rate;
}

// ------------------------------------------------------------------ power model
export interface PowerSnapshot { genW: number; loadW: number; lines: { label: string; w: number }[]; heatW: number; rejectW: number; sunlit: boolean }
export function powerSnapshot(s: MissionState): PowerSnapshot {
  const st = s.stats;
  const conserve = s.powerMode === 'conserve' ? K.CONSERVE_FACTOR : 1;
  const lines: { label: string; w: number }[] = [
    { label: 'Avionics & cabin', w: K.BASE_LOAD_W * conserve },
    { label: 'Crew systems', w: K.CREW_LOAD_W * s.crewOnCsm * conserve },
    { label: 'Heaters', w: K.HEATER_LOAD_W },
  ];
  for (const p of st.parts) {
    if (!p.powerW || p.onLander || p.slot === 'science') continue;
    let w = p.powerW;
    if (p.slot === 'comms' && s.commsMode === 'low') w *= 0.4;
    if (p.slot === 'lifeSupport' && s.waterRecovery === 0 && p.id === 'ls_regen') w *= 0.3;
    lines.push({ label: p.short, w });
  }
  for (const [id, inst] of Object.entries(s.instruments)) if (inst.on && !inst.failed) lines.push({ label: COMPONENT_BY_ID[id].short, w: COMPONENT_BY_ID[id].powerW ?? 0 });
  const loadW = lines.reduce((a, l) => a + l.w, 0);
  const sunlit = isSunlit(s);
  let genW = 0;
  if (st.power.genKind === 'solar') genW = sunlit ? st.power.genW * s.solarFactor : 0;
  else if (st.power.genKind === 'fuelcell') genW = s.reactantWh > 0 ? st.power.genW * s.fuelCellFactor : 0;
  if (st.power.builtinSolarW && sunlit) genW += st.power.builtinSolarW * s.solarFactor;
  if (s.t < s.safeModeUntil) genW *= 0.3;
  return { genW, loadW, lines, heatW: loadW + s.crewOnCsm * K.METABOLIC_HEAT_W, rejectW: st.thermal.rejectW, sunlit };
}

// ------------------------------------------------------------------ stepping
export function isCoasting(s: MissionState) {
  return !s.pending && !s.crewLost && (s.phase === 'TRANSIT_OUT' || s.phase === 'LUNAR_ORBIT' || s.phase === 'LUNAR_ORBIT_POST' || s.phase === 'TRANSIT_BACK' || s.phase === 'FREE_RETURN');
}

/** Advance one fixed step. `allowEvents=false` is used while the CSM orbits during surface ops. */
export function step(s: MissionState, dt = K.SIM_DT, allowEvents = true) {
  if (s.crewLost) return;
  s.t += dt;
  const dtH = dt / K.HOUR, dtD = dt / K.DAY;
  // timed effects
  for (const e of s.timed.filter((e) => e.at <= s.t && e.kind !== 'linkHalf')) {
    if (e.kind === 'solarFactor') { s.solarFactor = e.value; log(s, `Solar array output restored to ${Math.round(e.value * 100)}%.`, 'good'); }
    else if (e.kind === 'fuelCellFactor') { s.fuelCellFactor = e.value; log(s, 'Fuel cell purge complete.', 'good'); }
    else if (e.kind === 'waterRecovery') { s.waterRecovery = e.value; log(s, 'Water processor repaired: recycling resumed.', 'good'); }
    else if (e.kind.startsWith('instrumentOn:')) { const id = e.kind.split(':')[1]; if (s.instruments[id] && !s.instruments[id].failed) { s.instruments[id].on = inLunarOrbit(s); } }
  }
  s.timed = s.timed.filter((e) => e.at > s.t || e.kind === 'linkHalf');

  // --- power & thermal
  let snap = powerSnapshot(s);
  if (snap.heatW > snap.rejectW) {
    const onInst = Object.entries(s.instruments).filter(([, v]) => v.on);
    if (onInst.length) { for (const [, v] of onInst) v.on = false; log(s, 'Radiators saturated: instruments switched off to limit cabin heat.', 'warn'); snap = powerSnapshot(s); }
    if (snap.heatW > snap.rejectW) { s.flags.thermalH += dtH; s.condition -= 1 * dtH; }
  }
  let gen = snap.genW;
  if (s.stats.power.genKind === 'fuelcell' && s.reactantWh > 0) {
    // fuel cells follow the load (plus battery recharge) up to their maximum output
    const want = snap.loadW + (s.batteryCapWh - s.batteryWh) / dtH;
    gen = Math.min(gen, want);
    s.reactantWh = Math.max(0, s.reactantWh - gen * dtH);
    s.waterKg += (gen * dtH / 1000) * 0.35; // product water
  }
  let next = s.batteryWh + (gen - snap.loadW) * dtH;
  if (next < 0 && s.autoShed) {
    const onInst = Object.entries(s.instruments).filter(([, v]) => v.on);
    if (onInst.length) { for (const [, v] of onInst) v.on = false; log(s, 'Battery depleted: instruments shed automatically.', 'warn'); }
    if (s.commsMode === 'high') { s.commsMode = 'low'; log(s, 'Battery depleted: comms switched to low-rate.', 'warn'); }
    if (s.powerMode === 'normal') { s.powerMode = 'conserve'; log(s, 'Battery depleted: conserve mode engaged.', 'warn'); }
    snap = powerSnapshot(s);
    next = s.batteryWh + (gen - snap.loadW) * dtH;
  }
  if (next < 0) { next = 0; s.flags.brownoutH += dtH; s.condition -= 3 * dtH; }
  s.batteryWh = Math.min(s.batteryCapWh, next);
  if (s.batteryCapWh > 0) s.flags.minBatteryFrac = Math.min(s.flags.minBatteryFrac, s.batteryWh / s.batteryCapWh);

  // --- life support (crew aboard the CSM)
  const n = s.crewOnCsm;
  s.o2Kg -= n * K.O2_KG_PER_CREW_DAY * (1 - s.o2Recovery) * dtD;
  s.waterKg -= n * K.WATER_KG_PER_CREW_DAY * (1 - s.waterRecovery) * (s.rationing ? 0.8 : 1) * dtD;
  s.foodKg -= n * K.FOOD_KG_PER_CREW_DAY * dtD;
  if (s.rationing) s.condition -= 0.1 * dtH;
  if (s.powerMode === 'conserve') s.condition -= 0.15 * dtH;
  if (s.waterKg <= 0) { s.waterKg = 0; s.condition -= 4 * dtH; }
  if (s.foodKg <= 0) { s.foodKg = 0; s.condition -= 1 * dtH; }
  if (s.o2Kg <= 0 && n > 0) { s.o2Kg = 0; loseCrew(s, 'Oxygen supply exhausted.'); return; }
  if (s.powerMode === 'normal' && !s.rationing && s.waterKg > 0 && s.batteryWh > 0) s.condition = Math.min(100, s.condition + 0.05 * dtH);
  if (s.condition <= 0) { loseCrew(s, 'Crew health failed after prolonged stress.'); return; }

  // --- science data
  const orbit = inLunarOrbit(s);
  const add = (src: DataSource, mb: number) => {
    s.acquiredMB[src] += mb;
    const total = SOURCES.reduce((a, k) => a + s.storedMB[k], 0);
    const room = Math.max(0, s.stats.comms.storageMB - total);
    const kept = Math.min(room, mb);
    s.storedMB[src] += kept;
    if (mb > kept) s.lostMB += mb - kept;
  };
  for (const [id, inst] of Object.entries(s.instruments)) {
    if (!inst.on || inst.failed || !orbit) continue;
    const c = COMPONENT_BY_ID[id];
    if (id === 'sci_mapcam' && !snap.sunlit) continue; // imaging needs daylight
    inst.hours += dtH;
    add(c.scienceTag as DataSource, (c.dataMbps ?? 0) * dt / 8);
  }
  // downlink
  const rate = linkRateMbps(s);
  let cap = rate * dt / 8;
  const stored = SOURCES.reduce((a, k) => a + s.storedMB[k], 0);
  if (cap > 0 && stored > 0) {
    const f = Math.min(1, cap / stored);
    for (const k of SOURCES) { const mv = s.storedMB[k] * f; s.storedMB[k] -= mv; s.downMB[k] += mv; }
    cap = 0;
  }

  // --- phase timing
  if (s.phase === 'TRANSIT_OUT' && phaseTime(s) >= K.TRANSIT_OUT_S) {
    setPhase(s, 'LOI_PENDING');
    log(s, 'Approaching the Moon. Lunar orbit insertion burn is ready.', 'info');
  } else if ((s.phase === 'TRANSIT_BACK' && phaseTime(s) >= K.TRANSIT_BACK_S) || (s.phase === 'FREE_RETURN' && phaseTime(s) >= K.FREE_RETURN_S)) {
    setPhase(s, 'ENTRY');
    log(s, 'Earth entry interface ahead. Service module separation.', 'info');
  }
  s.flags.minPropMarginKg = Math.min(s.flags.minPropMarginKg, propMarginKg(s));

  // --- events
  if (allowEvents && !s.pending) {
    const due = s.schedule.find((e) => e.phases.includes(s.phase) && phaseTime(s) >= e.at && !s.eventsSeen.includes(e.id));
    if (due) {
      s.eventsSeen.push(due.id);
      const card = DECK_BY_ID[due.id];
      if (card) { s.pending = buildCard(card, s, (due.stage ?? 'coast') as Stage); log(s, `ALERT: ${s.pending.title}`, 'event'); }
      else { const def = EVENT_BY_ID[due.id]; if (def.eligible(s)) { s.pending = def.build(s); log(s, `ALERT: ${s.pending.title}`, 'event'); } }
    }
  }
}

/** Run coast steps for a duration (used for bulk time advance). Stops early on events. */
export function advance(s: MissionState, seconds: number, allowEvents = true) {
  let left = seconds;
  while (left > 0 && !s.crewLost && (allowEvents ? !s.pending : true)) {
    const dt = Math.min(K.SIM_DT, left);
    step(s, dt, allowEvents);
    left -= dt;
    if (s.phase === 'LOI_PENDING' || s.phase === 'ENTRY') break;
  }
}

export function resolveEvent(s: MissionState, option: number, freeFix = false): string {
  if (!s.pending) return '';
  const ev = s.pending;
  const rng = new Rng(s.rngState ^ Math.floor(s.t));
  const label = ev.options[option]?.label ?? '';
  const card = DECK_BY_ID[ev.id];
  const fd = card ? ev.fdPick === option : false;
  let msg = card ? resolveCard(card, s, option, rng, freeFix) : EVENT_BY_ID[ev.id].resolve(s, option, rng);
  // Flight Director bonus (Hard only): the pick matched the safest sound call for the player's numbers
  if (fd && specOf(s.design).difficulty === 'hard') { em(s).fdBonus += FD_BONUS; msg += ` * Flight Director bonus +${FD_BONUS}.`; }
  s.rngState = rng.state;
  s.decisions.push({ event: ev.title, choice: label, t: s.t, fd, good: ev.options[option]?.good, bad: ev.options[option]?.bad, result: msg });
  log(s, `${ev.title}: ${label}. ${msg}`, 'decision');
  s.pending = null;
  if (s.condition <= 0) loseCrew(s, 'Crew health failed after the emergency.');
  return msg;
}

/** Fire the next scheduled card for a scene-driven stage (pad, launch, Earth orbit, landing, surface). */
export function triggerStage(s: MissionState, stage: Stage): boolean {
  if (s.pending || s.crewLost) return false;
  const due = s.schedule.find((e) => e.stage === stage && !s.eventsSeen.includes(e.id));
  if (!due) return false;
  s.eventsSeen.push(due.id);
  s.pending = buildCard(DECK_BY_ID[due.id], s, stage);
  log(s, `ALERT: ${s.pending.title}`, 'event');
  return true;
}

/** End the mission with the crew safe (launch abort, Earth-orbit mission, Easy-mode failure). */
export function abortMission(s: MissionState, reason: string) {
  em(s).abortReason = reason;
  s.crewOnCsm = s.stats.crew;
  s.flags.entryOk = true;
  log(s, `ABORT: ${reason}`, 'warn');
  setPhase(s, 'COMPLETE');
}

/** Apollo 13-style lifeboat: the lander's batteries join in and the crew loops the Moon home. */
export function lifeboatReturn(s: MissionState) {
  if (s.landerAttached) { s.batteryCapWh += s.landerBatteryWh; s.batteryWh += s.landerBatteryWh; }
  setPhase(s, 'FREE_RETURN');
  log(s, 'Lifeboat: the crew moved into the lander and is looping the Moon toward home.', 'warn');
}

/** Head home from wherever the ship is. `savedDays` shortens a free-return coast. */
export function turnBack(s: MissionState, savedDays: number) {
  if (s.phase === 'TRANSIT_OUT' || s.phase === 'LOI_PENDING') { setPhase(s, 'FREE_RETURN'); s.phaseStart -= savedDays * K.DAY; log(s, 'Turning back: free-return trajectory home.', 'warn'); }
  else if (s.phase === 'LUNAR_ORBIT' || s.phase === 'LUNAR_ORBIT_POST') { s.landerAttached = false; s.crewOnCsm = s.stats.crew; executeTEI(s); }
}

/** A tired or less-trained crew may fumble the next big burn (deck risk, G: 50 m/s). */
function burnMistake(s: MissionState) {
  const e = s.em;
  if (!e || e.burnRisk <= 0) return;
  const rng = new Rng(s.rngState ^ 0xb3a7);
  const hit = rng.chance(Math.min(1, e.burnRisk));
  s.rngState = rng.state; e.burnRisk = 0;
  if (hit) { const p = Math.min(s.propKg, propellantForDv(totalMass(s), 50, isp(s))); s.propKg -= p; log(s, `A crew mistake during the burn cost 50 m/s (${fmt(p / 0.45359237)} lb of propellant).`, 'warn'); }
}

export function loseCrew(s: MissionState, cause: string) {
  s.crewLost = true;
  s.lossCause = cause;
  log(s, `MISSION LOST: ${cause}`, 'bad');
  setPhase(s, 'COMPLETE');
}

// ------------------------------------------------------------------ player actions
export function setInstrument(s: MissionState, id: string, on: boolean) {
  const inst = s.instruments[id];
  if (!inst || inst.failed) return false;
  inst.on = on && inLunarOrbit(s);
  return inst.on === on;
}

/** Execute an SM maneuver. Returns ok=false if propellant is insufficient. */
export function burn(s: MissionState, name: string, dv: number, massKg = totalMass(s)): { ok: boolean; propKg: number; shortKg: number } {
  if (dv <= 0) return { ok: true, propKg: 0, shortKg: 0 }; // spec model folds corrections into the main burns
  const need = propellantForDv(massKg, dv, isp(s));
  if (need > s.propKg) return { ok: false, propKg: need, shortKg: need - s.propKg };
  s.propKg -= need;
  log(s, `${name}: Δv ${Math.round(dv)} m/s, ${fmtLb(need)} propellant used.`, 'good');
  return { ok: true, propKg: need, shortKg: 0 };
}

/** A docking or rendezvous burns a fixed amount of thruster fuel (spec model, G). */
export function dock(s: MissionState, label: string, kg = s.stats.spec?.rcs.perDockingKg ?? 0) {
  if (!K.SPEC_MODEL || kg <= 0) return true;
  const ok = s.rcsFuelKg >= kg;
  s.rcsFuelKg = Math.max(0, s.rcsFuelKg - kg);
  log(s, ok ? `${label}: ${fmt(kg / 0.45359237)} lb of thruster fuel used.` : `${label}: thruster fuel ran out during docking!`, ok ? 'info' : 'warn');
  return ok;
}

export function executeLOI(s: MissionState) {
  if (s.phase !== 'LOI_PENDING') return { ok: false, propKg: 0, shortKg: 0 };
  const site = SITE_BY_ID[s.design.plan.site];
  const dv = missionDv(s.design);
  // outbound corrections are folded in at arrival
  const tcm = burn(s, 'Trajectory corrections', dv.tcmOut);
  if (!tcm.ok) return tcm;
  burnMistake(s);
  const r = burn(s, 'Lunar orbit insertion', dv.loi);
  const halo = K.SPEC_MODEL && specOf(s.design).orbit === 'NRHO';
  if (r.ok && halo && specOf(s.design).architecture === 'artemis' && s.landerAttached) dock(s, 'Docked with the waiting lander');
  if (r.ok) { setPhase(s, 'LUNAR_ORBIT'); log(s, halo ? 'Welcome to the halo orbit! Earth stays in view the whole time.' + (specOf(s.design).architecture === 'artemis' && s.landerAttached ? ' Docked with the waiting lander.' : '') : `Welcome to lunar orbit! ${site.name} passes below every 2 hours.`, 'good'); }
  return r;
}

/** Can the spacecraft still get home after LOI? Used to recommend a free-return abort. */
export function canAffordLOIAndReturn(s: MissionState) { return propMarginKg(s) >= 0; }

export function chooseFreeReturn(s: MissionState) {
  if (s.phase !== 'LOI_PENDING') return false;
  burn(s, 'Free-return correction', missionDv(s.design).tcmBack);
  // Lander kept attached as a "lifeboat": its battery supplements the CSM (Apollo-style only)
  if (s.landerAttached && !landerSeparateArch(s)) { s.batteryCapWh += s.landerBatteryWh; s.batteryWh += s.landerBatteryWh; log(s, 'Lander powered up as a lifeboat: its batteries join the power budget.', 'info'); }
  setPhase(s, 'FREE_RETURN');
  log(s, 'Free-return abort: swinging around the Moon and heading home without landing.', 'warn');
  return true;
}

export function beginDescent(s: MissionState) {
  if (s.phase !== 'LUNAR_ORBIT' || !s.landerAttached) return false;
  s.crewOnCsm = s.stats.orbitCrew;
  burn(s, 'CSM orbit trim', missionDv(s.design).ops, csmMass(s));
  for (const v of Object.values(s.instruments)) v.on = v.on && !v.failed;
  setPhase(s, 'DESCENT');
  log(s, `Lander undocked with ${s.stats.landingCrew} crew. Powered descent initiation!`, 'info');
  return true;
}

/** Lander mass at the start of the final approach (after automatic braking phase). */
export function approachState(s: MissionState) {
  const L = comp(s, 'lander')!;
  const site = SITE_BY_ID[s.design.plan.site];
  const m0 = landerMass(s) + s.stats.landingCrew * K.CREW_MASS_KG;
  const brakeProp = propellantForDv(m0, missionDv(s.design).descent - K.DV_FINAL_APPROACH, L.ispS!);
  return { massKg: m0 - brakeProp, propKg: Math.max(0, s.landerDescentPropKg - brakeProp), thrustN: L.thrustN!, ispS: L.ispS!, hazard: site.hazardDensity, trn: !!s.stats.parts.find((p) => p.id === 'gnc_trn') };
}

export function applyLanding(s: MissionState, outcome: 'soft' | 'hard' | 'abort' | 'crash', vImpact: number, propLeftKg: number) {
  s.landing = { attempted: true, outcome, vImpact, propLeftKg, damaged: null };
  s.landerDescentPropKg = propLeftKg;
  const tempo = TEMPO_BY_ID[s.design.plan.tempo];
  void tempo;
  if (outcome === 'crash') { loseCrew(s, `Lander impacted the surface at ${vImpact.toFixed(1)} m/s.`); return; }
  if (outcome === 'abort') {
    // ascent stage fires from low altitude back to orbit and rendezvous
    s.landerAttached = false;
    s.crewOnCsm = s.stats.crew;
    setPhase(s, 'LUNAR_ORBIT_POST');
    log(s, 'ABORT STAGE! The ascent stage climbed back to orbit and docked. The crew is safe, but there will be no surface operations.', 'warn');
    return;
  }
  if (outcome === 'hard') {
    s.condition -= 20;
    const surf = s.stats.parts.filter((p) => p.onLander && p.slot === 'science');
    if (surf.length) { const rng = new Rng(s.rngState ^ 0x51); const dmg = surf[rng.int(0, surf.length - 1)]; s.rngState = rng.state; s.landing.damaged = dmg.id; log(s, `Hard landing (${vImpact.toFixed(1)} m/s)! The ${dmg.name} was damaged.`, 'bad'); }
    else log(s, `Hard landing (${vImpact.toFixed(1)} m/s)! Crew shaken but OK.`, 'bad');
  } else log(s, `Touchdown at ${vImpact.toFixed(1)} m/s. The crew is on the Moon!`, 'good');
  setPhase(s, 'SURFACE');
  s.surface = { day: 1, evaUsedToday: 0, hoursOnSurface: 0, done: {}, samplesKg: 0, points: {}, broadcast: false };
}

/** Ascent from the surface. Fails if crew + samples are too heavy for the ascent stage. */
export function ascentCheck(s: MissionState, samplesKg = s.surface.samplesKg) {
  const L = comp(s, 'lander')!;
  const m0 = L.ascentDryKg! + s.landerAscentPropKg + s.stats.landingCrew * K.CREW_MASS_KG + samplesKg;
  const dv = deltaV(L.ispS!, m0, m0 - s.landerAscentPropKg);
  // max sample mass that still allows ascent
  const ve = L.ispS! * K.G0;
  const up = missionDv(s.design).ascent;
  const r = Math.exp(up / ve);
  const maxM0 = s.landerAscentPropKg * r / (r - 1);
  const maxSamples = Math.max(0, maxM0 - (L.ascentDryKg! + s.landerAscentPropKg + s.stats.landingCrew * K.CREW_MASS_KG));
  return { dv, req: up, ok: dv >= up, maxSamplesKg: maxSamples };
}

export function liftoff(s: MissionState): { ok: boolean; message: string } {
  if (s.phase !== 'SURFACE') return { ok: false, message: 'Not on the surface.' };
  const a = ascentCheck(s);
  if (!a.ok) return { ok: false, message: `Too heavy! The ascent stage can lift at most ${fmtLb(a.maxSamplesKg)} of samples.` };
  s.landerAttached = false;
  s.samplesAboardKg = s.surface.samplesKg;
  s.crewOnCsm = s.stats.crew;
  setPhase(s, 'LUNAR_ORBIT_POST');
  log(s, `Liftoff! Ascent stage reached orbit and docked with ${fmtLb(s.samplesAboardKg)} of samples.`, 'good');
  dock(s, 'Rendezvous and docking with the capsule');
  return { ok: true, message: 'Ascent successful.' };
}

export function jettisonSamples(s: MissionState, kg: number) { s.surface.samplesKg = Math.max(0, s.surface.samplesKg - kg); }

export function executeTEI(s: MissionState) {
  if (s.phase !== 'LUNAR_ORBIT_POST' && s.phase !== 'LUNAR_ORBIT') return { ok: false, propKg: 0, shortKg: 0 };
  const aborting = s.phase === 'LUNAR_ORBIT';
  if (aborting && s.landerAttached) { s.landerAttached = false; log(s, 'Lander jettisoned unused to save propellant.', 'warn'); }
  const dv = missionDv(s.design);
  burnMistake(s);
  const r = burn(s, 'Trans-Earth injection', dv.tei);
  if (!r.ok) {
    s.flags.stranded = true;
    loseCrew(s, `Not enough propellant for trans-Earth injection (short ${fmtLb(r.shortKg)}). The crew could not return.`);
    return r;
  }
  burn(s, 'Return corrections', dv.tcmBack);
  for (const v of Object.values(s.instruments)) v.on = false;
  setPhase(s, 'TRANSIT_BACK');
  log(s, 'Trans-Earth injection complete: heading home to the Pacific!', 'good');
  return r;
}

/** Entry: heat-shield effective margin vs heat-load dispersion (from earlier anomalies). */
export function performEntry(s: MissionState) {
  if (s.phase !== 'ENTRY') return { ok: false, margin: 0, load: 0 };
  if (K.SPEC_MODEL && s.stats.spec) {
    // health = rating / 24,400 mph (max 100%) − damage; earlier anomalies count as damage (G)
    const mph = s.stats.spec.capsule.shieldMph;
    const health = shieldHealth(mph, Math.max(0, s.entryDispersion - 1) + (s.em?.shieldDamage ?? 0)); // + emergency damage (card 14)
    const res = shieldResult(health);
    s.flags.entryHealth = health;
    s.flags.entryOk = res !== 'burnthrough';
    if (res === 'burnthrough') { loseCrew(s, `Heat shield burn-through: health ${Math.round(health * 100)}% at re-entry (rated ${fmt(mph)} mph; the Moon return needs 24,400 mph).`); return { ok: false, margin: health, load: 0.9 }; }
    if (res === 'rough') log(s, `Rough ride: heat shield at ${Math.round(health * 100)}%. The crew is shaken but safe (-10 crew safety).`, 'warn');
    setPhase(s, 'COMPLETE');
    log(s, 'Splashdown in the Pacific! Recovery ship on station. Welcome home!', 'good');
    return { ok: true, margin: health, load: 0.9 };
  }
  const margin = s.stats.heatShield.rating * (8000 / (s.stats.heatShield.entryMassKg - s.stats.lander.sampleCapacityKg + s.samplesAboardKg));
  const load = s.entryDispersion;
  const ok = margin >= load;
  s.flags.entryOk = ok;
  if (!ok) { loseCrew(s, 'Heat shield overwhelmed during an off-nominal entry.'); return { ok, margin, load }; }
  setPhase(s, 'COMPLETE');
  log(s, 'Splashdown in the Pacific! Recovery ship on station. Welcome home!', 'good');
  return { ok, margin, load };
}

export function securedMB(s: MissionState, src: DataSource) {
  // data on the recorder returns with the crew if they get home
  return s.downMB[src] + (s.crewLost ? 0 : s.storedMB[src]);
}
export { SOURCES };
