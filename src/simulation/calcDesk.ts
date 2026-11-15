/**
 * The Calculation Desk (JOSEPH_SPEC tab 6): 15 formula sheets with the player's own numbers, worked
 * step by step, and a Final Results board. Pure: no Phaser. The player only ever adds numbers the game
 * shows (sheets 1, 2, 6, 10, 15); the game works everything else. Numbers are in lb, N, m/s and USD.
 */
import { cloneDesign, type Design } from '../data/mission';
import {
  BATTERY_MARGIN, BOOSTER_BY_ID, ENGINE_BY_ID, LB_TO_N, LIFE_SUPPORT_LB, LIGHT_MILES_PER_S, MATERIALS, MIN_LIFTOFF_TWR, MOON_G_RATIO,
  POWER_PARTS, PROPELLANTS, RocketBuild, SHIELD_REQUIRED_MPH, SIGNAL_DISTANCES,
} from '../data/specParts';
import { CREW_MASS_KG } from './constants';
import { fuelNeeded, mbPerDay, signalDelayS } from './formulas';
import { analyzeDesign, type DesignStats } from './spacecraft';
import { rocketOf, specOf } from './specModel';
import { fmt, fmtUsd, fmtUsdM, kgToLb } from './units';

/**
 * A sheet step. 'add' steps are the player's only job: add the numbers shown (checked within ±1%).
 * 'game' steps are worked by the game and revealed one line at a time with a plain-words explanation.
 */
