/**
 * B1 (JOSEPH_SPEC_V2): the Calculation Desk as five sheets instead of fifteen. The game still works
 * everything out; each sheet asks one plain question and ends with one big verdict in plain words.
 * The player does one easy addition on sheets 1, 2, 4 and 5 (numbers provided).
 *
 * The fifteen detailed sheets (buildSheets) stay the source of every number, so the PART C tests
 * keep checking the same maths; this file only groups their steps.
 */
import type { Design } from '../data/mission';
import { DOCKING_FUEL_LB, MIN_UPPER_TWR } from '../data/specParts';
import { ISS, isIss, missionCfg } from '../data/missionConfig';
import { DOCK_START_M, NUDGE_FUEL_LB } from './docking';
import { plannedMin } from './spacewalk';
import { kgToLb } from './units';
import { buildSheets, Sheet, Step } from './calcDesk';
import { weightN } from './formulas';
import type { DesignStats } from './spacecraft';
import { fmt } from './units';

const toGame = (st: Step): Step => (st.kind === 'add' ? { ...st, kind: 'game', addends: undefined, explain: st.explain ?? '' } : st);
const g = (label: string, expect: number, unit: string, explain: string, abs?: number): Step => ({ kind: 'game', label, expect, unit, explain, abs, why: '' });

type Verdict = ReturnType<Sheet['verdict']>;
/** One verdict for a group of checks: FAIL with the first failure and what to change, else PASS. */
function combine(parts: Verdict[], passText: string): Verdict {
  const bad = parts.find((v) => !v.pass);
  return bad ? { pass: false, text: `FAIL: ${bad.text}`, pointer: bad.pointer } : { pass: true, text: `PASS: ${passText}` };
}

