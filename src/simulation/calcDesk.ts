/**
 * The Calculation Desk (JOSEPH_SPEC tab 6): formula sheets with the player's own numbers filled in,
 * blanks to solve step by step, a target, and a Final Results board. Pure: no Phaser.
 * Minimum set for the hackathon build: sheets 1, 2, 4, 5, 6 and 10 (+ the board).
 * Given numbers are shown in the spec's units (lb, N, m/s). Answers are accepted within ±1% (±0.01
 * for TWR and ln values).
 */
import { cloneDesign, type Design } from '../data/mission';
import {
  BATTERY_MARGIN, BOOSTER_BY_ID, ENGINE_BY_ID, LB_TO_N, LIFE_SUPPORT_LB, LIGHT_MILES_PER_S, MATERIALS, MIN_LIFTOFF_TWR, MISSION_DV, MOON_G_RATIO,
  POWER_PARTS, PROPELLANTS, RocketBuild, SHIELD_REQUIRED_MPH, SIGNAL_DISTANCES,
} from '../data/specParts';
import { CREW_MASS_KG } from './constants';
import { fuelNeeded, mbPerDay, signalDelayS } from './formulas';
import { analyzeDesign, type DesignStats } from './spacecraft';
import { rocketOf, specOf } from './specModel';
import { fmt, fmtUsd, fmtUsdM, kgToLb } from './units';

export interface Step { label: string; expect: number; unit: string; abs?: number; why: string }
export interface Sheet {
  id: string; n: number; title: string; question: string; think: string; formula: string;
  given: string[]; steps: Step[]; target: string; example?: string;
  /** After all steps: is the answer good for the mission, and (Easy) which part to change. */
  verdict: () => { pass: boolean; text: string; pointer?: string };
  /** Game-solved sheet: the steps are worked out and shown ("watch it work"). */
  game?: boolean;
  /** Extra lines after the steps: tables, receipts, the "what if" number. */
  extra?: string[];
  /** Buttons on the desk, e.g. sheet 7's "Use this" fuel. */
  actions?: { label: string; apply: (d: Design) => Design }[];
}

// ------------------------------------------------------------------ sheet math in the spec's units (lb, N, m/s)
/** #3: dead-weight share of an empty stage at ignition and at burnout (as fractions). */
export function deadWeightShares(emptyLb: number, fuelLb: number, aboveLb: number) {
  const atIgnition = emptyLb + fuelLb + aboveLb;
  return { ignition: emptyLb / atIgnition, burnout: emptyLb / (atIgnition - fuelLb) };
}
/** #3: stage 2's Δv if stage 1's empty shell stayed attached. */
export function keptShellDv(ve2: number, s2FullWithPayloadLb: number, s2EmptyWithPayloadLb: number, s1EmptyLb: number) {
  return ve2 * Math.log((s2FullWithPayloadLb + s1EmptyLb) / (s2EmptyWithPayloadLb + s1EmptyLb));
}
/** #8: capsule burns at the Moon. `homeWeightLb` is the mass for the trip home (default: what is left after getting in). */
export function capsuleBurnMath(weightLb: number, fuelLb: number, ve: number, dvIn: number, dvOut: number, homeWeightLb?: number) {
  const used = dvIn > 0 ? weightLb * (1 - Math.exp(-dvIn / ve)) : 0;
  const left = fuelLb - used;
  const home = homeWeightLb ?? weightLb - used;
  const dvLeft = left > 0 ? ve * Math.log(home / (home - left)) : 0;
  return { used, left, home, dvLeft, need: dvOut, pass: left >= 0 && dvLeft >= dvOut };
}
/** #9: one lander burn plus whether its engine beats Moon gravity: TWR = N ÷ (lb × 4.448 × 0.165). */
export function landerBurnMath(fullLb: number, emptyLb: number, ve: number, need: number, thrustN: number) {
  const dv = ve * Math.log(fullLb / emptyLb);
  const twrMoon = thrustN / (fullLb * LB_TO_N * MOON_G_RATIO.v);
  return { dv, need, pass: dv >= need, twrMoon, lifts: twrMoon >= 1 };
}
/** #11: power made vs used, eclipse battery, and lander surface battery in 5 kWh packs. */
export function powerMath(panelW: number, sun: number, usedW: number, darkH: number, batteryWh: number, surfaceW: number, stayH: number) {
  const made = panelW * sun;
  const eclipseWh = usedW * darkH * BATTERY_MARGIN.v;
  const surfaceWh = surfaceW * stayH * BATTERY_MARGIN.v;
  return { made, pass: made >= usedW, eclipseWh, batteryOk: batteryWh >= eclipseWh, surfaceWh, packs: Math.ceil(surfaceWh / POWER_PARTS.liionPack.storesWh.v) };
}
/** #12: MB per day = kbps × 86,400 × contact ÷ 8,000. */
export function dataMath(kbps: number, contact: number, needMb: number) {
  const mb = mbPerDay(kbps, contact);
  return { mb, need: needMb, pass: mb >= needMb };
}
/** #13: the distance to use for the ship's orbit. */
export function signalRow(orbit: 'LLO' | 'NRHO') {
  return SIGNAL_DISTANCES[orbit === 'NRHO' ? 4 : 1];
}
/** #14: shield health as a percentage (max 100) minus damage, and its result row. */
export function shieldMath(ratingMph: number, damagePct = 0) {
  const health = Math.min(100, (ratingMph / SHIELD_REQUIRED_MPH.v) * 100) - damagePct;
  return { health, result: health >= 99.99 ? 'safe' : health >= 90 ? 'rough' : 'burn-through' };
}
/** #7: suggested fuel for a stage (rounded up to the next 1,000 lb), or impossible. */
export function suggestFuel(dvNeed: number, ve: number, k: number, pushedLb: number) {
  const r = fuelNeeded(dvNeed, ve, k, pushedLb);
  return { ...r, suggested: r.impossible ? Infinity : Math.ceil(r.fuel / 1000) * 1000 };
}
/**
 * #7: repeat the fuel formula, re-flying the whole stack each time, until the stage's fuel stops
 * changing (more fuel in one stage slows the others). Rounded up to 1,000 lb; null if no fuel works.
 */
export function settledFuel(d: Design, stage: 1 | 2, startLb: number): number | null {
  let f = startLb;
  for (let i = 0; i < 40; i++) {
    const R = analyzeDesign(withStageFuel(d, stage, f)).spec!.rocket;
    const S = stage === 2 ? R.stage2 : R.stage1;
    const others = R.dvTotal - (stage === 2 ? R.vStage2 : R.vStage1);
    const pushed = kgToLb(stage === 2 ? R.payloadKg + S.enginesKg : R.payloadKg + R.stage2.fullKg + S.enginesKg);
    const r = fuelNeeded(Math.max(0, MISSION_DV.toMoon - others), S.ve, S.tankKg / Math.max(1e-9, S.fuelKg), pushed);
    if (r.impossible) return null;
    const done = Math.abs(r.fuel - f) < 200;
    f = r.fuel;
    if (done) break;
  }
  return Math.ceil(f / 1000) * 1000;
}

