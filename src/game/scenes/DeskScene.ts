import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, crt, fadeIn, fadeTo, gearButton, onceKey, panel, txt, W, H } from '../ui/ui';
import { analyzeDesign, DesignStats } from '../../simulation/spacecraft';
import { buildSheets, checkAnswer, evalExpr, resultsBoard, Sheet, warmer } from '../../simulation/calcDesk';
import { specOf } from '../../simulation/specModel';
import { fmt } from '../../simulation/units';

const INK = 0x2b2440, BLUE = 0x1d3f8a, TEAL = 0x2f6e5c, RED = 0xb0302a, OK = 0x2c7a2c, PAPER = 0xefe6cf;
const PX = 12, PW = 300, PBOTTOM = 262;
export const DESK_REVEAL_PENALTY = 10; // G: points off the desk bonus per revealed answer (Hard)

/**
 * The Calculation Desk (JOSEPH_SPEC tab 6): after the hangar, before launch. Each sheet shows the
 * formula with the player's numbers, blanks to solve with a calculator (ln and e^x), the target, and
 * the player's call: move on or go back to the hangar. Easy adds a worked example, warmer/colder
 * hints, the correct step when wrong, and which part to change. Hard shows the formula, numbers and
 * target only; revealing an answer costs 10 desk points.
 */
export class DeskScene extends Phaser.Scene {
  stats!: DesignStats;
  sheets: Sheet[] = [];
  idx = 0;
  vals: (number | null)[] = [];
  calc = '';
  easy = true;
  paper!: Phaser.GameObjects.Container;
  side!: Phaser.GameObjects.Container;
  display!: Phaser.GameObjects.BitmapText;
  feedback!: Phaser.GameObjects.BitmapText;
  feedbackColor = C.text;
  feedbackText = '';
  boardPage = 0;
  constructor() { super('Desk'); }

  create() {
    fadeIn(this);
    audio.music('build');
    this.stats = analyzeDesign(store.design);
    this.easy = specOf(store.design).difficulty !== 'hard';
    this.sheets = this.stats.spec ? buildSheets(store.design, this.stats) : [];
    this.idx = 0; this.calc = ''; this.feedbackText = ''; this.boardPage = 0;
    // pixel-art desk: wood planks and a sheet of paper
    this.add.rectangle(0, 0, W, H, 0x3b2414).setOrigin(0, 0);
    const g = this.add.graphics();
    for (let y = 0; y < H; y += 18) { g.fillStyle(0x4a2e19).fillRect(0, y, W, 9); g.fillStyle(0x2e1b0e).fillRect(0, y + 17, W, 1); }
    this.add.rectangle(8, 8, 310, 258, 0x1a0f07, 0.5).setOrigin(0, 0); // paper shadow
    this.add.rectangle(6, 6, 310, 258, PAPER).setOrigin(0, 0);
    const lines = this.add.graphics();
    for (let y = 28; y < 262; y += 11) lines.fillStyle(0xb8c8e8, 0.45).fillRect(6, y, 310, 1);
    lines.fillStyle(0xd06060, 0.6).fillRect(18, 6, 1, 258);
    this.paper = this.add.container(0, 0);
    // calculator
    panel(this, 322, 4, 156, 262, 'panel_dark');
    this.side = this.add.container(0, 0);
    this.add.rectangle(328, 22, 144, 16, 0x101830).setOrigin(0, 0);
    this.display = txt(this, 468, 25, '0', { align: 'right', color: C.green });
    const keys = [['7', '8', '9', '/'], ['4', '5', '6', 'x'], ['1', '2', '3', '-'], ['0', '.', '<', '+'], ['C', 'ln', 'e^x', '=']];
    keys.forEach((row, r) => row.forEach((k, c) => new Button(this, 328 + c * 36, 42 + r * 17, k, () => this.key(k), { w: 34, h: 15 })));
    new Button(this, 328, 129, 'CHECK ✓', () => this.check(), { w: 144, h: 16, style: 'go', tooltip: 'Check the number on the calculator (Enter)' });
    this.feedback = txt(this, 328, 149, '', { maxWidth: 144, color: C.text });
    new Button(this, 328, 226, '◀ HANGAR', () => this.toHangar(), { w: 70, h: 16, tooltip: 'Change parts and try again. Solved sheets stay solved while their numbers do not change.' });
    new Button(this, 402, 226, 'NEXT ▶', () => this.next(), { w: 70, h: 16, tooltip: 'Move on to the next sheet (Enter with an empty calculator)' });
    if (!this.easy) new Button(this, 328, 246, `REVEAL (-${DESK_REVEAL_PENALTY} PTS)`, () => this.reveal(), { w: 144, h: 16, tooltip: 'Hard: show this step\'s answer for a desk-points penalty' });
    this.input.keyboard?.on('keydown', onceKey((e: KeyboardEvent) => {
      if (/^[0-9.]$/.test(e.key)) this.key(e.key);
      else if (e.key === '+' || e.key === '-' || e.key === '/') this.key(e.key);
      else if (e.key === '*') this.key('x');
      else if (e.key === 'Backspace') this.key('<');
      else if (e.key === 'Enter') { if (this.idx >= this.sheets.length) this.launch(); else if (this.calc === '' || this.activeStep() < 0) this.next(); else this.check(); }
    }));
    gearButton(this);
    crt(this);
    this.loadProgress();
    this.render();
  }

