import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, chapterCard, crt, fadeIn, fadeTo, gearButton, panel, txt, W } from '../ui/ui';
import { evaluate, MissionReport, SCIENCE_FULL_POINTS } from '../../simulation/scoring';
import { createMission } from '../../simulation/mission';
import { LV_BY_ID, SITE_BY_ID } from '../../data/mission';

export class ReportScene extends Phaser.Scene {
  rep!: MissionReport;
  page!: Phaser.GameObjects.Container;
  prevNote = '';
  tabs: Button[] = [];
  constructor() { super('Report'); }
  create() {
    fadeIn(this);
    const s = store.mission;
    if (!s) { fadeTo(this, 'Title'); return; }
    this.tabs = [];
    const rep = evaluate(s);
    this.rep = rep;
    // record history once per mission
    const key = `report-${s.seed}-${s.t}`;
    if (!store.seen[key]) {
      store.addHistory({ date: rep.date, outcome: rep.outcomeLabel, score: rep.overall, grade: rep.grade, science: Math.round(rep.sciencePoints), costM: s.stats.costM, site: SITE_BY_ID[s.design.plan.site].short, lv: LV_BY_ID[s.design.plan.lv].short, seed: s.seed });
      store.markSeen(key);
    } else store.previousReport = store.history[1] ?? null;
    const prev = store.previousReport;
    const success = rep.outcome === 'FULL_SUCCESS';
    audio.music(success ? 'victory' : 'space');
    this.add.image(0, 0, 'space_bg').setOrigin(0, 0);
    this.add.image(0, 0, 'stars_near').setOrigin(0, 0);
    // left column: outcome + score
    panel(this, 4, 4, 172, 262, 'panel');
    txt(this, 90, 9, 'CHAPTER 7: MISSION REPORT', { align: 'center', color: C.gold });
    const patch = this.add.image(90, 64, 'patch');
    if (success) this.tweens.add({ targets: patch, angle: 360, duration: 1200, ease: 'Cubic.Out' });
    const oc = rep.outcome === 'FULL_SUCCESS' ? C.green : rep.outcome === 'MISSION_LOST' ? C.red : C.orange;
    const ol = txt(this, 90, 114, rep.outcomeLabel, { align: 'center', color: oc, maxWidth: 164, size: 15 });
    const sy = 114 + ol.height + 2;
    txt(this, 12, sy, `${rep.overall}/100`, { color: C.white, scale: 2 });
    txt(this, 168, sy, rep.grade, { align: 'right', color: oc, scale: 2 });
    // category bars
    const short: Record<string, string> = { science: 'Science', crew: 'Crew safety', engineering: 'Engineering', resources: 'Resources', budget: 'Budget' };
    const by = sy + 26;
    rep.parts.forEach((p, i) => {
      const y = by + i * 17;
      txt(this, 10, y, `${short[p.key]} ${Math.round(p.weight * 100)}%`, { color: C.white, size: 15 });
      const g = this.add.graphics();
      g.fillStyle(C.ink).fillRect(10, y + 14, 160, 2);
      g.fillStyle(p.score >= 0.7 ? C.green : p.score >= 0.4 ? C.orange : C.red).fillRect(10, y + 14, Math.round(160 * p.score), 2);
      txt(this, 170, y, `${Math.round(p.score * 100)}`, { align: 'right', color: p.score >= 0.7 ? C.green : p.score >= 0.4 ? C.orange : C.red, size: 15 });
    });
    if (prev) { const d = rep.overall - prev.score; this.prevNote = `Previous run: ${prev.score} (${prev.grade}), ${d >= 0 ? 'up' : 'down'} ${Math.abs(d)}.`; }
    // right: tabbed details
    panel(this, 180, 4, 296, 236, 'panel');
    const tabNames = ['SCIENCE', 'SUPPLIES', 'DECISIONS', 'LESSONS', 'HISTORY'];
    let tx = 184;
    tabNames.forEach((n, i) => { const w = n.length * 6 + 4; const b = new Button(this, tx, 9, n, () => this.show(i), { w, h: 15 }); tx += w + 2; this.tabs.push(b); }); // ends before the fullscreen + gear buttons
    this.page = this.add.container(0, 0);
    new Button(this, 180, 244, 'FLY AGAIN', () => this.flyAgain(), { w: 72, h: 22, style: 'go', tooltip: 'Same spacecraft, new launch day (different events).' });
    new Button(this, 256, 244, 'MODIFY DESIGN', () => { store.clearMission(); fadeTo(this, 'Hangar'); }, { w: 104, h: 22, tooltip: 'Back to the hangar with your design preserved.' });
    new Button(this, 364, 244, 'TITLE', () => { fadeTo(this, 'Title'); }, { w: 52, h: 22 });
    new Button(this, 420, 244, 'CREDITS', () => this.show(5), { w: 56, h: 22 });
    gearButton(this);
    crt(this);
    this.show(rep.failures.length && !success ? 3 : 0);
    if (!store.seen.chap7) { chapterCard(this, 7, 'MISSION REPORT'); store.markSeen('chap7'); }
  }
  flyAgain() {
    const s = store.mission!;
    store.mission = createMission(s.design, (s.seed * 7919 + 13) % 1000003);
    store.saveMission();
    fadeTo(this, 'Launch');
  }
  show(i: number, pageNo = 0) {
    this.tabs.forEach((b, k) => b.setSelected(k === i));
    const P = this.page;
    P.removeAll(true);
    const r = this.rep;
    const x = 188;
    let y = 30;
    const BOTTOM = 226; // keep the page inside its panel (room left for MORE)
    let n = 0, pages = 1;
    // Never clip and never shrink the pixel font: lines that do not fit flow onto the next page.
    const line = (text: string, color: number = C.text, indent = 0) => {
      const t = txt(this, x + indent, y, text, { color: color === C.dim ? C.text : color, maxWidth: 280 - indent, size: 15 });
      const h = t.height;
      if (y + h > BOTTOM) { pages++; y = 30; n = 0; }
      if (pages - 1 !== pageNo) { t.destroy(); y += h + 3; return t; } // on another page
      t.setY(y); P.add(t); y += h + 3; n++; return t;
    };
    if (i === 0) {
      line('SCIENTIFIC ACHIEVEMENTS', C.gold2);
      if (!r.science.length) line('No science returned.', C.dim);
      for (const sc of r.science) { line(`• ${sc.label}: +${sc.points.toFixed(1)}`, C.white); if (sc.detail) line(sc.detail, C.dim, 8); }
      y += 4; line(`Total ${r.sciencePoints.toFixed(1)} of ${SCIENCE_FULL_POINTS} points needed.`, C.teal);
    } else if (i === 1) {
      line('RESOURCES REMAINING', C.gold2);
      for (const res of r.resources) line(`${res.label.padEnd(14, ' ')} ${res.value}`, C.white);
      y += 6; line('SCORE DETAILS', C.gold2);
      for (const p of r.parts) line(`${p.label}: ${p.note}`, C.text);
    } else if (i === 2) {
      line(`DECISION LOG  (seed ${r.seed})`, C.gold2);
      line(`* = Flight Director pick.  Bonus +${r.fdBonus}.  Mission points ${r.missionPoints.toLocaleString('en-US')}.`, C.teal);
      if (r.retries) line(`Landing retries: ${r.retries}${store.mission?.design.spec?.difficulty === 'hard' ? ` (-100 points each)` : ' (free on Easy)'}`, C.orange);
      if (!r.decisions.length) line('No emergencies required a decision.', C.dim);
      for (const d of r.decisions) {
        line(`${d.fd ? '*' : '•'} ${d.event}`, C.orange);
        line(`→ ${d.choice}`, C.white, 8);
        if (d.bad) line(`Cost: ${d.bad}`, C.red, 8);
      }
      if (r.failures.length) { y += 4; line('PROBLEMS & FAILURE CAUSES', C.gold2); for (const f of r.failures) line(`• ${f}`, C.red); }
    } else if (i === 3) {
      line('RECOMMENDED IMPROVEMENTS', C.gold2);
      for (const rec of r.recommendations) line(`• ${rec}`, C.white);
      y += 4; line('ENGINEERING LESSONS', C.gold2);
      for (const l of r.lessons) line(`• ${l}`, C.teal);
    } else if (i === 4) {
      line('MISSION HISTORY (this device)', C.gold2);
      if (this.prevNote) line(this.prevNote, C.teal);
      for (const h of store.history.slice(0, 9)) line(`${h.score.toString().padStart(3)} ${h.grade}  ${h.outcome.slice(0, 18).padEnd(18)} ${h.site}, ${h.lv}`, C.white);
    } else {
      line('CREDITS', C.gold2);
      line('OAKLAND TO THE MOON — an original game for the 2026 NASA Space Apps Challenge.', C.white);
      line('All characters, agency, rockets and mission are fictional. Not affiliated with or endorsed by NASA.', C.dim);
      line('Art, music and sound: generated procedurally by code in this repository.', C.white);
      line('Engineering references: NASA mission design resources (see SOURCES.md).', C.white);
      line('From the Town to the Stars.', C.gold);
    }
    void n;
    if (pages > 1) P.add(new Button(this, 404, 226, `MORE ${pageNo + 1}/${pages} ▶`, () => this.show(i, (pageNo + 1) % pages), { w: 70, h: 14 }));
    void W;
  }
}
