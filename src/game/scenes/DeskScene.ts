import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, crt, fadeIn, fadeTo, gearButton, modal, modalState, onceKey, panel, txt, W, H } from '../ui/ui';
import { analyzeDesign, DesignStats } from '../../simulation/spacecraft';
import { checkAnswer, evalExpr, resultsBoard, Sheet, Step, warmer } from '../../simulation/calcDesk';
import { buildFiveSheets } from '../../simulation/deskFive';
import { specOf } from '../../simulation/specModel';
import { fmt } from '../../simulation/units';

/** Desk colour roles (readability spec): numbers from your build, numbers to add, pass, fail. */
const COL = { body: 0xfff4d6, title: 0xffd27a, build: 0xffe14a, add: 0x6ff0ff, pass: 0x7cf07c, fail: 0xff6a5a, explain: 0xb8e6ff, board: 0x14203a };
const BODY = 15, BIG = 20; // larger font scales (1.5x and 2x of the pixel font)
const PX = 14, PW = 296, PTOP = 12, PBOTTOM = 258;
export const DESK_REVEAL_PENALTY = 10; // G: points per revealed answer (Hard)

/**
 * The Calculation Desk (JOSEPH_SPEC tab 6), redesigned: the player only adds numbers the game shows;
 * the game works every other step, one line at a time, with a plain-words explanation.
 * Keys: Enter or → next step, ← previous sheet, S skip sheet, digits / Backspace for the sum, Esc settings.
 * Results board: → / S next page, ← back to the sheets, Enter launch.
 */
export class DeskScene extends Phaser.Scene {
  stats!: DesignStats;
  sheets: Sheet[] = [];
  idx = 0;
  shown = 0; // steps revealed on the current sheet (steps.length + 1 = verdict shown)
  vals: (number | null)[] = []; // player answers for add steps
  calc = '';
  easy = true;
  boardPage = 0;
  paper!: Phaser.GameObjects.Container;
  side!: Phaser.GameObjects.Container;
  feedback = '';
  feedbackColor = COL.body;
  constructor() { super('Desk'); }

  create() {
    fadeIn(this);
    audio.music('build');
    this.stats = analyzeDesign(store.design);
    this.easy = specOf(store.design).difficulty !== 'hard';
    this.sheets = this.stats.spec ? buildFiveSheets(store.design, this.stats) : []; // B1: five sheets
    this.idx = 0; this.calc = ''; this.feedback = ''; this.boardPage = 0;
    // pixel-art desk with a dark chalkboard sheet (high contrast for every colour role)
    this.add.rectangle(0, 0, W, H, 0x3b2414).setOrigin(0, 0);
    const g = this.add.graphics();
    for (let y = 0; y < H; y += 18) { g.fillStyle(0x4a2e19).fillRect(0, y, W, 9); g.fillStyle(0x2e1b0e).fillRect(0, y + 17, W, 1); }
    this.add.rectangle(8, 8, 310, 258, 0x000000, 0.5).setOrigin(0, 0);
    this.add.rectangle(6, 6, 310, 258, COL.board).setOrigin(0, 0).setStrokeStyle(2, 0x6b4a2a);
    const grid = this.add.graphics();
    for (let y = 22; y < 262; y += 16) grid.fillStyle(0x2a3a60, 0.5).fillRect(8, y, 306, 1);
    this.paper = this.add.container(0, 0);
    panel(this, 322, 4, 156, 262, 'panel_dark');
    this.side = this.add.container(0, 0);
    this.input.keyboard?.on('keydown', onceKey((e: KeyboardEvent) => {
      if (modalState.open) return; // the worked-example popup has the keys
      // A4: main-row digits and the number pad (works with Num Lock off too)
      const np = /^Numpad(\d)$/.exec(e.code)?.[1] ?? (e.code === 'NumpadDecimal' ? '.' : e.code === 'NumpadAdd' ? '+' : null);
      const k = np ?? e.key;
      if (/^[0-9.]$/.test(k)) { this.toAddStep(); this.key(k); }
      else if (k === '+') this.key('+');
      else if (e.key === 'Backspace' || e.key === 'Delete') this.key('<');
      else if (e.key === 'ArrowRight' && this.onBoard()) { this.boardPage++; this.render(); } // board: turn the page
      else if (e.key === 'Enter' || e.key === 'ArrowRight') this.advance();
      else if (e.key === 'ArrowLeft') this.prevSheet();
      else if (e.key === 's' || e.key === 'S') this.skipSheet();
      else if (e.key === 'e' || e.key === 'E') this.example();
    }));
    gearButton(this);
    crt(this);
    this.loadProgress();
    this.render();
  }