/** #7 "Use this": the design with one stage's fuel set (makes the rocket custom). */
export function withStageFuel(d: Design, stage: 1 | 2, fuelLb: number): Design {
  const nd = cloneDesign(d);
  const r = JSON.parse(JSON.stringify(rocketOf(d))) as RocketBuild;
  if (stage === 1) r.stage1.fuelLb = fuelLb; else r.stage2.fuelLb = fuelLb;
  r.name = `${r.name.replace(/ \(custom fuel\)$/, '')} (custom fuel)`;
  nd.spec = { ...specOf(d), rocket: r };
  return nd;
}

/** Accept within ±1% (or ±abs for TWR / ln values). */
export function checkAnswer(step: Step, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (step.abs !== undefined) return Math.abs(value - step.expect) <= step.abs + 1e-9;
  return Math.abs(value - step.expect) <= Math.abs(step.expect) * 0.01 + 1e-9;
}
/** Easy-mode warmer/colder nudge. */
export const warmer = (step: Step, value: number) => (value < step.expect ? 'too low (colder)' : 'too high (colder)');

const lb = (kg: number) => kgToLb(kg);
const r0 = (v: number) => Math.round(v);

export function buildSheets(d: Design, s: DesignStats): Sheet[] {
  const S = s.spec!;
  const R = S.rocket;
  const b = S.rocketBuild;
  const e1 = ENGINE_BY_ID[b.stage1.engine], e2 = ENGINE_BY_ID[b.stage2.engine];
  const bs = b.booster && b.boosterCount > 0 ? BOOSTER_BY_ID[b.booster] : null;
  // weights in lb, rounded like the desk shows them (the player works from the shown numbers)
  const payload = r0(lb(R.payloadKg));
  const s2fuel = r0(lb(R.stage2.fuelKg)), s2empty = r0(lb(R.stage2.emptyKg));
  const s1fuel = r0(lb(R.stage1.fuelKg)), s1empty = r0(lb(R.stage1.emptyKg));
  const bEach = bs ? bs.weightLb.v : 0, bFuelEach = bs ? bs.fuelLb.v : 0, nB = bs ? b.boosterCount : 0;
  const s2full = s2fuel + s2empty, s1full = s1fuel + s1empty, boosters = nB * bEach;
  const W = payload + s2full + s1full + boosters;
  const push = b.stage1.count * e1.thrustN.v + nB * (bs?.thrustN.v ?? 0);
  const WN = W * LB_TO_N;
  const twr = push / WN;
  // rocket-equation pieces from the shown weights
  const pieces: { name: string; full: number; empty: number; ve: number }[] = [];
  if (bs) pieces.push({ name: 'Boosters', full: W, empty: W - nB * bFuelEach, ve: bs.veMs.v });
  pieces.push({ name: 'Stage 1', full: W - boosters, empty: W - boosters - s1fuel, ve: e1.veMs.v });
  pieces.push({ name: 'Stage 2', full: payload + s2full, empty: payload + s2empty, ve: e2.veMs.v });
  const dvs = pieces.map((p) => p.ve * Math.log(p.full / p.empty));
  const total = dvs.reduce((a, v) => a + v, 0);
  const crew = s.crew, days = s.missionDays;
  const L = LIFE_SUPPORT_LB;
  const isp1 = Math.round((e1.veMs.v / 9.81) * 10) / 10, isp2 = Math.round((e2.veMs.v / 9.81) * 10) / 10;
  const target = MISSION_DV.toMoon;

  return [
    {
      id: 'liftoff', n: 1, title: 'WEIGHT AT LIFTOFF', question: 'How heavy is the whole rocket on the pad?',
      think: 'Stepping on a scale with a full backpack: the rocket, every drop of fuel, and the spacecraft on top all count.',
      formula: 'W = payload + stage 2 (full) + stage 1 (full) + boosters',
      given: [`Payload (your spacecraft stack): ${fmt(payload)} lb`, `Stage 2: ${fmt(s2fuel)} lb fuel + ${fmt(s2empty)} lb empty`, `Stage 1: ${fmt(s1fuel)} lb fuel + ${fmt(s1empty)} lb empty`, bs ? `Boosters: ${nB} x ${fmt(bEach)} lb` : 'Boosters: none'],
      steps: [
        { label: 'Stage 2 full = fuel + empty', expect: s2full, unit: 'lb', why: `${fmt(s2fuel)} + ${fmt(s2empty)} = ${fmt(s2full)}` },
        { label: 'Stage 1 full = fuel + empty', expect: s1full, unit: 'lb', why: `${fmt(s1fuel)} + ${fmt(s1empty)} = ${fmt(s1full)}` },
        ...(bs ? [{ label: `Boosters = ${nB} x ${fmt(bEach)}`, expect: boosters, unit: 'lb', why: `${nB} x ${fmt(bEach)} = ${fmt(boosters)}` }] : []),
        { label: 'W = add them all, with the payload', expect: W, unit: 'lb', why: `${fmt(payload)} + ${fmt(s2full)} + ${fmt(s1full)} + ${fmt(boosters)} = ${fmt(W)}` },
      ],
      target: 'Keep this number: it is the bottom of the thrust-to-weight formula (#2).',
      example: 'SLS-like with Orion: 63,400 + 70,929 + 2,355,250 + 3,200,000 = 5,689,579 lb (real SLS: 5.75 million lb).',
      verdict: () => ({ pass: true, text: `Weight at liftoff: ${fmt(W)} lb.` }),
    },
    {
      id: 'twr', n: 2, title: 'CAN IT LIFT OFF? (THRUST-TO-WEIGHT)', question: 'Do the engines push harder than gravity pulls?',
      think: 'Lifting a box: push up with less force than it weighs and it does not move.',
      formula: 'TWR = total push (N) / weight at liftoff (N) >= 1.2',
      given: [`Stage 1: ${b.stage1.count} x ${e1.name.split(' (')[0]} at ${fmt(e1.thrustN.v)} N`, bs ? `Boosters: ${nB} x ${fmt(bs.thrustN.v)} N` : 'Boosters: none', `Weight at liftoff (#1): ${fmt(W)} lb`, '1 lb of weight = 4.448 N'],
      steps: [
        { label: 'Total push = engines x N + boosters x N', expect: push, unit: 'N', why: `${b.stage1.count} x ${fmt(e1.thrustN.v)}${bs ? ` + ${nB} x ${fmt(bs.thrustN.v)}` : ''} = ${fmt(push)}` },
        { label: 'Weight in N = lb x 4.448', expect: WN, unit: 'N', why: `${fmt(W)} x 4.448 = ${fmt(WN)}` },
        { label: 'TWR = push / weight', expect: twr, unit: '', abs: 0.01, why: `${fmt(push)} / ${fmt(WN)} = ${twr.toFixed(2)}` },
      ],
      target: `TWR must be ${MIN_LIFTOFF_TWR.v} or more. Your push has to beat 1.2 x your weight = ${fmt(1.2 * WN)} N.`,
      example: 'SLS-like: 4 x 1,860,000 + 2 x 16,000,000 = 39,440,000 N; 5,689,579 x 4.448 = 25,307,000 N; TWR = 1.56.',
      verdict: () => (twr >= MIN_LIFTOFF_TWR.v ? { pass: true, text: `TWR ${twr.toFixed(2)}: it lifts off.` } : { pass: false, text: `TWR ${twr.toFixed(2)}: it stays on the pad.`, pointer: 'Add stage 1 engines or boosters (Mission Plan rocket), or carry less.' }),
    },
    {
      id: 've', n: 4, title: 'EXHAUST SPEED (THE EASY VERSION OF ISP)', question: 'How good is each engine at turning fuel into speed?',
      think: 'Throwing balls off a skateboard: the faster you throw, the faster you roll.',
      formula: 'exhaust speed (m/s) = Isp x 9.81',
      given: [`Stage 1 ${e1.name.split(' (')[0]}: Isp ${isp1} s`, `Stage 2 ${e2.name.split(' (')[0]}: Isp ${isp2} s`, 'Maker sheets list Isp in seconds; the game shows m/s.'],
      steps: [
        { label: `Stage 1 exhaust speed = ${isp1} x 9.81`, expect: isp1 * 9.81, unit: 'm/s', why: `${isp1} x 9.81 = ${fmt(isp1 * 9.81)}` },
        { label: `Stage 2 exhaust speed = ${isp2} x 9.81`, expect: isp2 * 9.81, unit: 'm/s', why: `${isp2} x 9.81 = ${fmt(isp2 * 9.81)}` },
      ],
      target: 'Higher is better: more speed from every pound of fuel.',
      example: 'RL10: about 4,530 m/s. RS-25: 4,010 average. Merlin 1D: 2,910 average.',
      verdict: () => ({ pass: true, text: `Stage 1 ${fmt(e1.veMs.v)} m/s, stage 2 ${fmt(e2.veMs.v)} m/s.` }),
    },
    {
      id: 'rocketeq', n: 5, title: 'SPEED FROM EACH PIECE (ROCKET EQUATION)', question: 'If I burn all the fuel in this piece, how much faster do I go?',
      think: 'Same skateboard: more balls and faster throws mean more speed; a heavier board is harder to speed up.',
      formula: 'Δv = exhaust speed x ln(full / empty)',
      given: pieces.map((p) => `${p.name}: full ${fmt(p.full)} lb, empty ${fmt(p.empty)} lb, ${fmt(p.ve)} m/s`),
      steps: pieces.flatMap((p, i) => {
        const ratio = p.full / p.empty, ln = Math.log(ratio);
        return [
          { label: `${p.name}: full / empty`, expect: ratio, unit: '', why: `${fmt(p.full)} / ${fmt(p.empty)} = ${ratio.toFixed(3)}` },
          { label: `${p.name}: ln(that)`, expect: ln, unit: '', abs: 0.01, why: `ln(${ratio.toFixed(3)}) = ${ln.toFixed(3)}` },
          { label: `${p.name}: Δv = ${fmt(p.ve)} x ln`, expect: dvs[i], unit: 'm/s', why: `${fmt(p.ve)} x ${ln.toFixed(3)} = ${fmt(dvs[i])}` },
        ];
      }),
      target: 'Each piece pushes everything above it. Drop it when its fuel runs out.',
      example: 'SLS-like stage 2: 134,329 / 69,329 = 1.938; ln = 0.661; 4,530 x 0.661 = 2,995 m/s.',
      verdict: () => ({ pass: true, text: pieces.map((p, i) => `${p.name} ${fmt(dvs[i])}`).join(' + ') + ' m/s' }),
    },
    {
      id: 'moon', n: 6, title: 'IS IT ENOUGH TO REACH THE MOON?', question: 'Do the pieces add up to the speed the Moon needs?',
      think: '9,400 m/s gets you to Earth orbit; another 3,200 m/s aims you at the Moon.',
      formula: `Δv total = V boosters + V stage 1 + V stage 2 >= ${fmt(target)} m/s`,
      given: pieces.map((p, i) => `V ${p.name.toLowerCase()} (#5): ${fmt(dvs[i])} m/s`),
      steps: [{ label: 'Δv total = add the pieces', expect: total, unit: 'm/s', why: `${dvs.map((v) => fmt(v)).join(' + ')} = ${fmt(total)}` }],
      target: `To reach the Moon you need about ${fmt(target)} m/s.`,
      example: 'SLS-like: 1,680 + 7,990 + 2,995 = 12,665 m/s. Pass, with only 65 m/s to spare.',
      verdict: () => (total >= target
        ? { pass: true, text: `${fmt(total)} m/s: pass, ${fmt(total - target)} m/s to spare.${total - target < 240 ? ' Thin: an engine-out would end this mission.' : ''}` }
        : { pass: false, text: `${fmt(total)} m/s: you're ${fmt(target - total)} m/s short.`, pointer: 'The biggest lever is more stage 2 fuel or a stage 2 engine with a faster exhaust (or a bigger rocket preset).' }),
    },
    {
      id: 'supplies', n: 10, title: 'OXYGEN, WATER AND FOOD', question: 'How many pounds of supplies does the crew need?',
      think: 'About 15 lb per astronaut per day. Bring too little and the mission ends early.',
      formula: 'supplies (lb) = crew x days x 15  (one line per supply)',
      given: [`Crew: ${crew}`, `Days: 3 out + ${S.orbit.waitDays.v} in ${S.orbit.id} + ${d.plan.stayDays} on the surface + 3 back = ${fmt(days, 1)}`, `Per astronaut per day: oxygen ${L.oxygen.v}, drinking water ${L.drinkingWater.v}, hygiene water ${L.hygieneWater.v}, food ${L.food.v} lb`],
      steps: [
        { label: `Oxygen = ${crew} x ${fmt(days, 1)} x ${L.oxygen.v}`, expect: crew * days * L.oxygen.v, unit: 'lb', why: `${crew} x ${fmt(days, 1)} x ${L.oxygen.v} = ${fmt(crew * days * L.oxygen.v)}` },
        { label: `Drinking water = ... x ${L.drinkingWater.v}`, expect: crew * days * L.drinkingWater.v, unit: 'lb', why: `${crew} x ${fmt(days, 1)} x ${L.drinkingWater.v} = ${fmt(crew * days * L.drinkingWater.v)}` },
        { label: `Hygiene water = ... x ${L.hygieneWater.v}`, expect: crew * days * L.hygieneWater.v, unit: 'lb', why: `${crew} x ${fmt(days, 1)} x ${L.hygieneWater.v} = ${fmt(crew * days * L.hygieneWater.v)}` },
        { label: `Food = ... x ${L.food.v}`, expect: crew * days * L.food.v, unit: 'lb', why: `${crew} x ${fmt(days, 1)} x ${L.food.v} = ${fmt(crew * days * L.food.v)}` },
        { label: 'Total = add the four', expect: crew * days * (L.oxygen.v + L.drinkingWater.v + L.hygieneWater.v + L.food.v), unit: 'lb', why: `${fmt(crew * days * 14.97)} lb` },
      ],
      target: `Days must be at or under the capsule's limit (${S.capsule.name}: ${S.capsule.maxDays} days).`,
      example: '4 crew x 17.5 days: 140 + 385 + 154 + 369 = 1,048 lb.',
      verdict: () => (days <= S.capsule.maxDays ? { pass: true, text: `${fmt(days, 1)} days fits the ${S.capsule.maxDays}-day capsule.` } : { pass: false, text: `${fmt(days, 1)} days is over the capsule's ${S.capsule.maxDays}-day limit.`, pointer: 'Shorten the surface stay or pick a capsule rated for longer.' }),
    },
    ...moreSheets(d, s, { payload, s1fuel, s1empty, s2fuel, s2empty, s2full, boosters, W, pieces, dvs, e1, e2 }),
  ].map((sh) => ({ ...sh, given: sh.given.filter(Boolean) } as Sheet)).sort((a, b) => a.n - b.n);
}

