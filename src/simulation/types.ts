import type { Design } from '../data/mission';
import type { DesignStats } from './spacecraft';
import type { EmergencyState } from './deck';

export type Phase =
  | 'TRANSIT_OUT' | 'LOI_PENDING' | 'LUNAR_ORBIT' | 'DESCENT' | 'SURFACE' | 'LUNAR_ORBIT_POST'
  | 'TRANSIT_BACK' | 'FREE_RETURN' | 'ENTRY' | 'COMPLETE';

export type DataSource = 'map' | 'neutron' | 'pancam' | 'seismo';

export interface LogEntry { t: number; text: string; kind: 'info' | 'good' | 'warn' | 'bad' | 'event' | 'decision' }

export interface TimedEffect { at: number; kind: string; value: number }

export interface PendingEvent {
  id: string;
  title: string;
  text: string;
  learn: string;
  options: { label: string; detail: string; good?: string; bad?: string }[];
  // emergency deck (JOSEPH_SPEC tab 7)
  stage?: string; real?: string; scenario?: boolean; hint?: string; fdPick?: number;
}

export interface MissionState {
  version: 2; // v2: JOSEPH_SPEC model (v1 saves are discarded)
  seed: number;
  rngState: number;
  design: Design;
  stats: DesignStats;
  t: number; // s since trans-lunar injection
  phase: Phase;
  phaseStart: number;
  // service module / crew vehicle
  propKg: number;
  ispFactor: number;
  batteryWh: number;
  batteryCapWh: number;
  solarFactor: number;
  fuelCellFactor: number;
  reactantWh: number;
  safeModeUntil: number;
  // lander
  landerAttached: boolean;
  landerDescentPropKg: number;
  landerAscentPropKg: number;
  landerBatteryWh: number;
  rcsFuelKg: number; // thruster (RCS) fuel left; dockings use it (spec model)
  // crew
  crewOnCsm: number;
  condition: number; // 0..100
  o2Kg: number; waterKg: number; foodKg: number;
  waterRecovery: number; o2Recovery: number;
  rationing: boolean;
  radiationDoseMSv: number;
  // ops modes
  powerMode: 'normal' | 'conserve';
  commsMode: 'high' | 'low';
  instruments: Record<string, { on: boolean; failed: boolean; hours: number }>;
  autoShed: boolean;
  commOutageUntil: number;
  weather: boolean[]; // 6-hour blocks: ground-station clear sky (optical link)
  // data
  storedMB: Record<DataSource, number>;
  downMB: Record<DataSource, number>;
  acquiredMB: Record<DataSource, number>;
  lostMB: number;
  // events
  schedule: { id: string; at: number; phases: Phase[]; stage?: string }[];
  pending: PendingEvent | null;
  timed: TimedEffect[];
  eventsSeen: string[];
  decisions: { event: string; choice: string; t: number; fd?: boolean; good?: string; bad?: string; result?: string }[];
  em?: EmergencyState; // emergency-deck bookkeeping (spec model)
  entryDispersion: number; // multiplies entry heat load
  // landing & surface
  landing: { attempted: boolean; outcome: 'none' | 'soft' | 'hard' | 'abort' | 'crash'; vImpact: number; propLeftKg: number; damaged: string | null };
  surface: { day: number; evaUsedToday: number; hoursOnSurface: number; done: Record<string, number>; samplesKg: number; points: Record<string, number>; broadcast: boolean };
  samplesAboardKg: number;
  // bookkeeping
  flags: { brownoutH: number; thermalH: number; minBatteryFrac: number; minPropMarginKg: number; tliTrimDv: number; stranded: boolean; entryOk: boolean | null; entryHealth?: number | null };
  crewLost: boolean;
  lossCause: string | null;
  log: LogEntry[];
}
