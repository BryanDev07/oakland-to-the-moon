/** Test/QA helpers: fast-forward a mission to a phase using the real simulation (no shortcuts in physics). */
import { cloneDesign, REFERENCE_DESIGN } from '../data/mission';
import * as Sim from '../simulation/mission';
import { HOUR } from '../simulation/constants';
import { store } from './store';

export function useReferenceDesign() {
  store.design = cloneDesign(REFERENCE_DESIGN);
  store.saveDesign();
}

export function newMission(seed = 4242) {
  store.mission = Sim.createMission(store.design, seed);
  store.saveMission();
  return store.mission;
}

function coast(target: string[]) {
  const s = store.mission!;
  let guard = 0;
  while (!target.includes(s.phase) && !s.crewLost && guard++ < 5000) {
    if (s.pending) { Sim.resolveEvent(s, 0); continue; }
    if (!Sim.isCoasting(s)) break;
    Sim.step(s);
  }
}

/** Advance to 'LOI_PENDING' | 'LUNAR_ORBIT' | 'DESCENT' | 'SURFACE' | 'LUNAR_ORBIT_POST' | 'TRANSIT_BACK' | 'ENTRY' | 'COMPLETE'. */
export function advanceTo(phase: string) {
  const s = store.mission ?? newMission();
  const order = ['TRANSIT_OUT', 'LOI_PENDING', 'LUNAR_ORBIT', 'DESCENT', 'SURFACE', 'LUNAR_ORBIT_POST', 'TRANSIT_BACK', 'ENTRY', 'COMPLETE'];
  const want = order.indexOf(phase);
  const at = () => order.indexOf(s.phase);
  if (at() < 1 && want >= 1) coast(['LOI_PENDING']);
  if (at() < 2 && want >= 2) { Sim.executeLOI(s); for (const id of Object.keys(s.instruments)) Sim.setInstrument(s, id, true); }
  if (s.phase === 'LUNAR_ORBIT' && want >= 3) { Sim.advance(s, 10 * HOUR); if (s.pending) Sim.resolveEvent(s, 0); Sim.beginDescent(s); }
  if (s.phase === 'DESCENT' && want >= 4) Sim.applyLanding(s, 'soft', 1.2, 300);
  if (s.phase === 'SURFACE' && want >= 5) { s.surface.samplesKg = Math.min(20, s.stats.lander.sampleCapacityKg); Sim.liftoff(s); }
  if (s.phase === 'LUNAR_ORBIT_POST' && want >= 6) { if (s.pending) Sim.resolveEvent(s, 0); Sim.executeTEI(s); }
  if (s.phase === 'TRANSIT_BACK' && want >= 7) coast(['ENTRY']);
  if (s.phase === 'ENTRY' && want >= 8) Sim.performEntry(s);
  store.saveMission();
  return s.phase;
}