  // ------------------------------------------------------------------ progress (kept while the numbers are unchanged)
  key4(sh: Sheet) { return sh.steps.map((s) => Math.round(s.expect * 1000)).join(','); }
  loadProgress() {
    const sh = this.sheets[this.idx];
    if (!sh) { this.vals = []; return; }
    if (sh.game) { this.vals = sh.steps.map((st) => st.expect); return; } // game-solved: watch it work
    const saved = store.desk[sh.id];
    this.vals = saved && saved.key === this.key4(sh) ? saved.vals.slice() : sh.steps.map(() => null);
  }
  saveProgress() { const sh = this.sheets[this.idx]; if (sh) store.desk[sh.id] = { key: this.key4(sh), vals: this.vals.slice() }; }
  activeStep() { return this.vals.findIndex((v) => v === null); }

  // ------------------------------------------------------------------ calculator
  key(k: string) {
    audio.sfx('move');
    if (k === 'C') this.calc = '';
    else if (k === '<') this.calc = this.calc.slice(0, -1);
    else if (k === '=') this.calc = this.num(evalExpr(this.calc));
    else if (k === 'ln') this.calc = this.num(Math.log(evalExpr(this.calc)));
    else if (k === 'e^x') this.calc = this.num(Math.exp(evalExpr(this.calc)));
    else if (this.calc.length < 22) this.calc += k;
    this.display.setText(this.calc || '0');
  }
  num(v: number) { return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : 'ERR'; }

  check() {
    const sh = this.sheets[this.idx];
    const i = this.activeStep();
    if (!sh || i < 0) { this.next(); return; }
    const step = sh.steps[i];
    const v = evalExpr(this.calc);
    if (checkAnswer(step, v)) {
      audio.sfx('success');
      this.vals[i] = v;
      this.say(`✓ Right: ${step.why}`, OK);
      this.calc = ''; this.display.setText('0');
    } else if (this.easy) {
      // Easy: say warmer/colder, then show the correct step and why
      audio.sfx('error');
      this.vals[i] = step.expect;
      this.say(`${Number.isFinite(v) ? `That is ${warmer(step, v)}. ` : ''}Correct: ${step.why}`, RED);
      this.calc = ''; this.display.setText('0');
    } else {
      audio.sfx('error');
      this.say('× Not quite. Try again, or REVEAL the answer.', RED);
    }
    this.saveProgress();
    this.render();
  }
  reveal() {
    const sh = this.sheets[this.idx];
    const i = this.activeStep();
    if (!sh || i < 0) return;
    this.vals[i] = sh.steps[i].expect;
    store.deskPenalty += DESK_REVEAL_PENALTY;
    this.say(`Revealed (-${DESK_REVEAL_PENALTY}): ${sh.steps[i].why}`, RED);
    this.saveProgress();
    this.render();
  }
  say(t: string, color: number) { this.feedbackText = t; this.feedbackColor = color; }
  next() {
    audio.sfx('select');
    if (this.idx >= this.sheets.length) { this.boardPage = (this.boardPage + 1) % this.boardPages(); this.render(); return; } // board: next page
    this.idx = Math.min(this.sheets.length, this.idx + 1);
    this.calc = ''; this.display.setText('0'); this.feedbackText = '';
    this.loadProgress();
    this.render();
  }
  /** Apply a sheet action to the build (e.g. set a stage's fuel) and recompute every sheet. */
  act(a: { label: string; apply: (d: typeof store.design) => typeof store.design }) {
    store.design = a.apply(store.design);
    store.saveDesign();
    this.stats = analyzeDesign(store.design);
    this.sheets = buildSheets(store.design, this.stats);
    this.loadProgress();
    this.say(`Done: ${a.label.replace('USE THIS: ', '')}. Rocket now ${fmt(this.stats.spec!.rocket.dvTotal)} m/s.`, OK);
    this.render();
  }
  boardPages() { return Math.ceil(resultsBoard(store.design, this.stats).length / 3); }
  toHangar() { fadeTo(this, 'Hangar'); }
  launch() { fadeTo(this, 'Review'); }

