/**
 * The Calculation Desk (JOSEPH_SPEC tab 6): formula sheets with the player's own numbers filled in,
 * blanks to solve step by step, a target, and a Final Results board. Pure: no Phaser.
 * Minimum set for the hackathon build: sheets 1, 2, 4, 5, 6 and 10 (+ the board).
 * Given numbers are shown in the spec's units (lb, N, m/s). Answers are accepted within ±1% (±0.01
 * for TWR and ln values).
 */
import type { Design } from '../data/mission';
import { LB_TO_N, LIFE_SUPPORT_LB, MISSION_DV, MIN_LIFTOFF_TWR, SIGNAL_DISTANCES, ENGINE_BY_ID, BOOSTER_BY_ID } from '../data/specParts';
import { mbPerDay, signalDelayS } from './formulas';
import type { DesignStats } from './spacecraft';
import { fmt, fmtUsdM, kgToLb } from './units';

export interface Step { label: string; expect: number; unit: string; abs?: number; why: string }
export interface Sheet {
  id: string; n: number; title: string; question: string; think: string; formula: string;
  given: string[]; steps: Step[]; target: string; example?: string;
  /** After all steps: is the answer good for the mission, and (Easy) which part to change. */
  verdict: () => { pass: boolean; text: string; pointer?: string };
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
  ].map((sh) => ({ ...sh, given: sh.given.filter(Boolean) }));
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
