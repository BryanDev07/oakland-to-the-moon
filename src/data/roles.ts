/**
 * Kai's specialty (JOSEPH_SPEC tab 5). The game is single-player: a role is a specialty picked in
 * Oakland before the mission, following NASA's four mission segments (launch, space, ground, user).
 * Perks and weaknesses are game values (G).
 */
import { G, RoleId, Val } from './specParts';

/** Price groups that role discounts apply to. */
export type PriceCat = 'rocket' | 'spacecraft' | 'instruments' | 'radios' | 'other';

export interface RoleSpec {
  id: RoleId; name: string; short: string; segment: string;
  owns: string[]; // hangar tab ids that get the role's star
  ownsText: string; perk: string; weakness: string; tips: string;
  budgetMult: Val; priceMult: Partial<Record<PriceCat, Val>>; scienceMult: Val;
  freeFixHard: boolean; seesAllWarnings: boolean; seesExactDv: boolean;
}

export const ROLES: RoleSpec[] = [
  {
    id: 'commander', name: 'Mission Commander', short: 'COMMANDER', segment: 'Launch segment',
    owns: ['plan'], ownsText: 'Budget, launch architecture, lunar orbit',
    perk: '+5% budget; sees all warnings early', weakness: 'No discounts on parts', tips: 'Budget and schedule advice',
    budgetMult: G(1.05), priceMult: {}, scienceMult: G(1), freeFixHard: false, seesAllWarnings: true, seesExactDv: false,
  },
  {
    id: 'propulsion', name: 'Propulsion Engineer', short: 'PROPULSION', segment: 'Launch segment',
    owns: ['engines', 'boosters', 'material', 'propellant'], ownsText: 'Engines, boosters, stages, tank material, propellant',
    perk: '10% off rocket parts; sees exact Δv margins', weakness: 'Science instruments cost 10% more', tips: 'Rocket equation walkthrough',
    budgetMult: G(1), priceMult: { rocket: G(0.9), instruments: G(1.1) }, scienceMult: G(1), freeFixHard: false, seesAllWarnings: false, seesExactDv: true,
  },
  {
    id: 'spacecraft', name: 'Spacecraft Engineer', short: 'SPACECRAFT', segment: 'Space segment',
    owns: ['capsule', 'lander', 'docking', 'thrusters', 'power', 'life'], ownsText: 'Capsule, lander, docking, thrusters, tanks, power, life support',
    perk: '10% off spacecraft parts; one free emergency "fix" on Hard', weakness: 'Rocket parts cost 10% more', tips: 'Lander and power walkthroughs',
    budgetMult: G(1), priceMult: { spacecraft: G(0.9), rocket: G(1.1) }, scienceMult: G(1), freeFixHard: true, seesAllWarnings: false, seesExactDv: false,
  },
  {
    id: 'science', name: 'Science & Comms Lead', short: 'SCIENCE', segment: 'User + ground segments',
    owns: ['science', 'comms', 'nav'], ownsText: 'Instruments, radios, navigation',
    perk: '10% off instruments and radios; +20% science points', weakness: 'Spacecraft parts cost 10% more', tips: 'Data budget walkthrough',
    budgetMult: G(1), priceMult: { instruments: G(0.9), radios: G(0.9), spacecraft: G(1.1) }, scienceMult: G(1.2), freeFixHard: false, seesAllWarnings: false, seesExactDv: false,
  },
];
export const ROLE_BY_ID: Record<RoleId, RoleSpec> = Object.fromEntries(ROLES.map((r) => [r.id, r])) as Record<RoleId, RoleSpec>;

export const roleOf = (id: RoleId | null | undefined): RoleSpec | null => (id ? ROLE_BY_ID[id] ?? null : null);
export const priceMult = (id: RoleId | null | undefined, cat: PriceCat) => roleOf(id)?.priceMult[cat]?.v ?? 1;
export const budgetMult = (id: RoleId | null | undefined) => roleOf(id)?.budgetMult.v ?? 1;
export const scienceMult = (id: RoleId | null | undefined) => roleOf(id)?.scienceMult.v ?? 1;

/** Which price group an existing hangar slot belongs to. */
export function slotPriceCat(slot: string): PriceCat {
  if (slot === 'science') return 'instruments';
  if (slot === 'comms') return 'radios';
  if (slot === 'storage' || slot === 'guidance') return 'other';
  return 'spacecraft'; // lander, power, battery, life support, thermal, safety
}