export interface Step {
  label: string; expect: number; unit: string; abs?: number; why: string;
  kind?: 'game' | 'add'; explain?: string; addends?: { label: string; value: number }[];
}
export interface Sheet {
  id: string; n: number; title: string; question: string; think: string; formula: string;
  /** D2 Engineer level: the formula in symbols (Beginner sees `think`, Curious sees `formula`). */
  formulaEngineer?: string;
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
    const r = fuelNeeded(Math.max(0, R.target - others), S.ve, S.tankKg / Math.max(1e-9, S.fuelKg), pushed);
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

const g = (label: string, expect: number, unit: string, explain: string, abs?: number): Step => ({ kind: 'game', label, expect, unit, explain, abs, why: '' });
/** The only thing the player ever does: add numbers the game shows them (checked within ±1%). */
const add = (label: string, addends: { label: string; value: number }[], unit: string, explain: string): Step => {
  const expect = addends.reduce((a, x) => a + x.value, 0);
  return { kind: 'add', label, addends, expect, unit, explain, why: `${addends.map((x) => fmt(x.value)).join(' + ')} = ${fmt(expect)}` };
};

/**
 * All 15 sheets (spec tab 6), redesigned so the player only ever adds: sheets 1, 2, 6, 10 and 15
 * end with an addition the player types; every other step is worked by the game, one line at a
 * time, with a plain-words explanation.
 */
export function buildSheets(d: Design, s: DesignStats): Sheet[] {
  const S = s.spec!, R = S.rocket, b = S.rocketBuild, sp = specOf(d);
  const e1 = ENGINE_BY_ID[b.stage1.engine], e2 = ENGINE_BY_ID[b.stage2.engine];
  const bs = b.booster && b.boosterCount > 0 ? BOOSTER_BY_ID[b.booster] : null;
  const target = s.spec!.rocket.target; // E2: 12,600 m/s to the Moon, 9,400 m/s to the ISS
  const ok = (v: boolean) => (v ? '✓' : '×');
  // weights in lb, rounded the way the desk shows them
  const payload = r0(lb(R.payloadKg));
  const s2fuel = r0(lb(R.stage2.fuelKg)), s2empty = r0(lb(R.stage2.emptyKg));
  const s1fuel = r0(lb(R.stage1.fuelKg)), s1empty = r0(lb(R.stage1.emptyKg));
  const bEach = bs ? bs.weightLb.v : 0, bFuelEach = bs ? bs.fuelLb.v : 0, nB = bs ? b.boosterCount : 0;
  const s2full = s2fuel + s2empty, s1full = s1fuel + s1empty, boosters = nB * bEach;
  const W = payload + s2full + s1full + boosters;
  const pushLines = [{ label: `${b.stage1.count} x ${e1.name.split(' (')[0]}`, value: b.stage1.count * e1.thrustN.v, each: e1.thrustN.v, n: b.stage1.count }, ...(bs ? [{ label: `${nB} x ${bs.name.split(' (')[0]}`, value: nB * bs.thrustN.v, each: bs.thrustN.v, n: nB }] : [])];
  const push = pushLines.reduce((a, l) => a + l.value, 0);
  const WN = W * LB_TO_N, twr = push / WN;
  const pieces: { name: string; full: number; empty: number; ve: number }[] = [];
  if (bs) pieces.push({ name: 'Boosters', full: W, empty: W - nB * bFuelEach, ve: bs.veMs.v });
  pieces.push({ name: 'Stage 1', full: W - boosters, empty: W - boosters - s1fuel, ve: e1.veMs.v });
  pieces.push({ name: 'Stage 2', full: payload + s2full, empty: payload + s2empty, ve: e2.veMs.v });
  const dvs = pieces.map((p) => p.ve * Math.log(p.full / p.empty));
  const total = dvs.reduce((a, v) => a + v, 0);
  const crew = s.crew, days = s.missionDays, L = LIFE_SUPPORT_LB;
  const isp1 = Math.round((e1.veMs.v / 9.81) * 10) / 10, isp2 = Math.round((e2.veMs.v / 9.81) * 10) / 10;
  // ---- #3 empty stage
  const m1 = MATERIALS[b.stage1.material], f1 = PROPELLANTS[e1.fuel];
  const liner1 = b.stage1.material === 'carbon' && sp.fixes.includes('liner') ? 1.1 : 1;
  const k1 = m1.k.v * f1.tankMult.v * liner1, eng1 = b.stage1.count * e1.weightLb.v;
  const tank1 = k1 * s1fuel, empty1 = tank1 + eng1, above1 = payload + s2full;
  const shares = deadWeightShares(empty1, s1fuel, above1);
  const p2 = pieces[pieces.length - 1], v2 = dvs[dvs.length - 1];
  const kept = keptShellDv(e2.veMs.v, p2.full, p2.empty, empty1);
  // ---- #7 fuel
  const vOthers2 = dvs.slice(0, -1).reduce((a, v) => a + v, 0), vOthers1 = total - dvs[dvs.length - 2];
  const eng2 = b.stage2.count * e2.weightLb.v;
  const st2 = { need: target - vOthers2, ve: e2.veMs.v, k: (s2empty - eng2) / Math.max(1, s2fuel), pushed: payload + eng2 };
  const st1 = { need: target - vOthers1, ve: e1.veMs.v, k: (s1empty - eng1) / Math.max(1, s1fuel), pushed: payload + s2full + eng1 };
  const sug2 = suggestFuel(Math.max(0, st2.need), st2.ve, st2.k, st2.pushed), sug1 = suggestFuel(Math.max(0, st1.need), st1.ve, st1.k, st1.pushed);
  const set2 = sug2.impossible || st2.need <= 0 ? null : settledFuel(d, 2, sug2.fuel);
  const set1 = sug1.impossible || st1.need <= 0 ? null : settledFuel(d, 1, sug1.fuel);
  // ---- #8 capsule
  const burnIn = s.propulsion.burns[0], burnHome = s.propulsion.burns[1];
  const cap = capsuleBurnMath(kgToLb(burnIn.m0), kgToLb(S.capsule.propKg), S.capsule.ve, burnIn.dv, burnHome?.dv ?? S.orbit.tei.v, burnHome ? kgToLb(burnHome.m0) : undefined);
  // ---- #11 power, #12 data, #13 signal, #14 shield, #15 money
  const sun = S.orbit.sunFraction.v, darkH = S.orbit.periodH.v * (1 - sun);
  const solar = s.power.genKind === 'solar';
  const panelW = solar ? s.power.genW : s.power.orbitAvgGenW;
  const stayH = d.plan.stayDays * 24;
  const pw = powerMath(panelW, solar ? sun : 1, s.power.peakLoadW, darkH, s.power.batteryWh, S.lander?.grossLoadW ?? 0, stayH);
  const kbps = s.comms.mbps * 1000, contact = S.orbit.contactFraction.v;
  const dm = dataMath(kbps, contact, S.data.needMbPerDay);
  const row = signalRow(S.orbit.id), delay = signalDelayS(row.miles.v);
  const sh = shieldMath(S.capsule.shieldMph);
  const groups = moneyGroups(s);
  const spent = groups.reduce((a, x) => a + x.value, 0);
  const left = S.budgetM * 1e6 - spent;

  const sheets: Sheet[] = [
    {
      id: 'liftoff', n: 1, title: 'WEIGHT AT LIFTOFF', question: 'How heavy is the whole rocket on the pad?',
      think: 'Like stepping on a scale with a full backpack: everything counts.',
      formula: 'weight at liftoff = payload + stage 2 (full) + stage 1 (full) + boosters',
      given: [`Payload (your spacecraft): ${fmt(payload)} lb`, `Stage 2: ${fmt(s2fuel)} lb fuel + ${fmt(s2empty)} lb empty`, `Stage 1: ${fmt(s1fuel)} lb fuel + ${fmt(s1empty)} lb empty`, bs ? `Boosters: ${nB} x ${fmt(bEach)} lb` : 'Boosters: none'],
      steps: [
        g('Stage 2 full', s2full, 'lb', 'A full stage is its fuel plus its empty tank and engines.'),
        g('Stage 1 full', s1full, 'lb', 'Same for stage 1: fuel plus empty.'),
        g('Boosters', boosters, 'lb', bs ? `${nB} boosters that weigh the same: ${nB} x ${fmt(bEach)}.` : 'No boosters on this rocket.'),
        add('Weight at liftoff', [{ label: 'Payload', value: payload }, { label: 'Stage 2 full', value: s2full }, { label: 'Stage 1 full', value: s1full }, { label: 'Boosters', value: boosters }], 'lb', 'Add everything that sits on the pad.'),
      ],
      target: 'Keep this number: thrust-to-weight (sheet 2) divides by it.',
      example: 'SLS-like with Orion: 63,400 + 70,929 + 2,355,250 + 3,200,000 = 5,689,579 lb.',
      verdict: () => ({ pass: true, text: `Weight at liftoff: ${fmt(W)} lb.` }),
    },
    {
      id: 'twr', n: 2, title: 'CAN IT LIFT OFF?', question: 'Do the engines push harder than gravity pulls?',
      think: 'Like lifting a box: push less than it weighs and it does not move.',
      formula: 'thrust-to-weight = total push (N) / weight at liftoff (N); it must be at least 1.2',
      given: [...pushLines.map((l) => `${l.label}: ${l.n} x ${fmt(l.each)} N`), `Weight at liftoff (sheet 1): ${fmt(W)} lb`],
      steps: [
        ...pushLines.map((l) => g(`Push from ${l.label}`, l.value, 'N', 'Every engine of a kind pushes the same, so the game multiplies by the count.')),
        add('Total push', pushLines.map((l) => ({ label: l.label, value: l.value })), 'N', 'Add every line of push.'),
        g('Weight in newtons = lb x 4.448', WN, 'N', 'A pound of weight pulls down with 4.448 newtons.'),
        g('Thrust-to-weight = push / weight', twr, '', 'Above 1.2 the rocket climbs; below 1 it sits on the pad.', 0.01),
      ],
      target: 'Thrust-to-weight of 1.2 or more.',
      example: 'SLS-like: 7,440,000 + 32,000,000 = 39,440,000 N; 25,307,000 N of weight; 1.56.',
      verdict: () => (twr >= MIN_LIFTOFF_TWR.v ? { pass: true, text: `${twr.toFixed(2)}: it lifts off.` } : { pass: false, text: `${twr.toFixed(2)}: it stays on the pad.`, pointer: 'Add stage 1 engines or boosters, or carry less.' }),
    },
    {
      id: 'empty', n: 3, title: 'EMPTY STAGE AND DEAD WEIGHT', question: 'When the fuel is gone, what is left, and when must it go?',
      think: 'Like an empty water bottle: a bigger bottle weighs more even empty.',
      formula: 'empty stage = k x fuel + engines (hydrogen tanks: k x 1.5)',
      given: [`Stage 1 tank: ${m1.name}, k = ${m1.k.v}${f1.tankMult.v !== 1 ? `; ${f1.short} x ${f1.tankMult.v}` : ''}${liner1 > 1 ? '; liner x 1.1' : ''}`, `Stage 1: ${fmt(s1fuel)} lb fuel, ${b.stage1.count} x ${fmt(e1.weightLb.v)} lb engines`, `Riding above stage 1: ${fmt(above1)} lb`],
      steps: [
        g('Tank = k x fuel', tank1, 'lb', 'k says how many pounds of tank each pound of fuel needs.'),
        g('Empty stage = tank + engines', empty1, 'lb', 'Add the engines to the empty tank.'),
        g('Dead weight at ignition', shares.ignition * 100, '%', 'At liftoff the empty stage is a small part of what flies.', 1),
        g('Dead weight at burnout', shares.burnout * 100, '%', 'With its fuel gone it is mostly dead weight: time to drop it.', 1),
        g('Stage 2 speed if stage 1 stayed on', kept, 'm/s', `Instead of ${fmt(v2)} m/s: that is why rockets drop stages.`),
      ],
      target: 'Smaller k means lighter tanks; drop each stage when it is empty.',
      example: 'SLS-like stage 1: 0.054 x 1.5 x 2,150,000 + 4 x 7,775 = 205,250 lb; 8% at ignition, 60% at burnout.',
      verdict: () => ({ pass: true, text: `Empty stage 1: ${fmt(empty1)} lb.` }),
    },
    {
      id: 've', n: 4, title: 'EXHAUST SPEED', question: 'How good is each engine at turning fuel into speed?',
      think: 'Like throwing balls off a skateboard: the faster you throw, the faster you roll.',
      formula: 'exhaust speed (m/s) = Isp x 9.81',
      given: [`Stage 1 ${e1.name.split(' (')[0]}: Isp ${isp1} s`, `Stage 2 ${e2.name.split(' (')[0]}: Isp ${isp2} s`],
      steps: [
        g(`Stage 1: ${isp1} x 9.81`, isp1 * 9.81, 'm/s', 'Maker sheets give Isp in seconds; x 9.81 turns it into m/s.'),
        g(`Stage 2: ${isp2} x 9.81`, isp2 * 9.81, 'm/s', 'Higher is better: more speed from every pound of fuel.'),
      ],
      target: 'Faster exhaust = more speed per pound of fuel.',
      example: 'RL10: about 4,530 m/s. RS-25: 4,010. Merlin 1D: 2,910.',
      verdict: () => ({ pass: true, text: `${fmt(e1.veMs.v)} and ${fmt(e2.veMs.v)} m/s.` }),
    },
    {
      id: 'rocketeq', n: 5, title: 'SPEED FROM EACH PIECE', question: 'If I burn all the fuel in this piece, how much faster do I go?',
      think: 'The skateboard again: more balls and faster throws mean more speed.',
      formula: 'speed gained (Δv) = exhaust speed x ln(full weight / empty weight)',
      given: pieces.map((p) => `${p.name}: full ${fmt(p.full)} lb, empty ${fmt(p.empty)} lb`),
      steps: pieces.flatMap((p, i) => {
        const ratio = p.full / p.empty, ln = Math.log(ratio);
        return [
          g(`${p.name}: full / empty`, ratio, '', 'How many times heavier the piece is full than empty.', 0.005),
          g(`${p.name}: ln of that`, ln, '', 'ln turns "how many times heavier" into speed gained.', 0.005),
          g(`${p.name}: x ${fmt(p.ve)} m/s exhaust`, dvs[i], 'm/s', 'Times the exhaust speed gives the speed gained.'),
        ];
      }),
      target: 'Each piece pushes everything above it.',
      example: 'SLS-like stage 2: 134,329 / 69,329 = 1.938; ln = 0.661; x 4,530 = 2,995 m/s.',
      verdict: () => ({ pass: true, text: pieces.map((p, i) => `${p.name} ${fmt(dvs[i])}`).join(', ') + ' m/s' }),
    },
    {
      id: 'moon', n: 6, title: 'ENOUGH TO REACH THE MOON?', question: 'Do the pieces add up to the speed the Moon needs?',
      think: '9,400 m/s gets you to Earth orbit; 3,200 more aims you at the Moon.',
      formula: `total speed = every piece added up; it must reach ${fmt(target)} m/s`,
      given: pieces.map((p, i) => `${p.name} (sheet 5): ${fmt(dvs[i])} m/s`),
      steps: [add('Total speed', pieces.map((p, i) => ({ label: p.name, value: dvs[i] })), 'm/s', 'Add the speed each piece gives.')],
      target: `${fmt(target)} m/s to reach the Moon.`,
      example: 'SLS-like: 1,680 + 7,990 + 2,995 = 12,665 m/s: pass, 65 to spare.',
      verdict: () => (total >= target
        ? { pass: true, text: `${fmt(total)} m/s: pass, ${fmt(total - target)} to spare.` }
        : { pass: false, text: `${fmt(total)} m/s: ${fmt(target - total)} m/s short.`, pointer: 'More stage 2 fuel (sheet 7) or a faster stage 2 engine.' }),
    },
    {
      id: 'fuel', n: 7, title: 'HOW MUCH FUEL YOU NEED', question: 'Working backwards: how much fuel gets each stage to the target?',
      think: 'Start from the speed you need and work back to pounds of fuel.',
      formula: 'R = e^(speed needed / exhaust speed); fuel = weight pushed x (R - 1) / (1 - k x (R - 1))',
      given: [`Stage 2 needs ${fmt(st2.need)} m/s; exhaust ${fmt(st2.ve)}; k ${st2.k.toFixed(3)}; pushes ${fmt(st2.pushed)} lb`, `Stage 1 needs ${fmt(st1.need)} m/s; exhaust ${fmt(st1.ve)}; k ${st1.k.toFixed(3)}; pushes ${fmt(st1.pushed)} lb`],
      steps: [
        g('Stage 2: R', sug2.R, '', 'R is how many times heavier the full stage must be than the empty one.', 0.01),
        ...(sug2.impossible ? [] : [g('Stage 2 fuel (one pass)', sug2.fuel, 'lb', 'Turn R into pounds, counting the tank\'s own weight.')]),
        g('Stage 1: R', sug1.R, '', 'Same for stage 1.', 0.01),
        ...(sug1.impossible ? [] : [g('Stage 1 fuel (one pass)', sug1.fuel, 'lb', 'More fuel in one stage slows the others...')]),
        ...(set2 ? [g('Stage 2 suggested (settled)', set2, 'lb', '...so the game repeats the formula until the stages agree.')] : []),
        ...(set1 ? [g('Stage 1 suggested (settled)', set1, 'lb', 'Press "Use this" to put it in your rocket.')] : []),
      ],
      extra: [`Your fuel now: stage 2 ${fmt(s2fuel)} lb, stage 1 ${fmt(s1fuel)} lb.`, ...(sug2.impossible || sug1.impossible ? ['× No amount of fuel works: add a stage or pick a lighter material.'] : [])],
      target: `Together the pieces must reach ${fmt(target)} m/s.`,
      example: 'Need 5,400 m/s, exhaust 3,050, k 0.065, pushing 26,455 lb: R = 5.87, fuel = 188,700 lb.',
      verdict: () => (sug2.impossible || sug1.impossible ? { pass: false, text: 'No amount of fuel works for one stage.', pointer: 'Add a stage or pick a lighter material.' } : { pass: true, text: set2 || set1 ? 'Suggestions ready: use them or keep yours.' : 'Both stages already have enough.' }),
      actions: [
        ...(set2 ? [{ label: `USE THIS: S2 ${fmt(set2)} LB`, apply: (dd: Design) => withStageFuel(dd, 2, set2) }] : []),
        ...(set1 ? [{ label: `USE THIS: S1 ${fmt(set1)} LB`, apply: (dd: Design) => withStageFuel(dd, 1, set1) }] : []),
      ],
    },
    {
      id: 'capsule', n: 8, title: 'THE CAPSULE\'S BURNS AT THE MOON', question: 'Enough fuel to get into lunar orbit AND back out?',
      think: 'Like a road trip where the only gas station is at home.',
      formula: 'fuel used = weight x (1 - e^(-speed / exhaust speed)); then speed gained with what is left',
      given: [`${S.capsule.name}: ${fmt(kgToLb(S.capsule.propKg))} lb fuel, exhaust ${fmt(S.capsule.ve)} m/s`, `Weight getting in: ${fmt(kgToLb(burnIn.m0))} lb${sp.architecture === 'apollo' && s.lander.present ? ' (with the lander)' : ''}`, `${S.orbit.id}: in ${S.orbit.loi.v} m/s, home ${S.orbit.tei.v} m/s`],
      steps: [
        g('Fuel used getting in', cap.used, 'lb', `Braking ${burnIn.dv} m/s into orbit burns this much.`),
        g('Fuel left', cap.left, 'lb', 'Whatever you burn getting there, you can\'t use coming back.'),
        g('Weight for the trip home', cap.home, 'lb', 'The lander stays behind; the rocks come aboard.'),
        g('Speed left for home', cap.dvLeft, 'm/s', 'The fuel left decides the speed for the trip home.'),
      ],
      extra: ['Orbit table: low orbit in 900 / home 900; halo in 430 / home 410 m/s.'],
      target: `At least ${fmt(cap.need)} m/s to get home.`,
      example: 'Orion, halo: 7,410 lb used, 820 m/s left: pass. Low orbit: 350 vs 900: stuck.',
      verdict: () => (cap.pass ? { pass: true, text: `${fmt(cap.dvLeft)} m/s: pass, ${fmt(cap.dvLeft - cap.need)} to spare.` } : { pass: false, text: `${fmt(cap.dvLeft)} m/s: the crew would be stuck.`, pointer: S.orbit.id === 'LLO' ? 'Halo orbit or a bigger capsule (Mission Style).' : 'A capsule with more fuel or a lighter stack.' }),
    },
    ...landerSheet(s, S),
    {
      id: 'supplies', n: 10, title: 'OXYGEN, WATER AND FOOD', question: 'How many pounds of supplies does the crew need?',
      think: 'About 15 lb per astronaut per day.',
      formula: 'supplies (lb) = crew x days x pounds per day, one line per supply',
      given: [`${crew} crew x ${fmt(days, 1)} days (3 out + ${S.orbit.waitDays.v} in orbit + ${d.plan.stayDays} on the Moon + 3 back)`, `Per day: oxygen ${L.oxygen.v}, drinking ${L.drinkingWater.v}, hygiene ${L.hygieneWater.v}, food ${L.food.v} lb`],
      steps: [
        g(`Oxygen: ${crew} x ${fmt(days, 1)} x ${L.oxygen.v}`, crew * days * L.oxygen.v, 'lb', 'Crew x days x pounds per day.'),
        g(`Drinking water: x ${L.drinkingWater.v}`, crew * days * L.drinkingWater.v, 'lb', 'At least 2.5 liters a day each.'),
        g(`Hygiene water: x ${L.hygieneWater.v}`, crew * days * L.hygieneWater.v, 'lb', 'Washing and cleaning.'),
        g(`Food: x ${L.food.v}`, crew * days * L.food.v, 'lb', 'Packaged meals.'),
        add('Total supplies', [{ label: 'Oxygen', value: crew * days * L.oxygen.v }, { label: 'Drinking', value: crew * days * L.drinkingWater.v }, { label: 'Hygiene', value: crew * days * L.hygieneWater.v }, { label: 'Food', value: crew * days * L.food.v }], 'lb', 'Add the four supplies.'),
      ],
      target: `Days must fit the capsule: ${S.capsule.maxDays} days.`,
      example: '4 crew x 17.5 days: 140 + 385 + 154 + 369 = 1,048 lb.',
      verdict: () => (days <= S.capsule.maxDays ? { pass: true, text: `${fmt(days, 1)} days fits the ${S.capsule.maxDays}-day capsule.` } : { pass: false, text: `${fmt(days, 1)} days is over the capsule's ${S.capsule.maxDays}.`, pointer: 'Shorten the stay or pick a longer-rated capsule.' }),
    },
    {
      id: 'power', n: 11, title: 'POWER AND BATTERIES', question: 'Enough power, and a battery for the dark?',
      think: 'A 5,000 Wh battery runs a 1,000 W load for 5 hours.',
      formula: 'power made = panel watts x sunlight; battery = watts x dark hours x 1.2',
      given: [solar ? `Panels ${fmt(panelW)} W; sunlight in ${S.orbit.id}: ${sun}` : `Fuel cells ${fmt(panelW)} W, day and night`, `Used: ${fmt(s.power.peakLoadW)} W; battery ${fmt(s.power.batteryWh)} Wh; dark ${darkH.toFixed(2)} h per orbit`],
      steps: [
        g('Power made', pw.made, 'W', 'Panels only work in sunlight, so x the sunlight fraction.'),
        g('Battery needed for the dark', pw.eclipseWh, 'Wh', 'The battery carries the load through the dark, plus 20% spare.'),
        ...(s.lander.present ? [g('Lander surface battery', pw.surfaceWh, 'Wh', `${pw.packs} packs of 5 kWh, or the surface solar array in daylight.`)] : []),
      ],
      target: 'Made at least what is used; battery covers the dark.',
      example: 'Orion: 11,000 W x 0.99 = 10,890 W vs 3,482 W used. Lander, 2 days: 69,120 Wh = 14 packs.',
      verdict: () => (pw.pass && pw.batteryOk ? { pass: true, text: `${fmt(pw.made)} W made, battery OK.` } : { pass: false, text: !pw.pass ? 'The panels cannot keep up.' : 'The battery runs out in the dark.', pointer: !pw.pass ? 'Bigger solar arrays (Power tab).' : 'A bigger battery (Batteries tab).' }),
    },
    {
      id: 'data', n: 12, title: 'DATA SENT HOME', question: 'Can the radio send home everything the mission makes?',
      think: '86,400 seconds in a day; 8,000 turns kilobits into megabytes.',
      formula: 'MB per day = kbps x 86,400 x contact / 8,000',
      given: [`Radio ${fmt(kbps)} kbps; contact in ${S.orbit.id}: ${contact}`, `Needed: 300 MB/day + instruments = ${fmt(dm.need)} MB/day`],
      steps: [g('MB per day sent home', dm.mb, 'MB', 'Radio speed x seconds in a day, while Earth is in view.')],
      target: `At least ${fmt(dm.need)} MB per day.`,
      example: '256 kbps x 86,400 x 1.0 / 8,000 = 2,765 MB/day.',
      verdict: () => (S.data.mbPerDay >= dm.need ? { pass: true, text: 'The radio keeps up.' } : { pass: false, text: 'Data will pile up and be lost.', pointer: 'Ka-band or laser comms (Communications tab).' }),
    },
    {
      id: 'signal', n: 13, title: 'SIGNAL DELAY', question: 'How long does a radio message take?',
      think: 'Radio travels at the speed of light: 186,282 miles every second.',
      formula: 'seconds = miles / 186,282',
      given: [`${row.where}: ${fmt(row.miles.v)} miles (the right row for ${S.orbit.id})`, 'Other rows: low Earth orbit 47,000; Moon closest 225,700; farthest 252,000; halo far end 282,000'],
      steps: [
        g('One way', delay, 's', `${fmt(row.miles.v)} / ${fmt(LIGHT_MILES_PER_S.v)}.`, 0.01),
        g('Question and answer', 2 * delay, 's', 'There and back, plus thinking time.', 0.02),
      ],
      target: 'Mission control is always a little behind.',
      example: '238,855 / 186,282 = 1.28 s one way.',
      verdict: () => ({ pass: true, text: `${delay.toFixed(2)} s one way.` }),
    },
    {
      id: 'shield', n: 14, title: 'HEAT SHIELD', question: 'Is the shield rated for a return from the Moon?',
      think: 'Orion hit the air at 24,400+ mph on Artemis I; the shield reached 5,000°F.',
      formula: 'shield health = rating / 24,400 mph (max 100%)',
      given: [`${S.capsule.name}: rated ${fmt(S.capsule.shieldMph)} mph`],
      steps: [g('Shield health', sh.health, '%', '100% safe; 90-99% rough ride (-10 safety); under 90% burn-through.', 0.5)],
      target: '100% for a smooth ride; at least 90% to survive.',
      example: 'Orion (25,000 mph) = 100%. Budget capsule (17,500) = 72%: fails.',
      verdict: () => (sh.result === 'safe' ? { pass: true, text: 'Safe, smooth landing.' } : sh.result === 'rough' ? { pass: true, text: 'Rough ride: -10 safety.' } : { pass: false, text: 'Burn-through.', pointer: 'A lunar-rated capsule (Mission Style).' }),
    },
    {
      id: 'money', n: 15, title: 'MONEY', question: 'Is there money left, or is launch locked?',
      think: 'Every part drops the budget meter; at $0 launch is locked.',
      formula: 'money left = budget - everything spent',
      given: [`Budget (${sp.difficulty === 'hard' ? 'Hard' : 'Easy'}${sp.role === 'commander' ? ', Commander +5%' : ''}): ${fmtUsdM(S.budgetM)}`],
      steps: [
        add('Total spent', groups, 'USD', 'Add the receipt lines.'),
        g('Money left = budget - spent', left, 'USD', left > 0 ? 'Above $0: you can launch.' : 'At $0 or below, launch is locked.'),
      ],
      target: 'Money left above $0.',
      example: 'Launch ops: $5,000,000 per launch; supplies: $20,000 per crew-day.',
      verdict: () => (left > 0 ? { pass: true, text: `${fmtUsd(left)} left.` } : { pass: false, text: `Locked: ${fmtUsd(-left)} over.`, pointer: `Change the biggest line: ${groups.slice().sort((a, c) => c.value - a.value)[0].label}.` }),
    },
  ];
  return sheets.map((x) => ({ ...x, game: !x.steps.some((st) => st.kind === 'add') })).sort((a, c) => a.n - c.n);

  function landerSheet(ss: DesignStats, SS: NonNullable<DesignStats['spec']>): Sheet[] {
    const lc = ss.parts.find((p) => p.slot === 'lander');
    if (!lc || !SS.lander) return [];
    const crewLb = kgToLb(ss.landingCrew * CREW_MASS_KG), arrival = kgToLb(SS.lander.arrivalPropKg);
    const fullD = kgToLb(ss.mass.landerWetKg) - arrival + crewLb, emptyD = fullD - (kgToLb(lc.descentPropKg!) - arrival);
    const fullA = kgToLb(lc.ascentDryKg! + lc.ascentPropKg!) + crewLb + kgToLb(ss.lander.sampleCapacityKg), emptyA = fullA - kgToLb(lc.ascentPropKg!);
    const ve = lc.ispS! * 9.80665;
    const down = landerBurnMath(fullD, emptyD, ve, ss.lander.descentDvReq, lc.thrustN!);
    const up = landerBurnMath(fullA, emptyA, ve, ss.lander.ascentDvReq, lc.ascentThrustN ?? lc.thrustN!);
    return [{
      id: 'lander', n: 9, title: 'LANDING AND LIFTING OFF', question: 'Can the lander get down, back up, and beat Moon gravity?',
      think: 'Two rocket equations: the descent stage down, the ascent stage up.',
      formula: 'speed gained = exhaust speed x ln(full / empty); Moon thrust-to-weight = N / (lb x 4.448 x 0.165)',
      given: [`${lc.name}: exhaust ${fmt(ve)} m/s; ${fmt(lc.thrustN!)} N down, ${fmt(lc.ascentThrustN ?? lc.thrustN!)} N up`, `Down: ${fmt(fullD)} lb full, ${fmt(emptyD)} lb empty`, `Up: ${fmt(fullA)} lb full (with rocks), ${fmt(emptyA)} lb empty`],
      steps: [
        g('Speed going down', down.dv, 'm/s', `Needs ${fmt(down.need)} m/s from ${SS.orbit.id}.`),
        g('Speed going up', up.dv, 'm/s', `Needs ${fmt(up.need)} m/s; rocks make it heavier.`),
        g('Moon thrust-to-weight, down', down.twrMoon, '', 'Above 1, the engine can hold the lander up in Moon gravity.', 0.01),
        g('Moon thrust-to-weight, up', up.twrMoon, '', 'Moon gravity is 0.165 of Earth\'s.', 0.01),
      ],
      extra: [`${ok(down.pass)} down  ${ok(up.pass)} up  ${ok(down.lifts && up.lifts)} thrust`],
      target: `Down ${fmt(ss.lander.descentDvReq)} and up ${fmt(ss.lander.ascentDvReq)} m/s; thrust-to-weight 1+.`,
      example: 'Apollo LM up: 3,050 x ln(11,200 / 6,013) = 1,898 m/s vs 1,870. TWR 1.89.',
      verdict: () => (down.pass && up.pass && down.lifts && up.lifts ? { pass: true, text: 'It can land and lift off.' } : { pass: false, text: !down.pass ? `Down ${fmt(down.need - down.dv)} m/s short.` : !up.pass ? `Up ${fmt(up.need - up.dv)} m/s short.` : 'Engine too weak for Moon gravity.', pointer: SS.orbit.id === 'NRHO' ? 'The halo orbit needs a big lander.' : 'Fewer rocks or a bigger lander.' }),
    }];
  }
}

/** Sheet 15's receipt in up to 5 lines the player can add: rocket, capsule, lander, other parts, supplies and operations. */
export function moneyGroups(s: DesignStats): { label: string; value: number }[] {
  const lines = s.costLines;
  const pick = (re: RegExp) => lines.filter((l) => re.test(l.label)).reduce((a, l) => a + l.m, 0);
  const rocket = pick(/rocket/i), capsule = s.spec ? pick(new RegExp(s.spec.capsule.name.replace(/[()]/g, '.'))) : 0;
  const lander = s.parts.filter((p) => p.slot === 'lander').reduce((a, p) => a + lines.filter((l) => l.ids.includes(p.id) && l.ids.length === 1).reduce((x, l) => x + l.m, 0), 0);
  const opsSupplies = pick(/Launch operations|Crew supplies/);
  const total = lines.reduce((a, l) => a + l.m, 0);
  const others = total - rocket - capsule - lander - opsSupplies;
  return [
    { label: 'Rocket', value: Math.round(rocket * 1e6) },
    { label: 'Capsule', value: Math.round(capsule * 1e6) },
    ...(lander ? [{ label: 'Lander', value: Math.round(lander * 1e6) }] : []),
    { label: 'Other parts', value: Math.round(others * 1e6) },
    { label: 'Launch ops + supplies', value: Math.round(opsSupplies * 1e6) },
  ];
}

/**
 * Final Results board (spec tab 6): every answer in one place, in the spec's sections:
 * rocket, speed, fuel, Moon burns, crew supplies, power and data, signal, heat shield, money.
 */
export function resultsBoard(d: Design, s: DesignStats): { section: string; rows: { label: string; value: string; ok?: boolean }[] }[] {
  const S = s.spec!, R = S.rocket, b = S.rocketBuild;
  const L = LIFE_SUPPORT_LB, crew = s.crew, days = s.missionDays;
  const row = signalRow(S.orbit.id);
  const left = S.budgetM - s.costM;
  const lines = s.costLines.slice().sort((a, c) => c.m - a.m);
  const sun = S.orbit.sunFraction.v, darkH = S.orbit.periodH.v * (1 - sun);
  const eclipseWh = s.power.peakLoadW * darkH * BATTERY_MARGIN.v;
  const sug = (stage: 1 | 2) => settledFuel(d, stage, stage === 1 ? b.stage1.fuelLb : b.stage2.fuelLb);
  const s1 = sug(1), s2 = sug(2);
  const sh = shieldMath(S.capsule.shieldMph);
  return [
    { section: 'ROCKET', rows: [
      { label: 'Weight at liftoff', value: `${fmt(kgToLb(R.liftoffKg))} lb` },
      { label: 'Total push', value: `${fmt(R.pushN)} N` },
      { label: 'TWR (>= 1.2)', value: R.twr.toFixed(2), ok: R.liftsOff },
    ] },
    { section: 'SPEED', rows: [
      ...R.pieces.map((p) => ({ label: `V ${p.name.toLowerCase()}`, value: `${fmt(p.dv)} m/s` })),
      { label: `Total vs ${fmt(R.target)}`, value: `${fmt(R.dvTotal)} m/s`, ok: R.reachesMoon },
      { label: 'Spare speed', value: `${R.spare >= 0 ? '+' : ''}${fmt(R.spare)} m/s`, ok: R.spare >= 0 },
    ] },
    { section: 'FUEL (YOURS VS SUGGESTED)', rows: [
      { label: 'Stage 1', value: `${fmt(b.stage1.fuelLb)} lb vs ${s1 ? `${fmt(s1)} lb` : 'no amount works'}`, ok: s1 !== null && b.stage1.fuelLb >= s1 * 0.99 },
      { label: 'Stage 2', value: `${fmt(b.stage2.fuelLb)} lb vs ${s2 ? `${fmt(s2)} lb` : 'no amount works'}`, ok: s2 !== null && b.stage2.fuelLb >= s2 * 0.99 },
    ] },
    { section: 'MOON BURNS', rows: [
      { label: `Capsule in (${S.orbit.id}, ${S.orbit.loi.v} m/s)`, value: `${fmt(kgToLb(S.capsuleReturn.usedInKg))} lb used`, ok: S.capsuleReturn.leftKg >= 0 },
      { label: `Capsule home (${S.orbit.tei.v} m/s)`, value: `${fmt(S.capsuleReturn.dvLeft)} m/s left`, ok: S.capsuleReturn.pass },
      ...(s.lander.present ? [
        { label: 'Lander down', value: `${fmt(s.lander.descentDvAvail)} / ${fmt(s.lander.descentDvReq)} m/s`, ok: s.lander.descentDvAvail >= s.lander.descentDvReq },
        { label: 'Lander up', value: `${fmt(s.lander.ascentDvAvail)} / ${fmt(s.lander.ascentDvReq)} m/s`, ok: s.lander.ascentDvAvail >= s.lander.ascentDvReq },
      ] : []),
    ] },
    { section: 'CREW SUPPLIES', rows: [
      { label: 'Oxygen', value: `${fmt(crew * days * L.oxygen.v)} lb` },
      { label: 'Drinking water', value: `${fmt(crew * days * L.drinkingWater.v)} lb` },
      { label: 'Hygiene water', value: `${fmt(crew * days * L.hygieneWater.v)} lb` },
      { label: 'Food', value: `${fmt(crew * days * L.food.v)} lb` },
      { label: `Total (${crew} crew x ${fmt(days, 1)} d)`, value: `${fmt(crew * days * (L.oxygen.v + L.drinkingWater.v + L.hygieneWater.v + L.food.v))} lb` },
    ] },
    { section: 'POWER AND DATA', rows: [
      { label: 'Watts made vs used', value: `${fmt(s.power.orbitAvgGenW)} / ${fmt(s.power.peakLoadW)} W`, ok: s.power.orbitAvgGenW >= s.power.nominalLoadW },
      { label: 'Battery vs dark need', value: `${fmt(s.power.batteryWh)} / ${fmt(eclipseWh)} Wh`, ok: s.power.batteryWh >= eclipseWh },
      { label: 'MB per day home', value: `${fmt(S.data.mbPerDay)} / ${fmt(S.data.needMbPerDay)} MB`, ok: S.data.mbPerDay >= S.data.needMbPerDay },
    ] },
    { section: 'SIGNAL', rows: [
      { label: 'Miles used', value: `${fmt(row.miles.v)} mi (${row.where.split(',')[0]})` },
      { label: 'Delay one way', value: `${signalDelayS(row.miles.v).toFixed(2)} s` },
    ] },
    { section: 'HEAT SHIELD', rows: [
      { label: `Health at re-entry (${fmt(S.capsule.shieldMph)} mph)`, value: `${Math.round(sh.health)}% ${sh.result}`, ok: sh.health >= 90 },
    ] },
    { section: 'MONEY', rows: [
      { label: 'Budget', value: fmtUsdM(S.budgetM) },
      { label: 'Spent', value: fmtUsdM(s.costM) },
      { label: 'Left', value: fmtUsdM(left), ok: left > 0 },
      ...lines.slice(0, 4).map((l) => ({ label: `  ${l.label.split(' (')[0]}`, value: fmtUsdM(l.m) })),
      ...(lines.length > 4 ? [{ label: `  ${lines.length - 4} more items`, value: fmtUsdM(lines.slice(4).reduce((a, l) => a + l.m, 0)) }] : []),
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