interface Shown {
  payload: number; s1fuel: number; s1empty: number; s2fuel: number; s2empty: number; s2full: number; boosters: number; W: number;
  pieces: { name: string; full: number; empty: number; ve: number }[]; dvs: number[];
  e1: (typeof ENGINE_BY_ID)[string]; e2: (typeof ENGINE_BY_ID)[string];
}

/** Sheets 3, 7, 8, 9, 11, 12, 13, 14, 15 (spec tab 6). 3 and 13 are player-solved; the rest are game-solved. */
function moreSheets(d: Design, s: DesignStats, x: Shown): Sheet[] {
  const S = s.spec!, b = S.rocketBuild, sp = specOf(d);
  const target = MISSION_DV.toMoon;
  const ok = (v: boolean) => (v ? '✓' : '×');
  // ---- #3 empty stage and dead weight (player)
  const m1 = MATERIALS[b.stage1.material], f1 = PROPELLANTS[x.e1.fuel];
  const liner1 = b.stage1.material === 'carbon' && sp.fixes.includes('liner') ? 1.1 : 1;
  const k1 = m1.k.v * f1.tankMult.v * liner1;
  const eng1 = b.stage1.count * x.e1.weightLb.v;
  const tank1 = k1 * x.s1fuel, empty1 = tank1 + eng1;
  const above1 = x.payload + x.s2full;
  const shares = deadWeightShares(empty1, x.s1fuel, above1);
  const s2pl = x.pieces[x.pieces.length - 1];
  const kept = keptShellDv(x.e2.veMs.v, s2pl.full, s2pl.empty, empty1);
  const v2 = x.dvs[x.dvs.length - 1];
  // ---- #7 suggested fuel per stage (game)
  const vOthers2 = x.dvs.slice(0, -1).reduce((a, v) => a + v, 0);
  const vOthers1 = x.dvs.reduce((a, v) => a + v, 0) - x.dvs[x.dvs.length - 2];
  const eng2 = b.stage2.count * x.e2.weightLb.v;
  const k2 = (x.s2empty - eng2) / Math.max(1, x.s2fuel);
  const kk1 = (x.s1empty - eng1) / Math.max(1, x.s1fuel);
  const st2 = { need: target - vOthers2, ve: x.e2.veMs.v, k: k2, pushed: x.payload + eng2 };
  const st1 = { need: target - vOthers1, ve: x.e1.veMs.v, k: kk1, pushed: x.payload + x.s2full + eng1 };
  const sug2 = suggestFuel(Math.max(0, st2.need), st2.ve, st2.k, st2.pushed); // one pass, with today's numbers
  const sug1 = suggestFuel(Math.max(0, st1.need), st1.ve, st1.k, st1.pushed);
  // more fuel in one stage makes the others slower: repeat the formula until the stages agree
  const set2 = sug2.impossible || st2.need <= 0 ? null : settledFuel(d, 2, sug2.fuel);
  const set1 = sug1.impossible || st1.need <= 0 ? null : settledFuel(d, 1, sug1.fuel);
  // ---- #8 capsule burns (game)
  const burnIn = s.propulsion.burns[0], burnHome = s.propulsion.burns[1];
  const cap = capsuleBurnMath(kgToLb(burnIn.m0), kgToLb(S.capsule.propKg), S.capsule.ve, burnIn.dv, burnHome?.dv ?? S.orbit.tei.v, burnHome ? kgToLb(burnHome.m0) : undefined);
  // ---- #9 lander (game)
  const lc = s.parts.find((p) => p.slot === 'lander');
  const crewLb = kgToLb(s.landingCrew * CREW_MASS_KG);
  let landerSheet: Sheet | null = null;
  if (lc && S.lander) {
    const arrival = kgToLb(S.lander.arrivalPropKg);
    const fullD = kgToLb(s.mass.landerWetKg) - arrival + crewLb;
    const emptyD = fullD - (kgToLb(lc.descentPropKg!) - arrival);
    const fullA = kgToLb(lc.ascentDryKg! + lc.ascentPropKg!) + crewLb + kgToLb(s.lander.sampleCapacityKg);
    const emptyA = fullA - kgToLb(lc.ascentPropKg!);
    const ve = lc.ispS! * 9.80665;
    const down = landerBurnMath(fullD, emptyD, ve, s.lander.descentDvReq, lc.thrustN!);
    const up = landerBurnMath(fullA, emptyA, ve, s.lander.ascentDvReq, lc.ascentThrustN ?? lc.thrustN!);
    landerSheet = {
      id: 'lander', n: 9, game: true, title: 'LANDING AND LIFTING OFF', question: 'Can the lander get down, get back up, and beat Moon gravity?',
      think: 'Two rocket equations: the descent stage going down, then the ascent stage (with crew and rocks) going up.',
      formula: 'Δv = exhaust speed x ln(full / empty);  TWR Moon = N / (lb x 4.448 x 0.165) >= 1',
      given: [`${lc.name}: exhaust ${fmt(ve)} m/s, engines ${fmt(lc.thrustN!)} N down / ${fmt(lc.ascentThrustN ?? lc.thrustN!)} N up`, `Down: full ${fmt(fullD)} lb, empty ${fmt(emptyD)} lb${arrival > 0 ? ` (${fmt(arrival)} lb already used flying into the halo orbit)` : ''}`, `Up: full ${fmt(fullA)} lb (crew + ${fmt(kgToLb(s.lander.sampleCapacityKg))} lb rock), empty ${fmt(emptyA)} lb`],
      steps: [
        { label: `Down: ${fmt(ve)} x ln(${fmt(fullD)} / ${fmt(emptyD)})`, expect: down.dv, unit: 'm/s', why: '' },
        { label: `Up: ${fmt(ve)} x ln(${fmt(fullA)} / ${fmt(emptyA)})`, expect: up.dv, unit: 'm/s', why: '' },
        { label: 'TWR Moon going down', expect: down.twrMoon, unit: '', abs: 0.01, why: '' },
        { label: 'TWR Moon going up', expect: up.twrMoon, unit: '', abs: 0.01, why: '' },
      ],
      extra: [`Orbit table (m/s): low orbit down 1,870 / up 1,870; halo orbit down 2,600 / up 2,600.`, `${ok(down.pass)} Down ${fmt(down.dv)} / ${fmt(down.need)}   ${ok(up.pass)} Up ${fmt(up.dv)} / ${fmt(up.need)}   ${ok(down.lifts && up.lifts)} TWR ${down.twrMoon.toFixed(2)} / ${up.twrMoon.toFixed(2)}`],
      target: `Down ${fmt(s.lander.descentDvReq)} m/s and up ${fmt(s.lander.ascentDvReq)} m/s from ${S.orbit.id}; TWR 1 or more.`,
      example: 'Apollo LM lifting off: 3,050 x ln(11,200 / 6,013) = 1,898 m/s; needs 1,870: pass by 28. TWR = 15,570 / (11,200 x 4.448 x 0.165) = 1.89.',
      verdict: () => (down.pass && up.pass && down.lifts && up.lifts ? { pass: true, text: 'The lander can land and lift off.' } : { pass: false, text: !down.pass ? `Down is ${fmt(down.need - down.dv)} m/s short.` : !up.pass ? `Up is ${fmt(up.need - up.dv)} m/s short.` : 'An engine is too weak for Moon gravity.', pointer: S.orbit.id === 'NRHO' ? 'The halo orbit needs a big lander (or use low lunar orbit).' : 'Carry fewer rocks, or pick a bigger lander.' }),
    };
  }
  // ---- #11 power (game)
  const sun = S.orbit.sunFraction.v, darkH = S.orbit.periodH.v * (1 - sun);
  const solar = s.power.genKind === 'solar';
  const panelW = solar ? s.power.genW : s.power.orbitAvgGenW;
  const stayH = d.plan.stayDays * 24;
  const pw = powerMath(panelW, solar ? sun : 1, s.power.peakLoadW, darkH, s.power.batteryWh, S.lander?.grossLoadW ?? 0, stayH);
  // ---- #12 data (game)
  const kbps = s.comms.mbps * 1000, contact = S.orbit.contactFraction.v;
  const dm = dataMath(kbps, contact, S.data.needMbPerDay);
  // ---- #13 signal (player)
  const row = signalRow(S.orbit.id);
  const delay = signalDelayS(row.miles.v);
  // ---- #14 shield (game)
  const sh = shieldMath(S.capsule.shieldMph);
  // ---- #15 money (game)
  const left = S.budgetM - s.costM;
  const lines = s.costLines.slice().sort((a, c) => c.m - a.m);
  const receipt = lines.slice(0, 6).map((l) => `${fmtUsdM(l.m)}  ${l.label}`);
  const rest = lines.slice(6);
  if (rest.length) receipt.push(`${fmtUsdM(rest.reduce((a, l) => a + l.m, 0))}  ${rest.length} more items`);

  const sheets: Sheet[] = [
    {
      id: 'empty', n: 3, title: 'EMPTY STAGE AND DEAD WEIGHT', question: 'When the fuel is gone, what is left over, and when must it go?',
      think: 'An empty water bottle: a bigger bottle weighs more even when it is empty.',
      formula: 'Empty stage = k x fuel + engines   (hydrogen: k x 1.5)',
      given: [`Stage 1 tank: ${m1.name}, k = ${m1.k.v}; ${f1.short} x ${f1.tankMult.v}${liner1 > 1 ? '; metal liner x 1.1' : ''}`, `Stage 1 fuel: ${fmt(x.s1fuel)} lb; engines: ${b.stage1.count} x ${fmt(x.e1.weightLb.v)} lb`, `Flying above stage 1: payload + stage 2 = ${fmt(above1)} lb`],
      steps: [
        { label: `Tank = ${m1.k.v} x ${f1.tankMult.v}${liner1 > 1 ? ' x 1.1' : ''} x ${fmt(x.s1fuel)}`, expect: tank1, unit: 'lb', why: `${(k1).toFixed(4)} x ${fmt(x.s1fuel)} = ${fmt(tank1)}` },
        { label: `Empty stage = tank + ${fmt(eng1)} lb of engines`, expect: empty1, unit: 'lb', why: `${fmt(tank1)} + ${fmt(eng1)} = ${fmt(empty1)}` },
        { label: 'Dead weight at ignition = empty / (empty + fuel + above), in %', expect: shares.ignition * 100, unit: '%', abs: 1, why: `${fmt(empty1)} / ${fmt(empty1 + x.s1fuel + above1)} = ${(shares.ignition * 100).toFixed(0)}%` },
        { label: 'Dead weight at burnout = empty / (empty + above), in %', expect: shares.burnout * 100, unit: '%', abs: 1, why: `${fmt(empty1)} / ${fmt(empty1 + above1)} = ${(shares.burnout * 100).toFixed(0)}%` },
      ],
      extra: [`What if you kept it? Stage 2 would give ${fmt(kept)} m/s instead of ${fmt(v2)} m/s (-${fmt(v2 - kept)}). That is why rockets drop stages.`],
      target: 'Smaller k means lighter tanks. At burnout the stage is pure dead weight: drop it.',
      example: 'SLS-like stage 1: 0.054 x 1.5 x 2,150,000 = 174,150 + 4 x 7,775 = 205,250 lb. 8% at ignition, 60% at burnout; kept, stage 2 gives 960 m/s, not 2,995.',
      verdict: () => ({ pass: true, text: `Empty stage 1: ${fmt(empty1)} lb, ${(shares.burnout * 100).toFixed(0)}% of what flies at burnout.` }),
    },
    {
      id: 'fuel', n: 7, game: true, title: 'HOW MUCH FUEL YOU NEED', question: 'Working backwards: how much fuel gets each stage to the Moon target?',
      think: 'Start from the speed you need and work back to the pounds of fuel that give it.',
      formula: 'R = e^(Δv / exhaust speed);  fuel = pushed x (R - 1) / (1 - k x (R - 1))',
      given: [`Stage 2 needs ${fmt(st2.need)} m/s (12,600 - ${fmt(vOthers2)}); ve ${fmt(st2.ve)}; k ${st2.k.toFixed(3)}; pushing ${fmt(st2.pushed)} lb`, `Stage 1 needs ${fmt(st1.need)} m/s (12,600 - ${fmt(vOthers1)}); ve ${fmt(st1.ve)}; k ${st1.k.toFixed(3)}; pushing ${fmt(st1.pushed)} lb`],
      steps: [
        { label: `Stage 2: R = e^(${fmt(Math.max(0, st2.need))} / ${fmt(st2.ve)})`, expect: sug2.R, unit: '', abs: 0.01, why: '' },
        ...(sug2.impossible ? [] : [{ label: 'Stage 2 fuel (this pass) = pushed x (R-1) / (1 - k(R-1))', expect: sug2.fuel, unit: 'lb', why: '' }]),
        { label: `Stage 1: R = e^(${fmt(Math.max(0, st1.need))} / ${fmt(st1.ve)})`, expect: sug1.R, unit: '', abs: 0.01, why: '' },
        ...(sug1.impossible ? [] : [{ label: 'Stage 1 fuel (this pass) = pushed x (R-1) / (1 - k(R-1))', expect: sug1.fuel, unit: 'lb', why: '' }]),
      ],
      extra: [`Your fuel now: stage 2 ${fmt(x.s2fuel)} lb, stage 1 ${fmt(x.s1fuel)} lb.`, `Repeating the formula until the stages agree: suggested fuel ${set2 ? `stage 2 ${fmt(set2)} lb` : 'stage 2 -'}, ${set1 ? `stage 1 ${fmt(set1)} lb` : 'stage 1 -'}.`, ...(sug2.impossible || sug1.impossible ? [`× ${sug2.impossible ? 'Stage 2' : 'Stage 1'}: 1 - k(R - 1) = ${(sug2.impossible ? sug2.bottom : sug1.bottom).toFixed(2)}: no amount of fuel works. Add a stage or pick a lighter material.`] : []),],
      target: `Together the pieces must reach ${fmt(target)} m/s.`,
      example: 'Need 5,400 m/s, ve 3,050, k 0.065, pushing 26,455 lb: R = e^(5,400 / 3,050) = 5.87; fuel = 26,455 x 4.87 / (1 - 0.065 x 4.87) = 188,700 lb.',
      verdict: () => (sug2.impossible || sug1.impossible ? { pass: false, text: 'No amount of fuel works for one stage.', pointer: 'Add a stage or pick a lighter material.' } : { pass: true, text: set2 || set1 ? `Suggested: ${set2 ? `stage 2 ${fmt(set2)} lb` : ''}${set2 && set1 ? ' or ' : ''}${set1 ? `stage 1 ${fmt(set1)} lb` : ''}.` : 'Both stages already have enough.' }),
      actions: [
        ...(set2 ? [{ label: `USE THIS: S2 ${fmt(set2)} LB`, apply: (dd: Design) => withStageFuel(dd, 2, set2) }] : []),
        ...(set1 ? [{ label: `USE THIS: S1 ${fmt(set1)} LB`, apply: (dd: Design) => withStageFuel(dd, 1, set1) }] : []),
      ],
    },
    {
      id: 'capsule', n: 8, game: true, title: 'THE CAPSULE\'S BURNS AT THE MOON', question: 'Enough fuel to get into lunar orbit AND back out to go home?',
      think: 'A road trip where the only gas station is at home: what you burn getting there, you can\'t use coming back.',
      formula: 'fuel used = weight x (1 - e^(-Δv / exhaust speed)); then the rocket equation with what is left',
      given: [`${S.capsule.name}: ${fmt(kgToLb(S.capsule.propKg))} lb of fuel, exhaust ${fmt(S.capsule.ve)} m/s`, `Weight getting in: ${fmt(kgToLb(burnIn.m0))} lb${sp.architecture === 'apollo' && s.lander.present ? ' (pushing the lander too)' : ''}`, `${S.orbit.name}: in ${S.orbit.loi.v} m/s, home ${S.orbit.tei.v} m/s`],
      steps: [
        { label: `Fuel used getting in = ${fmt(kgToLb(burnIn.m0))} x (1 - e^(-${burnIn.dv} / ${fmt(S.capsule.ve)}))`, expect: cap.used, unit: 'lb', why: '' },
        { label: 'Fuel left = fuel - used', expect: cap.left, unit: 'lb', why: '' },
        { label: 'Weight for the trip home (lander off, rocks aboard)', expect: cap.home, unit: 'lb', why: '' },
        { label: 'Speed left = ve x ln(home / (home - left))', expect: cap.dvLeft, unit: 'm/s', why: '' },
      ],
      extra: ['Orbit table (m/s): low orbit in 900 / home 900; halo orbit in 430 / home 410.', `${ok(cap.pass)} ${fmt(cap.dvLeft)} m/s available to go home; need ${fmt(cap.need)}.`],
      target: `Speed left must be at least ${fmt(cap.need)} m/s.`,
      example: 'Orion, halo orbit: uses 7,410 lb, 11,590 left, 820 m/s: pass. Low orbit: uses 14,410, 4,590 left, 350 m/s vs 900: the crew is stuck.',
      verdict: () => (cap.pass ? { pass: true, text: `Pass: ${fmt(cap.dvLeft - cap.need)} m/s to spare.` } : { pass: false, text: 'Fail: the crew would be stuck in lunar orbit.', pointer: S.orbit.id === 'LLO' ? 'Use the halo orbit or a capsule with more fuel (Mission Style).' : 'Pick a capsule with more service-module fuel or lighten the stack.' }),
    },
    ...(landerSheet ? [landerSheet] : []),
    {
      id: 'power', n: 11, game: true, title: 'POWER AND BATTERIES', question: 'Do the panels make enough, and does the battery cover the dark?',
      think: 'A 5,000 Wh battery runs a 1,000 W load for 5 hours; the x 1.2 is a safety margin.',
      formula: 'power made = panel W x sunlight >= used;  battery Wh = W used x hours dark x 1.2',
      given: [solar ? `Panels: ${fmt(panelW)} W; sunlight in ${S.orbit.id}: ${sun}` : `Fuel cells: ${fmt(panelW)} W day and night`, `Used with everything on: ${fmt(s.power.peakLoadW)} W; battery ${fmt(s.power.batteryWh)} Wh`, `Dark time per orbit: ${darkH.toFixed(2)} h`, s.lander.present ? `Lander on the surface: ${fmt(S.lander?.grossLoadW ?? 0)} W for ${stayH} h${S.lander?.solarW ? `; surface solar ${fmt(S.lander.solarW)} W` : ''}` : ''],
      steps: [
        { label: 'Power made', expect: pw.made, unit: 'W', why: '' },
        { label: 'Battery needed for the dark = W x h x 1.2', expect: pw.eclipseWh, unit: 'Wh', why: '' },
        ...(s.lander.present ? [{ label: 'Lander surface battery = W x h x 1.2', expect: pw.surfaceWh, unit: 'Wh', why: '' }] : []),
      ],
      extra: ['Sunlight: 0.61 near Earth, 0.60 low lunar orbit, 0.99 halo orbit.', `${ok(pw.pass)} Made ${fmt(pw.made)} vs used ${fmt(s.power.peakLoadW)} W   ${ok(pw.batteryOk)} Battery ${fmt(s.power.batteryWh)} vs ${fmt(pw.eclipseWh)} Wh`, ...(s.lander.present ? [`Lander: ${pw.packs} x 5 kWh packs${S.lander?.solarW ? ', or the surface solar array in daylight' : ''}.`] : [])],
      target: 'Made >= used, and the battery covers every dark stretch.',
      example: 'Orion: 11,000 W x 0.99 = 10,890 W vs 3,482 W used: pass. Lander, 2 days: 1,200 W x 48 h x 1.2 = 69,120 Wh = 14 packs.',
      verdict: () => (pw.pass && pw.batteryOk ? { pass: true, text: 'Power and battery are fine.' } : { pass: false, text: !pw.pass ? 'The panels cannot keep up.' : 'The battery runs out in the dark.', pointer: !pw.pass ? 'Bigger solar arrays (Power tab) or fewer power-hungry parts.' : 'A bigger battery (Batteries tab).' }),
    },
    {
      id: 'data', n: 12, game: true, title: 'DATA SENT HOME', question: 'Can the radio send home everything the mission makes?',
      think: '86,400 seconds in a day; 8,000 turns kilobits into megabytes.',
      formula: 'MB per day = kbps x 86,400 x contact fraction / 8,000',
      given: [`Radio: ${fmt(kbps)} kbps`, `Contact in ${S.orbit.id}: ${contact}${s.comms.availability < 1 ? `; clouds block the laser ${Math.round((1 - s.comms.availability) * 100)}% of the time` : ''}`, `Mission needs 300 MB/day + instruments = ${fmt(dm.need)} MB/day`],
      steps: [{ label: `${fmt(kbps)} x 86,400 x ${contact} / 8,000`, expect: dm.mb, unit: 'MB', why: '' }],
      extra: [`${ok(S.data.mbPerDay >= dm.need)} ${fmt(S.data.mbPerDay)} MB/day home (after weather) vs ${fmt(dm.need)} MB/day needed.`],
      target: `At least ${fmt(dm.need)} MB per day.`,
      example: '256 kbps x 86,400 x 1.0 / 8,000 = 2,765 MB/day (low orbit 0.63: about 1,742).',
      verdict: () => (S.data.mbPerDay >= dm.need ? { pass: true, text: 'The radio keeps up.' } : { pass: false, text: 'Data will pile up and be lost.', pointer: 'Cameras and radar need Ka-band or laser comms (Communications tab).' }),
    },
    {
      id: 'signal', n: 13, title: 'SIGNAL DELAY', question: 'How long does a radio message take to reach the ship?',
      think: 'Radio travels at the speed of light: 186,282 miles every second.',
      formula: 'seconds = miles / 186,282',
      given: SIGNAL_DISTANCES.map((r) => `${r === row ? '▶ ' : ''}${r.where}: ${fmt(r.miles.v)} mi`),
      steps: [
        { label: `One way = ${fmt(row.miles.v)} / ${fmt(LIGHT_MILES_PER_S.v)}`, expect: delay, unit: 's', abs: 0.01, why: `${fmt(row.miles.v)} / 186,282 = ${delay.toFixed(2)} s` },
        { label: 'Question and answer = 2 x one way', expect: 2 * delay, unit: 's', abs: 0.02, why: `2 x ${delay.toFixed(2)} = ${(2 * delay).toFixed(2)} s` },
      ],
      target: `Use the ▶ row for your orbit (${S.orbit.id}).`,
      example: '238,855 / 186,282 = 1.28 s one way: about 2.6 s for a question and its answer, plus thinking time.',
      verdict: () => ({ pass: true, text: `${delay.toFixed(2)} s one way.` }),
    },
    {
      id: 'shield', n: 14, game: true, title: 'COMING HOME SAFELY: HEAT SHIELD', question: 'Is the heat shield rated for a return from the Moon?',
      think: 'Orion hit the air at 24,400+ mph on Artemis I and its shield reached 5,000°F.',
      formula: 'shield health = rating mph / 24,400 x 100% (max 100%) - damage',
      given: [`${S.capsule.name} shield: rated ${fmt(S.capsule.shieldMph)} mph`],
      steps: [{ label: `${fmt(S.capsule.shieldMph)} / 24,400 x 100 (max 100)`, expect: sh.health, unit: '%', abs: 0.5, why: '' }],
      extra: ['100%: safe, smooth landing.  90-99%: rough ride, -10 crew safety.  Under 90%: burn-through, mission fails.', 'Emergency 14 can knock 8% off if the shield is not inspected.'],
      target: 'Health 100% for a smooth ride; at least 90% to survive.',
      example: 'Orion (25,000 mph) = 100%: safe. Budget LEO capsule (17,500 mph) = 72%: fails.',
      verdict: () => (sh.result === 'safe' ? { pass: true, text: 'Safe, smooth landing.' } : sh.result === 'rough' ? { pass: true, text: 'Rough ride: -10 crew safety.' } : { pass: false, text: 'Burn-through: the mission fails.', pointer: 'Pick a capsule with a lunar-rated shield (Mission Style).' }),
    },
    {
      id: 'money', n: 15, game: true, title: 'MONEY', question: 'Is there money left, or is launch locked?',
      think: 'The budget meter drops with every part; at $0 or below, launch is locked.',
      formula: 'money left = budget - (rocket + capsule + lander + parts + supplies + launch ops)',
      given: [`Budget (${sp.difficulty === 'hard' ? 'Hard' : 'Easy'}${sp.role === 'commander' ? ', Commander +5%' : ''}): ${fmtUsdM(S.budgetM)}`],
      steps: [
        { label: 'Spent', expect: s.costM * 1e6, unit: 'USD', why: '' },
        { label: 'Money left = budget - spent', expect: left * 1e6, unit: 'USD', why: '' },
      ],
      extra: ['RECEIPT:', ...receipt, `Most expensive: ${lines.slice(0, 3).map((l) => l.label.split(' (')[0]).join(', ')}.`],
      target: 'Money left must stay above $0.',
      example: 'Launch ops cost $5,000,000 per launch and crew supplies $20,000 per crew-day; two launches mean two rockets.',
      verdict: () => (left > 0 ? { pass: true, text: `${fmtUsd(left * 1e6)} left.` } : { pass: false, text: `Launch locked: ${fmtUsd(-left * 1e6)} over.`, pointer: `Change one of: ${lines.slice(0, 3).map((l) => l.label.split(' (')[0]).join(', ')}.` }),
    },
  ];
  return sheets;
}