  // ------------------------------------------------------------------ state
  get sheet() { return this.sheets[this.idx]; }
  onBoard() { return this.idx >= this.sheets.length; }
  key4(sh: Sheet) { return sh.steps.map((s) => Math.round(s.expect)).join(','); }
  loadProgress() {
    const sh = this.sheet;
    if (!sh) return;
    const saved = store.desk[sh.id];
    const same = saved && saved.key === this.key4(sh);
    this.vals = same ? saved.vals.slice() : sh.steps.map(() => null);
    this.shown = same ? (saved.shown ?? 1) : 1;
  }
  saveProgress() { const sh = this.sheet; if (sh) store.desk[sh.id] = { key: this.key4(sh), vals: this.vals.slice(), shown: this.shown }; }
  /** The current step if it is an unsolved addition. */
  pendingAdd(): Step | null {
    const sh = this.sheet;
    if (!sh) return null;
    const st = sh.steps[this.shown - 1];
    return st && st.kind === 'add' && this.vals[this.shown - 1] === null ? st : null;
  }

  // ------------------------------------------------------------------ input
  /** Typing a number before the sheet's addition is shown jumps straight to it (A4). */
  toAddStep() {
    const sh = this.sheet;
    if (!sh || this.pendingAdd()) return;
    const i = sh.steps.findIndex((st, k) => st.kind === 'add' && this.vals[k] === null);
    if (i < 0 || i < this.shown - 1) return;
    this.shown = i + 1; this.feedback = '';
    this.saveProgress();
  }
  key(k: string) {
    if (!this.pendingAdd()) return;
    audio.sfx('move');
    if (k === 'C') this.calc = '';
    else if (k === '<') this.calc = this.calc.slice(0, -1);
    else if (k === '=') { const v = evalExpr(this.calc); this.calc = Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : ''; }
    else if (this.calc.length < 16) this.calc += k;
    this.render();
  }
  /** Enter / NEXT: check a pending sum, else reveal the next step, else the next sheet. */
  advance() {
    if (this.onBoard()) { this.launch(); return; }
    const sh = this.sheet;
    const st = this.pendingAdd();
    if (st) {
      if (this.calc === '') {
        if (this.easy) this.solve(st.expect, `The sum is ${fmt(st.expect)}.`, COL.body); // Easy: show it and move on
        else this.say('Type the sum, or REVEAL (-10).', COL.fail);
        return;
      }
      const v = evalExpr(this.calc);
      if (checkAnswer(st, v)) { audio.sfx('success'); this.solve(v, '✓ Right!', COL.pass); }
      else if (this.easy) { audio.sfx('error'); this.solve(st.expect, `That is ${warmer(st, v)}. It is ${fmt(st.expect)}.`, COL.fail); }
      else { audio.sfx('error'); this.calc = ''; this.say('× Not quite. Try again.', COL.fail); }
      return;
    }
    audio.sfx('select');
    if (this.shown <= sh.steps.length) { this.shown++; this.feedback = ''; }
    else { this.nextSheet(); return; }
    this.saveProgress();
    this.render();
  }
  solve(v: number, msg: string, color: number) {
    this.vals[this.shown - 1] = v;
    this.calc = '';
    this.saveProgress();
    this.say(msg, color);
  }
  reveal() {
    const st = this.pendingAdd();
    if (!st) return;
    store.deskPenalty += DESK_REVEAL_PENALTY;
    this.solve(st.expect, `Revealed (-${DESK_REVEAL_PENALTY}): ${fmt(st.expect)}.`, COL.fail);
  }
  say(t: string, color: number) { this.feedback = t; this.feedbackColor = color; this.render(); }
  nextSheet() { this.idx = Math.min(this.sheets.length, this.idx + 1); this.calc = ''; this.feedback = ''; this.loadProgress(); this.render(); }
  prevSheet() { if (this.idx > 0) { this.idx--; this.calc = ''; this.feedback = ''; this.loadProgress(); this.render(); } }
  skipSheet() { audio.sfx('select'); if (this.onBoard()) { this.boardPage++; this.render(); return; } this.nextSheet(); }
  example() {
    const sh = this.sheet;
    if (!this.easy || !sh?.example) return;
    modal(this, { title: `WORKED EXAMPLE: SHEET ${sh.n}`, text: sh.example, options: [{ label: 'Back to the sheet' }], width: 380, onChoose: () => undefined });
  }
  act(a: { label: string; apply: (d: typeof store.design) => typeof store.design }) {
    store.design = a.apply(store.design);
    store.saveDesign();
    this.stats = analyzeDesign(store.design);
    this.sheets = buildFiveSheets(store.design, this.stats);
    this.loadProgress();
    this.say(`Done. Rocket: ${fmt(this.stats.spec!.rocket.dvTotal)} m/s.`, COL.pass);
  }
  toHangar() { fadeTo(this, 'Hangar'); }
  launch() { fadeTo(this, 'Review'); }