  // ------------------------------------------------------------------ drawing
  render() {
    this.paper.removeAll(true);
    this.side.removeAll(true);
    if (this.idx >= this.sheets.length) { this.renderBoard(); return; }
    const sh = this.sheets[this.idx];
    const active = this.activeStep();
    // lay out; if the sheet runs past the paper, drop the optional lines and lay out again
    for (const compact of [false, true]) {
      this.paper.removeAll(true);
      let y = 10;
      // compact pass: anything that still runs past the paper is left off (never drawn off the sheet)
      const line = (s: string, color = INK, dx = 0) => { const t = txt(this, PX + dx, y, s, { color, maxWidth: PW - dx, shadow: false }); if (compact && y + t.height > PBOTTOM) { t.destroy(); return t; } this.paper.add(t); y += t.height + 1; return t; };
      line(`SHEET ${sh.n}: ${sh.title}`, BLUE);
      if (!compact) line(sh.question);
      if (!compact) line(`Think of it like: ${sh.think}`, TEAL);
      line(sh.formula, BLUE);
      y += 2; line('YOUR NUMBERS:', INK);
      for (const gl of sh.given) line(`• ${gl}`, INK, 4);
      y += 2; line(sh.game ? 'THE GAME WORKS IT OUT:' : 'FILL IN THE BLANKS:', INK);
      sh.steps.forEach((st, i) => {
        const v = this.vals[i];
        const shown = v === null ? (i === active ? '[ ? ]' : '[ ___ ]') : `${st.abs !== undefined ? v.toFixed(st.abs < 0.1 ? 3 : 2) : fmt(v)}${st.unit ? ' ' + st.unit : ''}`;
        line(`${i === active ? '▶' : `${i + 1}.`} ${st.label} = ${shown}`, v === null ? (i === active ? BLUE : INK) : sh.game ? INK : OK, 4);
      });
      for (const e of sh.extra ?? []) line(e, e.startsWith('✓') ? OK : e.startsWith('×') ? RED : TEAL, 4);
      y += 2; line(`TARGET: ${sh.target}`, INK);
      if (active < 0) { const vd = sh.verdict(); line(`${vd.pass ? '✓' : '×'} ${vd.text}`, vd.pass ? OK : RED); if (this.easy && vd.pointer) line(`Change: ${vd.pointer}`, TEAL); }
      if (y <= PBOTTOM) break;
    }
    // side panel: sheet counter, feedback, Easy worked example
    this.side.add(txt(this, 386, 8, `SHEET ${sh.n}/${this.sheets.length} · ${this.easy ? 'EASY' : 'HARD'}`, { align: 'center', color: C.gold })); // clear of the corner buttons
    // sheet actions (sheet 7: Use this fuel)
    const acts = sh.actions ?? [];
    acts.forEach((a, k) => this.side.add(new Button(this, 328, 222 - (acts.length - k) * 17, a.label, () => this.act(a), { w: 144, h: 15, style: 'go', tooltip: 'Set this stage\'s fuel in your build' })));
    const fbBottom = 222 - acts.length * 17 - 2;
    let fy = 149;
    const fb = (s: string, color: number) => { const t = txt(this, 328, fy, s, { maxWidth: 144, color }); if (fy + t.height > fbBottom) { t.destroy(); return; } this.side.add(t); fy += t.height + 2; };
    if (this.feedbackText) fb(this.feedbackText, this.feedbackColor === OK ? C.green : this.feedbackColor === RED ? C.red : C.text);
    if (this.easy && sh.example) fb(`Worked example: ${sh.example}`, C.teal);
    if (sh.game) fb('The game works this one out. Read along, then NEXT.', C.dim);
    else if (active < 0) fb('Sheet done. Enter or NEXT to move on.', C.dim);
    this.feedback.setText('');
  }

  renderBoard() {
    // three sections per page so every row fits the paper at full size
    const all = resultsBoard(store.design, this.stats);
    const pages = Math.ceil(all.length / 3);
    const board = all.slice(this.boardPage * 3, this.boardPage * 3 + 3);
    let y = 10;
    const col = (x: number, s: string, color = INK, w = 140) => { const t = txt(this, x, y, s, { color, maxWidth: w, shadow: false }); this.paper.add(t); return t; };
    col(PX, `FINAL RESULTS BOARD  (${this.boardPage + 1}/${pages})`, BLUE, PW); y += 13;
    for (const sec of board) {
      col(PX, sec.section, BLUE, PW); y += 11;
      for (const r of sec.rows) {
        const a = col(PX + 4, r.label, INK, 120);
        const b = col(PX + 128, `${r.ok === undefined ? '' : r.ok ? '✓ ' : '× '}${r.value}`, r.ok === false ? RED : r.ok ? OK : INK, PW - 128);
        y += Math.max(a.height, b.height) + 1;
      }
      y += 2;
    }
    if (y > PBOTTOM) this.paper.list.slice().forEach((o) => { const t = o as Phaser.GameObjects.BitmapText; if (t.y > PBOTTOM - 10) t.destroy(); });
    this.side.add(txt(this, 400, 8, 'FINAL RESULTS', { align: 'center', color: C.gold }));
    this.side.add(txt(this, 328, 149, 'Launch, or go back to the hangar to improve the design. NEXT flips the board page.', { maxWidth: 144, color: C.text }));
    if (store.deskPenalty) this.side.add(txt(this, 328, 182, `Desk reveals: -${store.deskPenalty} pts`, { maxWidth: 144, color: C.orange }));
    const go = new Button(this, 328, 200, 'LAUNCH ▶', () => this.launch(), { w: 144, h: 18, style: 'go', tooltip: 'To the GO / NO-GO design review (Enter)' });
    this.side.add(go);
  }
}