/** Final Results board rows: every answer in one place (game-computed where no sheet exists yet). */
export function resultsBoard(_d: Design, s: DesignStats): { section: string; rows: { label: string; value: string; ok?: boolean }[] }[] {
  const S = s.spec!, R = S.rocket;
  const L = LIFE_SUPPORT_LB, crew = s.crew, days = s.missionDays;
  const contact = S.orbit.contactFraction.v;
  const miles = SIGNAL_DISTANCES[S.orbit.id === 'NRHO' ? 4 : 1].miles.v;
  const left = S.budgetM - s.costM;
  const top = s.costLines.slice().sort((a, b) => b.m - a.m).slice(0, 3);
  return [
    { section: 'ROCKET', rows: [{ label: 'Weight at liftoff', value: `${fmt(kgToLb(R.liftoffKg))} lb` }, { label: 'Total push', value: `${fmt(R.pushN)} N` }, { label: 'TWR', value: R.twr.toFixed(2), ok: R.liftsOff }] },
    { section: 'SPEED', rows: [...R.pieces.map((p) => ({ label: `V ${p.name.toLowerCase()}`, value: `${fmt(p.dv)} m/s` })), { label: `Total vs ${fmt(MISSION_DV.toMoon)}`, value: `${fmt(R.dvTotal)} m/s (${R.spare >= 0 ? '+' : ''}${fmt(R.spare)})`, ok: R.reachesMoon }] },
    { section: 'MOON BURNS', rows: [
      { label: `Capsule in + home (${S.orbit.id})`, value: `${fmt(S.capsuleReturn.dvLeft)} / ${fmt(S.capsuleReturn.need)} m/s home`, ok: S.capsuleReturn.pass },
      ...(s.lander.present ? [{ label: 'Lander down', value: `${fmt(s.lander.descentDvAvail)} / ${fmt(s.lander.descentDvReq)} m/s`, ok: s.lander.descentDvAvail >= s.lander.descentDvReq }, { label: 'Lander up', value: `${fmt(s.lander.ascentDvAvail)} / ${fmt(s.lander.ascentDvReq)} m/s`, ok: s.lander.ascentDvAvail >= s.lander.ascentDvReq }] : []),
    ] },
    { section: 'CREW SUPPLIES', rows: [{ label: `O2 / drink / hygiene / food`, value: `${fmt(crew * days * L.oxygen.v)} / ${fmt(crew * days * L.drinkingWater.v)} / ${fmt(crew * days * L.hygieneWater.v)} / ${fmt(crew * days * L.food.v)} lb` }, { label: 'Total', value: `${fmt(crew * days * 14.97)} lb` }] },
    { section: 'POWER, DATA, SIGNAL', rows: [
      { label: 'Watts made vs used', value: `${fmt(s.power.orbitAvgGenW)} / ${fmt(s.power.peakLoadW)} W`, ok: s.power.orbitAvgGenW >= s.power.nominalLoadW },
      { label: 'MB per day home', value: `${fmt(mbPerDay(s.comms.mbps * 1000, contact))} / ${fmt(S.data.needMbPerDay)} MB`, ok: S.data.mbPerDay >= S.data.needMbPerDay },
      { label: 'Signal delay', value: `${fmt(miles)} mi = ${signalDelayS(miles).toFixed(2)} s` },
    ] },
    { section: 'HEAT SHIELD + MONEY', rows: [
      { label: 'Shield health', value: `${Math.round(S.shieldHealth * 100)}%`, ok: S.shieldHealth >= 0.9 },
      { label: 'Budget / spent / left', value: `${fmtUsdM(S.budgetM)} / ${fmtUsdM(s.costM)} / ${fmtUsdM(left)}`, ok: left > 0 },
      { label: 'Biggest costs', value: top.map((l) => l.label.split(' (')[0]).join(', ') },
    ] },
  ];
}

