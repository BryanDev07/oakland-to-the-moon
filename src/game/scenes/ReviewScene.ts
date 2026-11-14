import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, chapterCard, crt, fadeIn, fadeTo, gearButton, iconFrame, kg, panel, toast, Tooltip, txt, W } from '../ui/ui';
import { reviewDesign, ReviewCheck, ReviewResult } from '../../simulation/review';
import { COMPONENT_BY_ID } from '../../data/components';
import { LV_BY_ID, SITE_BY_ID, TEMPO_BY_ID } from '../../data/mission';
import { SPEC_MODEL } from '../../simulation/constants';
import { fmtLb, fmtUsdM } from '../../simulation/units';
import { createMission } from '../../simulation/mission';
import { forcedSeed } from '../../state/debug';

export class ReviewScene extends Phaser.Scene {
  r!: ReviewResult;
  detail!: Phaser.GameObjects.Container;
  rows: Phaser.GameObjects.Rectangle[] = [];
  polling = false;
  constructor() { super('Review'); }
  create() {
    fadeIn(this);
    audio.music('tension');
    this.polling = false;
    this.rows = [];
    this.add.image(0, 0, 'mission_control').setOrigin(0, 0).setTint(0x8080a0);
    this.r = reviewDesign(store.design);
    const r = this.r;
    panel(this, 4, 4, 300, 262, 'panel');
    txt(this, 154, 9, 'CHAPTER 3: COUNTDOWN — DESIGN REVIEW', { align: 'center', color: C.gold });
    const verdict = r.go ? (r.warnings ? 'GO WITH RISKS' : 'ALL SYSTEMS GO') : 'NO-GO';
    txt(this, 154, 21, `${verdict}: ${r.blocking} blocking, ${r.warnings} warning${r.warnings === 1 ? '' : 's'}`, { align: 'center', color: r.go ? (r.warnings ? C.orange : C.green) : C.red });
    const pitch = Math.min(17, Math.floor(228 / Math.max(1, r.checks.length))); // fit every check on screen
    const pad = Math.max(0, Math.floor((pitch - 13) / 2));
    r.checks.forEach((c, i) => {
      const y = 34 + i * pitch;
      const bg = this.add.rectangle(8, y, 292, pitch - 1, c.status === 'fail' ? 0x7a1626 : c.status === 'warn' ? 0x6a2808 : 0x16545c, 0.45).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      this.rows.push(bg);
      this.add.image(11, y + pad, 'icons', iconFrame(c.icon)).setOrigin(0, 0);
      const title = txt(this, 26, y + pad + 2, c.title, { color: C.white });
      const value = txt(this, 270, y + pad + 2, c.value, { align: 'right', color: C.dim });
      // never overlap: small font first, then trim (full text is in the detail panel)
      const room = 270 - (26 + title.width + 6);
      if (value.width > room) value.setFontSize(8).setY(y + pad + 3);
      while (value.width > room && value.text.length > 4) value.setText(value.text.slice(0, -2) + '…');
      this.add.image(284, y + pad, 'icons', iconFrame(c.status === 'pass' ? 'ok' : c.status === 'warn' ? 'warn' : 'fail')).setOrigin(0, 0);
      // status as words too (not colour alone)
      bg.on('pointerover', () => { audio.sfx('move'); this.showDetail(c, i); });
      bg.on('pointerup', () => this.showDetail(c, i));
    });
    // right column: mission summary + detail
    panel(this, 308, 4, 168, 112, 'panel');
    const s = r.stats, p = store.design.plan;
    txt(this, 392, 9, 'MISSION SUMMARY', { align: 'center', color: C.gold });
    txt(this, 314, 22, [
      `Rocket   ${LV_BY_ID[p.lv].name}`,
      `Site     ${SITE_BY_ID[p.site].short}`,
      `Crew     ${s.crew} (${s.landingCrew} land)`,
      `Stay     ${p.stayDays} d, ${TEMPO_BY_ID[p.tempo].name}`,
      `Duration ${s.missionDays.toFixed(1)} days`,
      `Mass     ${SPEC_MODEL ? fmtLb(s.mass.tliKg) : kg(s.mass.tliKg)}`,
      `Cost     ${SPEC_MODEL ? fmtUsdM(s.costM) : `$${s.costM.toLocaleString('en-US')}M`}`,
      `Δv need  ${Math.round(s.propulsion.dvRequired)} m/s`,
    ].join('\n'), { color: C.text });
    panel(this, 308, 118, 168, 120, 'panel_dark');
    this.detail = this.add.container(0, 0);
    new Button(this, 308, 244, '◀ HANGAR', () => fadeTo(this, 'Hangar'), { w: 70, h: 22 });
    const launch = new Button(this, 382, 244, 'LAUNCH ▶', () => this.poll(), { w: 94, h: 22, style: 'go', disabled: !r.go });
    if (!r.go) launch.bg.on('pointerover', () => Tooltip.show(this, 'Fix every red (blocking) item first. Click a row for the fix.', { x: 300, y: 200 }));
    const first = r.checks.find((c) => c.status === 'fail') ?? r.checks.find((c) => c.status === 'warn') ?? r.checks[0];
    this.showDetail(first, r.checks.indexOf(first));
    this.input.keyboard?.on('keydown-ENTER', () => { if (r.go) this.poll(); });
    gearButton(this);
    crt(this);
    if (!store.seen.reviewCard) { chapterCard(this, 3, 'COUNTDOWN'); store.markSeen('reviewCard'); }
    if (!r.go) this.time.delayedCall(store.seen.reviewCard ? 300 : 2400, () => toast(this, 'Flight Director', 'We are NO-GO. Red items are blocking. Click each for the fix, then head back to the hangar.', 'portrait_director', 6000));
  }
  showDetail(c: ReviewCheck, i: number) {
    this.rows.forEach((row, k) => row.setStrokeStyle(k === i ? 1 : 0, C.gold));
    this.detail.removeAll(true);
    const D = this.detail;
    const status = c.status === 'pass' ? 'PASS' : c.status === 'warn' ? 'WARNING (acceptable risk)' : 'BLOCKING';
    D.add(txt(this, 314, 123, c.title.toUpperCase(), { color: C.gold2, maxWidth: 156 }));
    D.add(txt(this, 314, 133, status, { color: c.status === 'pass' ? C.green : c.status === 'warn' ? C.orange : C.red }));
    const body = txt(this, 314, 145, c.detail, { maxWidth: 156, color: C.text });
    D.add(body);
    let y = 145 + body.height + 4;
    if (c.fix) { const f = txt(this, 314, y, 'FIX: ' + c.fix, { maxWidth: 156, color: C.teal }); D.add(f); y += f.height + 4; }
    if (c.culprits.length) D.add(txt(this, 314, Math.min(y, 226), 'Involved: ' + c.culprits.map((id) => COMPONENT_BY_ID[id]?.short ?? id).join(', '), { maxWidth: 156, color: C.orange }));
  }
  poll() {
    if (this.polling || !this.r.go) return;
    this.polling = true;
    const calls = ['BOOSTER', 'FLIGHT DYNAMICS', 'GUIDANCE', 'PROPULSION', 'ELECTRICAL', 'LIFE SUPPORT', 'COMMS', 'SURGEON', 'RECOVERY', 'FLIGHT'];
    const box = this.add.container(0, 0).setDepth(900);
    box.add(this.add.rectangle(0, 0, W, 270, 0x04030c, 0.8).setOrigin(0, 0));
    box.add(panel(this, 140, 30, 200, 210, 'panel'));
    box.add(txt(this, 240, 36, 'LAUNCH STATUS CHECK', { align: 'center', color: C.gold }));
    calls.forEach((c, i) => {
      this.time.delayedCall(220 * i, () => {
        audio.sfx('beep');
        box.add(txt(this, 156, 52 + i * 17, `${c}?`, { color: C.text }));
        box.add(txt(this, 324, 52 + i * 17, i === calls.length - 1 ? 'WE ARE GO!' : 'GO', { align: 'right', color: C.green }));
      });
    });
    this.time.delayedCall(220 * calls.length + 700, () => {
      const seed = forcedSeed() ?? ((Date.now() % 1000000) | 0);
      store.mission = createMission(store.design, seed);
      store.saveMission();
      fadeTo(this, 'Launch');
    });
  }
}