  // ------------------------------------------------------------------ drawing helpers
  t(x: number, y: number, s: string, color: number, size = BODY, maxWidth = PW, align?: 'left' | 'center' | 'right') {
    return txt(this, x, y, s, { color, size, maxWidth, align });
  }
  btn(x: number, y: number, w: number, label: string, cb: () => void, tip?: string, style?: 'go') {
    void tip; // no hover tooltips on the desk: they covered NEXT / HANGAR and the answers (A2)
    const b = new Button(this, x, y, label, cb, { w, h: 19, style });
    b.label.setFontSize(BODY).setY(2);
    return b;
  }
  fmtVal(st: Step, v: number) {
    const n = st.abs !== undefined && st.abs < 0.5 ? v.toFixed(st.abs <= 0.005 ? 3 : 2) : st.unit === '%' ? v.toFixed(0) : fmt(v);
    return st.unit === 'USD' ? `$${n}` : `${n}${st.unit ? ' ' + st.unit : ''}`;
  }
  heightOf(s: string, w: number) { const o = this.t(0, -999, s, 0, BODY, w); const h = o.height; o.destroy(); return h; }

  render() {
    this.paper.removeAll(true);
    this.side.removeAll(true);
    if (this.onBoard()) { this.renderBoard(); return; }
    const sh = this.sheet;
    type Line = { s: string; color: number; dx?: number };
    const header: Line[] = [
      { s: `${sh.n}. ${sh.title}`, color: COL.title },
      { s: sh.formula, color: COL.body },
      ...(this.shown <= 1 ? [{ s: sh.think, color: COL.explain }] : []),
      // while an addition waits, its cyan lines carry the numbers: the build lines step aside
      ...(this.pendingAdd() ? [] : sh.given.map((x) => ({ s: x, color: COL.build }))),
    ];
    const blocks: Line[][] = [];
    sh.steps.slice(0, Math.min(this.shown, sh.steps.length)).forEach((st, i) => {
      const cur = i === this.shown - 1;
      const v = this.vals[i];
      if (st.kind === 'add') {
        const b: Line[] = [{ s: `${st.label}: add these`, color: COL.body }];
        if (v === null) for (const a of st.addends!) b.push({ s: `+ ${this.fmtVal(st, a.value)}  ${a.label}`, color: COL.add, dx: 8 });
        b.push(v === null ? { s: '= ?', color: COL.add, dx: 8 } : { s: `= ${this.fmtVal(st, v)}`, color: COL.pass, dx: 8 });
        if (cur && v !== null) b.push({ s: st.explain ?? '', color: COL.explain, dx: 8 });
        blocks.push(b);
      } else {
        const b: Line[] = [{ s: `${st.label} = ${this.fmtVal(st, st.expect)}`, color: COL.body }];
        if (cur) b.push({ s: st.explain ?? '', color: COL.explain, dx: 8 });
        blocks.push(b);
      }
    });
    const done = this.shown > sh.steps.length;
    const vd = done ? sh.verdict() : null;
    if (vd) blocks.push([{ s: `${vd.pass ? '✓' : '×'} ${vd.text}`, color: vd.pass ? COL.pass : COL.fail }, ...(this.easy && vd.pointer ? [{ s: `Change: ${vd.pointer}`, color: COL.explain, dx: 8 }] : []), ...(sh.extra ?? []).map((e) => ({ s: e, color: e.startsWith('×') ? COL.fail : COL.explain, dx: 8 }))]);
    // fit without shrinking: the oldest steps scroll off the top, then the "think" line goes
    const hOf = (ls: Line[]) => ls.reduce((a, l) => a + this.heightOf(l.s, PW - (l.dx ?? 0)) + 3, 0);
    let hdr = header;
    const room = () => PBOTTOM - PTOP - hOf(hdr) - 22;
    let first = 0;
    while (first < blocks.length - 1 && blocks.slice(first).reduce((a, bl) => a + hOf(bl), 0) > room()) first++;
    if (blocks.slice(first).reduce((a, bl) => a + hOf(bl), 0) > room()) hdr = header.filter((l) => l.color !== COL.explain);
    let y = PTOP;
    const put = (l: Line) => { if (!l.s || y > PBOTTOM - 14) return; const o = this.t(PX + (l.dx ?? 0), y, l.s, l.color, BODY, PW - (l.dx ?? 0)); this.paper.add(o); y += o.height + 3; };
    hdr.forEach(put);
    y += 4;
    if (first > 0) put({ s: `(${first} earlier step${first > 1 ? 's' : ''} above)`, color: COL.explain });
    blocks.slice(first).forEach((bl) => bl.forEach(put));

    // ---- side panel
    const S = this.side;
    S.add(this.t(392, 8, `SHEET ${sh.n}/${this.sheets.length}`, COL.title, BODY, 150, 'center'));
    S.add(this.t(392, 24, this.easy ? 'EASY' : 'HARD', COL.body, BODY, 150, 'center'));
    const add = this.pendingAdd();
    if (add) {
      // addition-only calculator
      S.add(this.add.rectangle(328, 44, 144, 24, 0x0a1022).setOrigin(0, 0).setStrokeStyle(1, COL.add));
      S.add(this.t(468, 47, this.calc || '0', COL.add, BIG, 140, 'right'));
      const keys = [['7', '8', '9', 'C'], ['4', '5', '6', '<'], ['1', '2', '3', '+'], ['0', '.', '=', '']];
      keys.forEach((row, r) => row.forEach((k, c) => { if (!k) return; const b = new Button(this, 328 + c * 36, 72 + r * 21, k, () => this.key(k), { w: 34, h: 19 }); b.label.setFontSize(BODY).setY(2); S.add(b); }));
      S.add(this.btn(328, 158, 144, 'CHECK ✓', () => this.advance(), 'Check your sum (Enter)', 'go'));
      const hint = this.easy ? `Add the ${add.addends!.length} numbers in cyan.` : '';
      S.add(this.t(330, 181, this.feedback || hint, this.feedback ? this.feedbackColor : COL.add, BODY, 142));
    } else {
      // big key numbers: the target, then PASS / FAIL once worked
      S.add(this.t(330, 46, 'TARGET', COL.body, BODY, 142));
      S.add(this.t(330, 62, sh.target, COL.build, BODY, 142));
      if (vd) S.add(this.t(330, 128, vd.pass ? 'PASS' : 'FAIL', vd.pass ? COL.pass : COL.fail, BIG, 142));
      else if (this.feedback) S.add(this.t(330, 150, this.feedback, this.feedbackColor, BODY, 142));
      const acts = done ? sh.actions ?? [] : [];
      acts.forEach((a, k) => { const b = new Button(this, 328, 156 + k * 21, a.label.replace('USE THIS: ', 'USE '), () => this.act(a), { w: 144, h: 19, style: 'go' }); b.label.setFontSize(BODY).setY(2); S.add(b); });
      if (!acts.length) S.add(this.t(330, 180, done ? 'Enter: next sheet' : 'Enter: next step', COL.explain, BODY, 142));
    }
    S.add(this.btn(328, 222, 70, 'NEXT ▶', () => this.advance(), 'Next step (Enter or →)'));
    S.add(this.btn(402, 222, 70, 'HANGAR', () => this.toHangar(), 'Change parts and come back; your progress stays.'));
    S.add(this.btn(328, 244, 70, 'SKIP ▶▶', () => this.skipSheet(), 'Skip this sheet (S)'));
    if (this.easy && sh.example) S.add(this.btn(402, 244, 70, 'EXAMPLE', () => this.example(), 'A worked example (E)'));
    else if (!this.easy && add) S.add(this.btn(402, 244, 70, 'REVEAL', () => this.reveal(), `Show the sum (-${DESK_REVEAL_PENALTY} points)`));
  }

