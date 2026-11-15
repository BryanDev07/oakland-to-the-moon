/**
 * B1 (JOSEPH_SPEC_V2): the Calculation Desk as five sheets instead of fifteen. The game still works
 * everything out; each sheet asks one plain question and ends with one big verdict in plain words.
 * The player does one easy addition on sheets 1, 2, 4 and 5 (numbers provided).
 *
 * The fifteen detailed sheets (buildSheets) stay the source of every number, so the PART C tests
 * keep checking the same maths; this file only groups their steps.
 */
import type { Design } from '../data/mission';
import { MIN_UPPER_TWR, MISSION_DV } from '../data/specParts';
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
    given: [...liftoff.given, ...twr.given.slice(0, -1)],
    steps: [
      ...liftoff.steps, // the player adds the 4 weights
      ...twr.steps.map(toGame),
      g('Stage 2 push', R.stage2.thrustN, 'N', 'Stage 2 lights after stage 1 drops away.'),
      g('Stage 2 starting weight', s2StartN, 'N', 'Your spacecraft plus a full stage 2, in newtons.'),
      g('Stage 2 push / weight', R.upperTwr, '', upOk ? 'Strong enough to keep climbing.' : 'Too weak: the stage wastes fuel fighting gravity.', 0.01),
    ],
    target: `Thrust-to-weight 1.2+ at liftoff; stage 2 at ${MIN_UPPER_TWR.v}+.`,
    example: liftoff.example,
    verdict: () => {
      const t = twr.verdict();
      if (!t.pass) return { pass: false, text: `FAIL: ${t.text}`, pointer: t.pointer };
      return upOk
        ? { pass: true, text: `PASS: ${R.twr.toFixed(2)} at liftoff, stage 2 at ${R.upperTwr.toFixed(2)}.` }
        : { pass: true, text: `PASS, with a warning: stage 2 is only ${R.upperTwr.toFixed(2)} (needs ${MIN_UPPER_TWR.v}): it wastes fuel fighting gravity.`, pointer: 'Add stage 2 engines or pick a stronger one.' };
    },
  };

  // ---- 2. Can it reach the Moon? (old 3, 4, 5, 6, 7)
  const spare = R.dvTotal - MISSION_DV.toMoon;
  const thin = spare >= 0 && spare < 0.03 * MISSION_DV.toMoon;
  const sheet2: Sheet = {
    id: 'moon', n: 2, title: 'CAN IT REACH THE MOON?', question: 'Do the pieces add up to the speed the Moon needs?',
    think: 'Throwing balls off a skateboard: more balls and faster throws mean more speed.',
    formula: `speed gained (Δv) = exhaust speed x ln(full weight / empty weight); total must reach ${fmt(MISSION_DV.toMoon)} m/s`,
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
    target: `${fmt(MISSION_DV.toMoon)} m/s to reach the Moon.`,
    example: moon.example,
    verdict: () => {
      const v = moon.verdict(), f = fuel.verdict();
      if (!v.pass) return { pass: false, text: `FAIL: ${fmt(MISSION_DV.toMoon)} needed, ${fmt(R.dvTotal)} available.`, pointer: v.pointer ?? f.pointer };
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
    given: [...data.given, signal.given[0], ...money.given],
    steps: [...data.steps, ...signal.steps, ...money.steps], // the player adds the receipt
    target: `${data.target} Money left above $0.`,
    example: money.example,
    verdict: () => {
      const v = combine([data.verdict(), money.verdict()], `${money.verdict().text} Messages take ${signal.steps[0].expect.toFixed(2)} s each way.`);
      return v;
    },
  };
  return [sheet1, sheet2, sheet3, sheet4, sheet5].map((x) => ({ ...x, game: !x.steps.some((st) => st.kind === 'add') }));
}