export function buildFiveSheets(d: Design, s: DesignStats): Sheet[] {
  const all = buildSheets(d, s);
  const by = (id: string) => all.find((x) => x.id === id);
  const S = s.spec!, R = S.rocket;
  const iss = isIss(d); // the ISS mission swaps sheets 2-5 for its own questions
  const liftoff = by('liftoff')!, twr = by('twr')!, empty = by('empty')!, ve = by('ve')!, eq = by('rocketeq')!, moon = by('moon')!, fuel = by('fuel')!;
  const capsule = by('capsule')!, lander = by('lander'), shield = by('shield')!;
  const supplies = by('supplies')!, power = by('power')!, data = by('data')!, signal = by('signal')!, money = by('money')!;

  // ---- 1. Can it lift off? (old 1 + 2, plus the upper-stage push)
  const s2StartN = weightN(R.payloadKg + R.stage2.fullKg);
  const upOk = R.upperTwr >= MIN_UPPER_TWR.v;
  const sheet1: Sheet = {
    id: 'liftoff', n: 1, title: 'CAN IT LIFT OFF?', question: 'Do the engines push harder than gravity pulls, at liftoff and up high?',
    think: 'Like lifting a box: push less than it weighs and it does not move.',
    formula: 'thrust-to-weight = total push / weight; at least 1.2 at liftoff and 0.3 for stage 2',
    formulaEngineer: 'TWR = F / (m x 4.448 N/lb) >= 1.2; F2 / W2 >= 0.3',
    given: [...liftoff.given, ...twr.given.slice(0, -1)],
    steps: [
      ...liftoff.steps, // the player adds the 4 weights
      ...twr.steps.map(toGame),
      g('Stage 2 push', R.stage2.thrustN, 'N', 'Stage 2 lights after stage 1 drops away.'),
      g('Stage 2 starting weight', s2StartN, 'N', 'Your spacecraft plus a full stage 2, in newtons.'),
      g('Stage 2 push / weight', R.upperTwr, '', upOk ? 'Strong enough to keep climbing.' : d.spec?.rocket ? 'Too weak: the stage wastes fuel fighting gravity.' : 'Under 0.3: a real stage loses a little fuel to gravity. The game leaves that out.', 0.01),
    ],
    target: `Thrust-to-weight 1.2+ at liftoff; stage 2 at ${MIN_UPPER_TWR.v}+.`,
    example: liftoff.example,
    verdict: () => {
      const t = twr.verdict();
      if (!t.pass) return { pass: false, text: `FAIL: ${t.text}`, pointer: t.pointer };
      if (upOk) return { pass: true, text: `PASS: ${R.twr.toFixed(2)} at liftoff, stage 2 at ${R.upperTwr.toFixed(2)}.` };
      // custom rockets can add stage 2 engines; presets cannot, and the game does not charge the loss
      return d.spec?.rocket
        ? { pass: true, text: `PASS, with a warning: stage 2 is only ${R.upperTwr.toFixed(2)} (needs ${MIN_UPPER_TWR.v}): it wastes fuel fighting gravity.`, pointer: 'Add stage 2 engines or pick a stronger one.' }
        : { pass: true, text: `PASS: ${R.twr.toFixed(2)} at liftoff. Stage 2 is ${R.upperTwr.toFixed(2)}, under the ${MIN_UPPER_TWR.v} rule of thumb; the game leaves that small loss out.` };
    },
  };

  // ---- 2. Can it reach the Moon? (old 3, 4, 5, 6, 7)
  const spare = R.dvTotal - R.target;
  const thin = spare >= 0 && spare < 0.03 * R.target;
  const sheet2: Sheet = {
    id: 'moon', n: 2, title: iss ? 'CAN IT REACH THE STATION?' : 'CAN IT REACH THE MOON?', question: iss ? 'Do the pieces add up to the 9,400 m/s low orbit needs?' : 'Do the pieces add up to the speed the Moon needs?',
    think: 'Throwing balls off a skateboard: more balls and faster throws mean more speed.',
    formula: `speed gained (Δv) = exhaust speed x ln(full weight / empty weight); total must reach ${fmt(R.target)} m/s`,
    formulaEngineer: `Δv = ve x ln(m0 / mf); ve = Isp x 9.81; sum of Δv >= ${fmt(R.target)} m/s`,
    given: [...ve.given, ...eq.given],
    steps: [
      ...ve.steps,
      ...eq.steps,
      ...moon.steps, // the player adds the 3 speeds
      g('Spare speed', spare, 'm/s', spare >= 0 ? 'What is left over for surprises.' : 'Negative: the rocket falls short.'),
      ...empty.steps.slice(2), // dead weight at ignition / burnout, and the kept-shell speed
      ...fuel.steps.filter((st) => /suggested/.test(st.label)),
    ],
    extra: fuel.extra,
    actions: fuel.actions,
    target: `${fmt(R.target)} m/s to reach ${iss ? 'the ISS' : 'the Moon'}.`,
    example: moon.example,
    verdict: () => {
      const v = moon.verdict(), f = fuel.verdict();
      if (!v.pass) return { pass: false, text: `FAIL: ${fmt(R.target)} needed, ${fmt(R.dvTotal)} available.`, pointer: v.pointer ?? f.pointer };
      return { pass: true, text: `PASS: ${fmt(spare)} m/s to spare${thin ? ' (thin: one engine problem could end the mission)' : ''}.` };
    },
  };

  // ---- 3. Can it get there and back? (old 8, 9, 14; watch only)
  const parts3 = [capsule, ...(lander ? [lander] : []), shield];
  const cap = S.capsuleReturn;
  const sheet3: Sheet = {
    id: 'thereback', n: 3, title: 'CAN IT GET THERE AND BACK?', question: 'Enough fuel to get into lunar orbit, land, lift off, come home, and survive re-entry?',
    think: 'A road trip where the only gas station is at home.',
    formula: 'fuel used = weight x (1 - e^(-speed / exhaust speed)); shield health = rating / 24,400 mph',
    formulaEngineer: 'mp = m0 x (1 - e^(-Δv / ve)); TWR(Moon) = F / (W x 0.165); health = rating / 24,400',
    given: parts3.flatMap((x) => x.given),
    steps: parts3.flatMap((x) => x.steps).map(toGame),
    extra: parts3.flatMap((x) => x.extra ?? []),
    target: `Home ${fmt(cap.need)} m/s; lander down and up; shield 100%.`,
    example: capsule.example,
    verdict: () => combine(parts3.map((x) => x.verdict()), `${fmt(cap.dvLeft - cap.need)} m/s spare for the trip home; the shield is rated for it.`),
  };

  // ---- 4. Can the crew survive? (old 10, 11)
  const sheet4: Sheet = {
    id: 'crew', n: 4, title: 'CAN THE CREW SURVIVE?', question: 'Enough oxygen, water, food and power for every day?',
    think: 'About 15 lb of supplies per astronaut per day, and a battery for the dark.',
    formula: 'supplies = crew x days x pounds per day; battery = watts x dark hours x 1.2',
    formulaEngineer: 'lb = n x d x (2.0 + 5.5 + 2.2 + 5.27); Wh = P x t(dark) x 1.2; P(made) = P(panel) x f(sun)',
    given: [...supplies.given, ...power.given],
    steps: [...supplies.steps, ...power.steps], // the player adds the 4 supply lines
    target: `${supplies.target} Power made >= power used.`,
    example: supplies.example,
    verdict: () => combine([supplies.verdict(), power.verdict()], `${fmt(s.missionDays, 1)} days fits the capsule, and power keeps up.`),
  };

  // ---- 5. Can we talk to them and afford it? (old 12, 13, 15)
  const sheet5: Sheet = {
    id: 'talk', n: 5, title: 'CAN WE TALK AND AFFORD IT?', question: 'Does the data get home, how late are the messages, and is there money left?',
    think: 'Radio travels at the speed of light; every part drops the budget meter.',
    formula: 'MB per day = kbps x 86,400 x contact / 8,000; seconds = miles / 186,282; money left = budget - spent',
    formulaEngineer: 'MB/d = kbps x 86,400 x f(contact) / 8,000; t = d / c; left = budget - sum(spent)',
    given: [...data.given, signal.given[0], ...money.given],
    steps: [...data.steps, ...signal.steps, ...money.steps], // the player adds the receipt
    target: `${data.target} Money left above $0.`,
    example: money.example,
    verdict: () => {
      const v = combine([data.verdict(), money.verdict()], `${money.verdict().text} Messages take ${signal.steps[0].expect.toFixed(2)} s each way.`);
      return v;
    },
  };
  const five = iss ? [sheet1, sheet2, ...issSheets(d, s, supplies, power, data, money)] : [sheet1, sheet2, sheet3, sheet4, sheet5];
  return five.map((x) => ({ ...x, game: !x.steps.some((st) => st.kind === 'add') }));
}

