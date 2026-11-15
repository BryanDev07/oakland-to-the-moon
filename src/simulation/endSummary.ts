/**
 * The end-of-mission story (Phase 5): which real programme your mission is most like, why it
 * succeeded or failed in plain words, the thinnest margin (with your real numbers) and the
 * emergency call that cost the most. Pure: no Phaser.
 */
import type { MissionState } from './types';
import type { MissionReport } from './scoring';
import { specOf } from './specModel';
import { fmt, fmtUsdM } from './units';

export type Likeness = 'Apollo' | 'Artemis' | 'a hybrid';
export interface EndSummary { like: Likeness; likeWhy: string; outcome: string; margin: string; costliest: string | null; extra: string; lines: string[] }

/** Apollo: one launch, low lunar orbit, Apollo-class capsule. Artemis: two launches, halo orbit, Orion. */
export function missionLikeness(arch: string, orbit: string, capsule: string): { like: Likeness; why: string } {
  const picks = [
    { apollo: arch === 'apollo', a: 'one launch', b: 'two launches' },
    { apollo: orbit === 'LLO', a: 'low lunar orbit', b: 'the halo orbit' },
    { apollo: capsule !== 'cap_orion', a: capsule === 'cap_apollo' ? 'an Apollo-class capsule' : 'a budget capsule', b: 'Orion' },
  ];
  const nA = picks.filter((p) => p.apollo).length;
  const list = (ps: typeof picks) => ps.map((p) => (p.apollo ? p.a : p.b));
  const join = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  if (nA === 3) return { like: 'Apollo', why: `Like Apollo 11: ${join(list(picks))}.` };
  if (nA === 0) return { like: 'Artemis', why: `Like Artemis III: ${join(list(picks))}.` };
  const ap = picks.filter((p) => p.apollo), ar = picks.filter((p) => !p.apollo);
  return { like: 'a hybrid', why: `Apollo's ${join(list(ap))} with Artemis's ${join(list(ar))}.` };
}

/** Every margin the design had, as a share of what was needed; the thinnest one is the story. */
export function margins(s: MissionState) {
  const st = s.stats, S = st.spec;
  const out: { what: string; have: number; need: number; unit: string }[] = [];
  if (S) {
    out.push({ what: 'rocket speed', have: S.rocket.dvTotal, need: S.rocket.target, unit: 'm/s' });
    out.push({ what: 'capsule speed for the trip home', have: S.capsuleReturn.dvLeft, need: S.capsuleReturn.need, unit: 'm/s' });
    out.push({ what: 'capsule days', have: S.capsule.maxDays, need: st.missionDays, unit: 'days' });
  }
  if (st.lander.present) {
    out.push({ what: 'lander speed going down', have: st.lander.descentDvAvail, need: st.lander.descentDvReq, unit: 'm/s' });
    out.push({ what: 'lander speed going up', have: st.lander.ascentDvAvail, need: st.lander.ascentDvReq, unit: 'm/s' });
  }
  return out.map((m) => ({ ...m, spare: (m.have - m.need) / Math.max(1e-9, m.need) })).sort((a, b) => a.spare - b.spare);
}

const SEVERITY: [RegExp, number][] = [[/safety|health|condition|lost|injur/i, 4], [/science|sample|data/i, 3], [/\$|cost|budget/i, 2], [/fuel|m\/s|reserve/i, 2], [/hour|time|delay/i, 1]];
/** The emergency call that cost the most: not the flight director's pick, Bad effect not cancelled, worst kind of cost first. */
export function costliestCall(rep: MissionReport): string | null {
  let best: { score: number; d: MissionReport['decisions'][number] } | null = null;
  for (const d of rep.decisions) {
    if (!d.bad || /cancelled/i.test(d.bad)) continue;
    const score = (d.fd ? 0 : 10) + Math.max(0, ...SEVERITY.filter(([re]) => re.test(d.bad!)).map(([, w]) => w));
    if (!best || score > best.score) best = { score, d };
  }
  return best ? `${best.d.event}: you chose "${best.d.choice.replace(/^[A-C]\.\s*/, '')}". Cost: ${best.d.bad}` : null;
}

export function endSummary(s: MissionState, rep: MissionReport): EndSummary {
  const sp = specOf(s.design);
  const lk = s.iss
    ? { like: 'a hybrid' as Likeness, why: 'An ISS crew flight: dock, spacewalk and come home, like Crew Dragon and Soyuz missions do.' }
    : missionLikeness(sp.architecture, sp.orbit, sp.capsule);
  const ms = margins(s);
  const thin = ms[0];
  const margin = thin
    ? thin.spare < 0
      ? `Your ${thin.what} was short: ${fmt(thin.have)} vs ${fmt(thin.need)} ${thin.unit} needed.`
      : `Your thinnest margin was ${thin.what}: ${fmt(thin.have)} vs ${fmt(thin.need)} ${thin.unit} (${Math.round(thin.spare * 100)}% spare).`
    : '';
  const E = s.em;
  const sci = Math.round(rep.sciencePoints);
  let outcome: string;
  switch (rep.outcome) {
    case 'FULL_SUCCESS': outcome = s.iss ? `It worked: you docked with the ISS, fixed the solar panel and brought the crew home (repair ${Math.round(s.iss.quality * 100)}%).` : `It worked: the crew landed, came home safe and brought back ${sci} science points (50 needed).`; break;
    case 'PARTIAL_SUCCESS': outcome = s.iss ? 'Partly: you docked with the ISS and came home, but the panel was not fixed.' : s.landing.outcome === 'soft' || s.landing.outcome === 'hard'
      ? `Partly: the crew came home, but with ${sci} of the 50 science points needed.`
      : `Partly: the crew came home safe but never landed (${sci} science points).`; break;
    case 'ABORT_SAFE': outcome = `The mission was called off, but the crew is safe. ${E?.abortReason ?? rep.failures[0] ?? ''}`.trim(); break;
    default: outcome = `The crew was lost. ${rep.failures[0] ?? ''}`.trim();
  }
  const costliest = costliestCall(rep);
  const extra = E && E.extraCostM > 0 ? `Emergencies added ${fmtUsdM(E.extraCostM)} to the bill.` : '';
  const lines = [s.iss ? 'Your mission: ISS Rescue, dock and spacewalk.' : `Your mission is most like ${lk.like}.`, lk.why, outcome, margin, ...(costliest ? [`Costliest call: ${costliest}`] : []), ...(extra ? [extra] : [])].filter(Boolean);
  return { like: lk.like, likeWhy: lk.why, outcome, margin, costliest, extra, lines };
}
