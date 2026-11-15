/**
 * E1-E2 (JOSEPH_SPEC_V2): the two missions. Everything that differs between "Moon Landing" and
 * "ISS Rescue: Dock & Spacewalk" lives here; the hangar, desk, emergencies and report are shared.
 * R = real (sourced), G = game value.
 */
import type { Design } from './mission';
import { G, R, Val } from './specParts';

export type MissionId = 'moon' | 'iss';
export interface MissionConfig {
  id: MissionId; name: string; short: string; blurb: string;
  /** Speed the rocket must reach, m/s (the desk target). */
  dvTarget: number;
  /** Re-entry speed the heat shield must be rated for, mph. */
  reentryMph: Val;
  /** Easy / Hard budgets, USD. */
  budgetsUsd: { easy: Val; hard: Val };
  /** Miles a radio message travels one way (for the signal delay). */
  signalMiles: Val; signalWhy: string;
}

export const MISSIONS: Record<MissionId, MissionConfig> = {
  moon: {
    id: 'moon', name: 'Moon Landing', short: 'MOON',
    blurb: 'Land two astronauts on the Moon, bring home 50 science points, and keep the crew safe.',
    dvTarget: 12_600, reentryMph: R(24_400, 'Orion on Artemis I'),
    budgetsUsd: { easy: G(5_000_000_000), hard: G(4_200_000_000) },
    signalMiles: R(238_855, 'Earth-Moon average'), signalWhy: 'The Moon is about 238,855 miles away.',
  },
  iss: {
    id: 'iss', name: 'ISS Rescue: Dock & Spacewalk', short: 'ISS',
    blurb: 'Dock with the International Space Station, go on a spacewalk and fix a broken solar panel.',
    dvTarget: 9_400, reentryMph: R(17_500, 'return from low Earth orbit'),
    budgetsUsd: { easy: G(1_200_000_000), hard: G(700_000_000) },
    signalMiles: G(47_000, 'up to a relay satellite 22,236 mi high and back down'), signalWhy: 'Messages go up to a relay satellite and back down: about 47,000 miles.',
  },
};

/** ISS facts (spec V2 E2). */
export const ISS = {
  altitudeMi: R(250, 'about 400-420 km'),
  speedMph: R(17_500, 'about 7,660 m/s'),
  orbitMin: R(90, 'one orbit takes about 90 minutes'),
  phasingDays: G(1, 'catch-up orbits before docking'),
  dockedDays: G(2, 'docked, including the spacewalk'),
  returnDays: G(0.5, 'undock to splashdown'),
  deorbitDv: G(90, 'm/s: the capsule\'s burn to come home from low orbit'),
  phasingDv: G(60, 'm/s of thruster burns to catch up'),
  contactMaxMs: G(0.1, 'docking contact speed limit, m/s'),
  suitO2Hours: G(8, 'close to real spacesuit limits'),
  evaReserveMin: G(30, 'minutes of suit oxygen that must be left'),
};
export const missionOf = (d: Design): MissionId => (d.spec as { mission?: MissionId } | undefined)?.mission ?? 'moon';
export const missionCfg = (d: Design): MissionConfig => MISSIONS[missionOf(d)];
export const isIss = (d: Design) => missionOf(d) === 'iss';