/** Calculator arithmetic: numbers with + - x / (x and / first). Commas are ignored. */
export function evalExpr(src: string): number {
  const s = src.replace(/,/g, '').replace(/\s+/g, '');
  if (!s) return NaN;
  const toks = s.match(/(\d+\.?\d*|\.\d+|[+\-x/])/g);
  if (!toks || toks.join('') !== s) return NaN;
  // unary minus
  const nums: number[] = [], ops: string[] = [];
  let i = 0, sign = 1;
  const readNum = () => { while (toks[i] === '-' || toks[i] === '+') { if (toks[i] === '-') sign = -sign; i++; } const v = Number(toks[i++]); const r = sign * v; sign = 1; return r; };
  nums.push(readNum());
  while (i < toks.length) { ops.push(toks[i++]); nums.push(readNum()); }
  if (nums.some((n) => !Number.isFinite(n))) return NaN;
  // x and / first
  for (let k = 0; k < ops.length;) {
    if (ops[k] === 'x' || ops[k] === '/') { nums.splice(k, 2, ops[k] === 'x' ? nums[k] * nums[k + 1] : nums[k] / nums[k + 1]); ops.splice(k, 1); } else k++;
  }
  return ops.reduce((acc, op, k) => (op === '+' ? acc + nums[k + 1] : acc - nums[k + 1]), nums[0]);
}
