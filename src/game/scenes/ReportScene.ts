import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, chapterCard, crt, fadeIn, fadeTo, gearButton, panel, txt, W } from '../ui/ui';
import { evaluate, MissionReport } from '../../simulation/scoring';
import { createMission } from '../../simulation/mission';
import { LV_BY_ID, SITE_BY_ID } from '../../data/mission';

export class ReportScene extends Phaser.Scene {
  rep!: MissionReport;
  page!: Phaser.GameObjects.Container;
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
    const patch = this.add.image(90, 66, 'patch');
    if (success) this.tweens.add({ targets: patch, angle: 360, duration: 1200, ease: 'Cubic.Out' });
    const oc = rep.outcome === 'FULL_SUCCESS' ? C.green : rep.outcome === 'MISSION_LOST' ? C.red : C.orange;
    txt(this, 90, 116, rep.outcomeLabel, { align: 'center', color: oc, maxWidth: 160 });
    txt(this, 52, 127, String(rep.overall), { align: 'center', color: C.white, scale: 2 });
    txt(this, 52, 148, 'SCORE /100', { align: 'center', color: C.dim });
    txt(this, 130, 127, rep.grade, { align: 'center', color: oc, scale: 2 });
    txt(this, 130, 148, `ENG. ${rep.engineeringGrade}`, { align: 'center', color: C.teal });
    // category bars
    rep.parts.forEach((p, i) => {
      const y = 162 + i * 16;
      txt(this, 10, y, `${p.label} (${Math.round(p.weight * 100)}%)`, { color: C.text });
      const g = this.add.graphics();
      g.fillStyle(C.ink).fillRect(10, y + 10, 160, 4);
      g.fillStyle(p.score >= 0.7 ? C.green : p.score >= 0.4 ? C.orange : C.red).fillRect(10, y + 10, Math.round(160 * p.score), 4);
      txt(this, 170, y, `${Math.round(p.score * 100)}`, { align: 'right', color: C.dim });
    });
    if (prev) {
      const d = rep.overall - prev.score;
      txt(this, 90, 248, `Previous run: ${prev.score} (${prev.grade})  ${d >= 0 ? '↑' : '↓'}${Math.abs(d)}`, { align: 'center', color: d >= 0 ? C.green : C.orange });
    } else txt(this, 90, 248, 'First recorded mission!', { align: 'center', color: C.dim });
    // right: tabbed details
    panel(this, 180, 4, 296, 236, 'panel');
    const tabNames = ['SCIENCE', 'RESOURCES', 'DECISIONS', 'LESSONS', 'HISTORY'];
    tabNames.forEach((n, i) => { const b = new Button(this, 186 + i * 57, 9, n, () => this.show(i), { w: 55, h: 15 }); this.tabs.push(b); });
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
  show(i: number) {
    this.tabs.forEach((b, k) => b.setSelected(k === i));
    const P = this.page;
    P.removeAll(true);
    const r = this.rep;
    const x = 188;
    let y = 30;
    const line = (text: string, color: number = C.text, indent = 0) => { const t = txt(this, x + indent, y, text, { color, maxWidth: 280 - indent }); P.add(t); y += t.height + 3; return t; };
    if (i === 0) {
      line('SCIENTIFIC ACHIEVEMENTS', C.gold2);
      if (!r.science.length) line('No science returned.', C.dim);
      for (const sc of r.science) { line(`• ${sc.label}: +${sc.points.toFixed(1)}`, C.white); if (sc.detail) line(sc.detail, C.dim, 8); }
      y += 4; line(`Total ${r.sciencePoints.toFixed(1)} of ${80} points for full marks.`, C.teal);
    } else if (i === 1) {
      line('RESOURCES REMAINING', C.gold2);
      for (const res of r.resources) line(`${res.label.padEnd(14, ' ')} ${res.value}`, C.white);
      y += 6; line('SCORE DETAILS', C.gold2);
      for (const p of r.parts) line(`${p.label}: ${p.note}`, C.text);
    } else if (i === 2) {
      line('CRITICAL DECISIONS', C.gold2);
      if (!r.decisions.length) line('No emergencies required a decision.', C.dim);
      for (const d of r.decisions) { line(`• ${d.event}`, C.orange); line(`→ ${d.choice}`, C.white, 8); }
      if (r.failures.length) { y += 4; line('PROBLEMS & FAILURE CAUSES', C.gold2); for (const f of r.failures) line(`• ${f}`, C.red); }
    } else if (i === 3) {
      line('RECOMMENDED IMPROVEMENTS', C.gold2);
      for (const rec of r.recommendations) line(`• ${rec}`, C.white);
      y += 4; line('ENGINEERING LESSONS', C.gold2);
      for (const l of r.lessons) line(`• ${l}`, C.teal);
    } else if (i === 4) {
      line('MISSION HISTORY (this device)', C.gold2);
      for (const h of store.history.slice(0, 9)) line(`${h.score.toString().padStart(3)} ${h.grade}  ${h.outcome.slice(0, 18).padEnd(18)} ${h.site}, ${h.lv}`, C.white);
    } else {
      line('CREDITS', C.gold2);
      line('OAKLAND TO THE MOON — an original game for the 2026 NASA Space Apps Challenge.', C.white);
      line('All characters, agency, rockets and mission are fictional. Not affiliated with or endorsed by NASA.', C.dim);
      line('Art, music and sound: generated procedurally by code in this repository.', C.white);
      line('Engineering references: NASA mission design resources (see SOURCES.md).', C.white);
      line('From the Town to the Stars.', C.gold);
    }
    void W;
  }
}
