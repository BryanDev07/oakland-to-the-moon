/**
 * Persistent game state (LocalStorage). Every read is defensive: corrupted or outdated saves are
 * discarded rather than crashing the game.
 */
import { BASELINE_DESIGN, cloneDesign, Design } from '../data/mission';
import type { MissionState } from '../simulation/types';
import type { MissionReport } from '../simulation/scoring';

export interface Settings {
  musicVolume: number; // 0..1
  sfxVolume: number;
  muted: boolean;
  textSpeed: 'slow' | 'normal' | 'fast' | 'instant';
  screenShake: boolean;
  scanlines: boolean;
  skipSeenCinematics: boolean;
}
export interface HistoryEntry { date: string; outcome: string; score: number; grade: string; science: number; costM: number; site: string; lv: string; seed: number }

const KEY = { design: 'ottm.design.v1', mission: 'ottm.mission.v1', history: 'ottm.history.v1', settings: 'ottm.settings.v1', seen: 'ottm.seen.v1' };
const DEFAULT_SETTINGS: Settings = { musicVolume: 0.5, sfxVolume: 0.7, muted: false, textSpeed: 'normal', screenShake: true, scanlines: true, skipSeenCinematics: false };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* storage full or disabled: play on without saving */ }
}

function validDesign(d: unknown): d is Design {
  const x = d as Design;
  return !!x && typeof x === 'object' && !!x.slots && Array.isArray(x.science) && Array.isArray(x.safety) && !!x.plan && typeof x.plan.lv === 'string';
}

class Store {
  design: Design;
  mission: MissionState | null;
  history: HistoryEntry[];
  settings: Settings;
  seen: Record<string, boolean>;
  lastReport: MissionReport | null = null;
  previousReport: HistoryEntry | null = null;

  constructor() {
    const d = read<unknown>(KEY.design, null);
    this.design = validDesign(d) ? d : cloneDesign(BASELINE_DESIGN);
    const m = read<MissionState | null>(KEY.mission, null);
    this.mission = m && m.version === 2 && validDesign(m.design) ? m : null; // v1 missions predate the spec model
    this.history = read<HistoryEntry[]>(KEY.history, []).filter((h) => h && typeof h.score === 'number').slice(0, 20);
    this.settings = { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEY.settings, {}) };
    this.seen = read<Record<string, boolean>>(KEY.seen, {});
  }
  saveDesign() { write(KEY.design, this.design); }
  saveMission() { if (this.mission) write(KEY.mission, this.mission); else this.clearMission(); }
  clearMission() { this.mission = null; try { globalThis.localStorage?.removeItem(KEY.mission); } catch { /* ignore */ } }
  saveSettings() { write(KEY.settings, this.settings); }
  markSeen(k: string) { this.seen[k] = true; write(KEY.seen, this.seen); }
  addHistory(h: HistoryEntry) {
    this.previousReport = this.history[0] ?? null;
    this.history.unshift(h);
    this.history = this.history.slice(0, 20);
    write(KEY.history, this.history);
  }
  resetDesign() { this.design = cloneDesign(BASELINE_DESIGN); this.saveDesign(); }
}

export const store = new Store();
export type { Store };
