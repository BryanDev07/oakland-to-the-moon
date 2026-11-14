import { advance, applyLanding, approachState, beginDescent, executeLOI, executeTEI, isCoasting, liftoff, performEntry, resolveEvent, setInstrument, step } from '../../src/simulation/mission';
import { autopilot, createLanding, makeTerrain, stepLanding } from '../../src/simulation/landing';
import { availableActivities, doActivity, restUntilNextDay } from '../../src/simulation/surface';
import { HOUR } from '../../src/simulation/constants';
import type { MissionState } from '../../src/simulation/types';

/** Coast until the phase changes or a decision is needed; auto-resolve events with option 0. */
export function coast(s: MissionState, maxH = 200) {
  const start = s.phase;
  let n = 0;
  while (s.phase === start && !s.crewLost && n++ < maxH * 12) {
    if (s.pending) { resolveEvent(s, 0); continue; }
    if (!isCoasting(s)) break;
    step(s);
  }
}

/** Fly a full mission headlessly with simple player policies. */
export function flyMission(s: MissionState, opts: { orbitH?: number; land?: boolean } = {}) {
  coast(s);
  if (s.crewLost) return s;
  const loi = executeLOI(s);
  if (!loi.ok) return s;
  for (const id of Object.keys(s.instruments)) setInstrument(s, id, true);
  const orbitEnd = s.t + (opts.orbitH ?? 14) * HOUR;
  while (s.t < orbitEnd && !s.crewLost) { if (s.pending) resolveEvent(s, 0); else step(s); }
  if (s.crewLost) return s;
  if (opts.land !== false && beginDescent(s)) {
    const ap = approachState(s);
    const terrain = makeTerrain(s.seed, ap.hazard);
    const L = createLanding(terrain, ap);
    let guard = 0;
    while (!L.done && guard++ < 30 * 400) stepLanding(L, terrain, autopilot(L, terrain));
    applyLanding(s, L.outcome as 'soft', L.vImpact, L.propKg);
    if (s.phase === 'SURFACE') {
      for (let day = 0; day < 5; day++) {
        let did = true;
        while (did) {
          did = false;
          for (const a of availableActivities(s)) if (a.ok) { doActivity(s, a.a.id); did = true; break; }
        }
        if (!restUntilNextDay(s).ok) break;
      }
      const lo = liftoff(s);
      if (!lo.ok) { s.surface.samplesKg = 0; liftoff(s); }
    }
  }
  if (s.crewLost) return s;
  if (s.phase === 'LUNAR_ORBIT_POST' || s.phase === 'LUNAR_ORBIT') {
    advance(s, 2 * HOUR);
    if (s.pending) resolveEvent(s, 0);
    executeTEI(s);
  }
  coast(s);
  if (s.phase === 'ENTRY') performEntry(s);
  return s;
}