  renderBoard() {
    const all = resultsBoard(store.design, this.stats);
    // paginate at full size: section headers and rows flow onto pages that fit the sheet
    type Row = { label: string; value: string; ok?: boolean; head?: boolean };
    const rows: Row[] = all.flatMap((sec) => [{ label: sec.section, value: '', head: true } as Row, ...sec.rows]);
    const rowH = (r: Row) => (r.head ? 21 : Math.max(this.heightOf(r.label, 126), this.heightOf(`${r.ok === undefined ? '' : '✓ '}${r.value}`, PW - 140)) + 3);
    const pages: Row[][] = [[]];
    let y = PTOP + 22;
    let lastHead: Row | null = null;
    rows.forEach((r, i) => {
      if (r.head) lastHead = r;
      // a section header needs room for its first row too (no stranded headers)
      const h = rowH(r) + (r.head && rows[i + 1] ? rowH(rows[i + 1]) : 0);
      if (y + h > PBOTTOM && pages[pages.length - 1].length) {
        pages.push([]); y = PTOP + 22;
        if (!r.head && lastHead) { pages[pages.length - 1].push(lastHead); y += 21; }
      }
      pages[pages.length - 1].push(r); y += rowH(r);
    });
    this.boardPage = ((this.boardPage % pages.length) + pages.length) % pages.length;
    let py = PTOP;
    this.paper.add(this.t(PX, py, `FINAL RESULTS  ${this.boardPage + 1}/${pages.length}`, COL.title)); py += 22;
    for (const r of pages[this.boardPage]) {
      if (r.head) { this.paper.add(this.t(PX, py + 2, r.label, COL.title)); py += 21; continue; }
      const a = this.t(PX + 4, py, r.label, COL.body, BODY, 126);
      const b = this.t(PX + 140, py, `${r.ok === undefined ? '' : r.ok ? '✓ ' : '× '}${r.value}`, r.ok === false ? COL.fail : r.ok ? COL.pass : COL.build, BODY, PW - 140);
      this.paper.add([a, b]); py += Math.max(a.height, b.height) + 3;
    }
    const S = this.side;
    S.add(this.t(386, 8, 'RESULTS', COL.title, BODY, 150, 'center'));
    S.add(this.t(330, 40, 'Launch, or go back and improve the design.', COL.body, BODY, 142));
    if (store.deskPenalty) S.add(this.t(330, 110, `Reveals: -${store.deskPenalty} pts`, COL.fail, BODY, 142));
    S.add(this.btn(328, 150, 144, 'LAUNCH ▶', () => this.launch(), 'To the GO / NO-GO review (Enter)', 'go'));
    S.add(this.btn(328, 222, 70, 'PAGE ▶', () => { this.boardPage++; this.render(); }, 'Next board page (S)'));
    S.add(this.btn(402, 222, 70, 'HANGAR', () => this.toHangar()));
    S.add(this.btn(328, 244, 144, '◀ SHEETS', () => this.prevSheet(), 'Back to sheet 15 (←)'));
  }
}