/** E4: ISS sheets 3-5 (catch and dock; breathe and survive; talk and afford it). */
function issSheets(d: Design, s: DesignStats, supplies: Sheet, power: Sheet, data: Sheet, money: Sheet): Sheet[] {
  const S = s.spec!;
  const capLb = kgToLb(s.mass.csmWetKg), ve = S.capsule.ve, fuelLb = kgToLb(S.capsule.propKg);
  const phasingLb = capLb * (1 - Math.exp(-ISS.phasingDv.v / ve));
  const homeLb = (capLb - phasingLb) * (1 - Math.exp(-ISS.deorbitDv.v / ve));
  const leftLb = fuelLb - phasingLb - homeLb;
  const rcsLb = kgToLb(S.rcs.fuelKg);
  const dockNeed = Math.max(DOCKING_FUEL_LB.v, (DOCK_START_M / 10) * NUDGE_FUEL_LB) * 2; // about 12 nudges, doubled for spare
  const hard = d.spec?.difficulty === 'hard';
  const o2 = ISS.suitO2Hours.v * 60, plan = plannedMin('power', 'double', hard), spareMin = o2 - plan;
  const delay = missionCfg(d).signalMiles.v / 186_282;
  const sheet3: Sheet = {
    id: 'issdock', n: 3, title: 'CAN WE CATCH THE STATION AND DOCK?', question: 'Enough fuel to catch up, dock, and still come home?',
    think: 'Like catching a bus: speed up a little, then stop gently at the door.',
    formula: 'fuel used = weight x (1 - e^(-speed / exhaust speed)); docking uses thruster fuel',
    formulaEngineer: 'mp = m0 x (1 - e^(-Δv/ve)); Δv(phasing) 60 + Δv(de-orbit) 90 m/s; RCS >= 2 x docking need',
    given: [`${S.capsule.name}: ${fmt(capLb)} lb, ${fmt(fuelLb)} lb fuel, exhaust ${fmt(ve)} m/s`, `Thruster fuel: ${fmt(rcsLb)} lb`],
    steps: [
      g('Fuel to catch up (60 m/s)', phasingLb, 'lb', 'About a day of small burns to close the gap.'),
      g('Fuel to come home (90 m/s)', homeLb, 'lb', 'The burn that drops you out of orbit.'),
      g('Service fuel left', leftLb, 'lb', leftLb >= 0 ? 'What is left after both burns.' : 'Negative: not enough fuel.'),
      g('Thruster fuel for docking, with spare', dockNeed, 'lb', 'Every nudge on the approach uses thruster fuel.'),
    ],
    target: `Fuel left above 0; thruster fuel at least ${fmt(dockNeed)} lb.`,
    verdict: () => (leftLb < 0 ? { pass: false, text: `FAIL: ${fmt(-leftLb)} lb of fuel short.`, pointer: 'A capsule with more service-module fuel.' }
      : rcsLb < dockNeed ? { pass: false, text: `FAIL: ${fmt(rcsLb)} lb of thruster fuel; docking needs ${fmt(dockNeed)}.`, pointer: 'A bigger thruster tank.' }
      : { pass: true, text: `PASS: ${fmt(leftLb)} lb of fuel and ${fmt(rcsLb - dockNeed)} lb of thruster fuel to spare.` }),
  };
  const sheet4: Sheet = {
    id: 'issbreathe', n: 4, title: 'CAN THE SPACEWALKER BREATHE?', question: 'Does the suit last the whole job, and does the crew have supplies?',
    think: 'A spacesuit is a tiny spaceship: about 8 hours of oxygen.',
    formula: 'spare = suit oxygen - (moves + swap + unfold); keep 30 minutes; supplies = crew x days x pounds per day',
    formulaEngineer: `t(spare) = ${o2} - ${plan} min >= 30; lb = n x d x 14.97`,
    given: [`Suit oxygen: ${ISS.suitO2Hours.v} hours = ${o2} minutes`, ...supplies.given],
    steps: [
      g('Planned spacewalk (power tool, double tether)', plan, 'min', 'Twelve handrail moves, the swap and the unfold.'),
      g('Suit oxygen spare', spareMin, 'min', spareMin >= ISS.evaReserveMin.v ? 'More than the 30-minute reserve.' : 'Under the 30-minute reserve.'),
      ...supplies.steps, // the player adds the 4 supply lines
      ...power.steps,
    ],
    target: `${ISS.evaReserveMin.v} min of suit oxygen spare; supplies for ${fmt(s.missionDays, 1)} days.`,
    verdict: () => (spareMin < ISS.evaReserveMin.v ? { pass: false, text: `FAIL: only ${fmt(spareMin)} min spare.`, pointer: 'Use the power tool and fewer moves.' }
      : { pass: true, text: `PASS: ${fmt(spareMin)} min of suit oxygen spare.` }),
  };
  const sheet5: Sheet = {
    id: 'isstalk', n: 5, title: 'CAN WE TALK AND AFFORD IT?', question: 'How late are messages, and is there money left?',
    think: 'Messages go up to a relay satellite and back down.',
    formula: 'seconds = miles / 186,282; money left = budget - spent',
    formulaEngineer: 't = 47,000 / 186,282; left = budget - sum(spent)',
    given: [missionCfg(d).signalWhy, ...money.given],
    steps: [
      ...data.steps,
      g('Signal delay one way', delay, 's', 'Short: mission control can talk you through the spacewalk.', 0.01),
      ...money.steps, // the player adds the receipt
    ],
    target: 'Money left above $0.',
    verdict: () => { const v = money.verdict(); return v.pass ? { pass: true, text: `PASS: ${v.text} Messages take ${delay.toFixed(2)} s.` } : { pass: false, text: `FAIL: ${v.text}`, pointer: v.pointer }; },
  };
  return [sheet3, sheet4, sheet5];
}
