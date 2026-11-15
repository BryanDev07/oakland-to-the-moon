import Phaser from 'phaser';
import { byLevel, bodySize, explainLevel, underlineTerms } from '../ui/explain';
import { learned } from '../ui/learned';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, crt, fadeIn, fadeTo, gearButton, modal, modalState, onceKey, panel, txt, W, H } from '../ui/ui';
import { analyzeDesign, DesignStats } from '../../simulation/spacecraft';
import { checkAnswer, evalExpr, resultsBoard, Sheet, Step, warmer } from '../../simulation/calcDesk';
import { buildFiveSheets } from '../../simulation/deskFive';
import { specOf } from '../../simulation/specModel';
import { fmt } from '../../simulation/units';
import { dueDesignCard, applyDesignPick } from '../../simulation/roleDecisions';
import { showRoleCard } from '../ui/roleCard';

/** Desk colour roles (readability spec): numbers from your build, numbers to add, pass, fail. */
/** B2 paper: charcoal text on cream, small dark accents (all readable on #F5EFD8). */
const COL = { body: 0x222222, title: 0x222222, build: 0x1f3a93, add: 0x0f6b6b, pass: 0x1e6b2a, fail: 0x9b1c1c, explain: 0x4a4a4a, paper: 0xf5efd8, rule: 0xa8c8e8, margin: 0xd9534f };
/** The dark side panel keeps light text. */
const SCOL = { body: 0xfff4d6, title: 0xffd27a, build: 0xffe14a, add: 0x6ff0ff, pass: 0x7cf07c, fail: 0xff6a5a, explain: 0xb8e6ff };
const BODY = 15, BIG = 20; // side panel sizes (1.5x and 2x of the pixel font)
/** Paper sizes (B2): body at the crisp 1x size (1.5x doubles some strokes and reads as bold), heading 2x, verdict 1.5x. */
const PHEAD = 20, PVERDICT = 15;
let PBODY = 10; // set from the text-size setting in create() (Large = 12)
const RULE = 16; // ruled-line spacing; body text snaps to it
const PX = 28, PW = 292, PTOP = 12, PBOTTOM = 258; // paper text column (right of the red margin, left of the pencil)
const SX = 352, SW = 122; // the narrower dark side panel
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
  feedbackColor = SCOL.body;
  pencil!: Phaser.GameObjects.Image;
  pencilY = -1;
  showMath = false; // D2 Beginner: formulas behind "see the math"
  constructor() { super('Desk'); }

  create() {
    fadeIn(this);
    audio.music('build');
    this.stats = analyzeDesign(store.design);
    this.easy = specOf(store.design).difficulty !== 'hard';
    PBODY = bodySize(10); // D2: Large text
    this.showMath = false;
    this.sheets = this.stats.spec ? buildFiveSheets(store.design, this.stats) : []; // B1: five sheets
    this.idx = 0; this.calc = ''; this.feedback = ''; this.boardPage = 0;
    // pixel-art desk with a dark chalkboard sheet (high contrast for every colour role)
    this.add.rectangle(0, 0, W, H, 0x3b2414).setOrigin(0, 0);
    const g = this.add.graphics();
    for (let y = 0; y < H; y += 18) { g.fillStyle(0x4a2e19).fillRect(0, y, W, 9); g.fillStyle(0x2e1b0e).fillRect(0, y + 17, W, 1); }
    // notebook paper: cream, thin light-blue rules, one red margin line
    this.add.rectangle(9, 9, 340, 258, 0x000000, 0.45).setOrigin(0, 0);
    this.add.rectangle(6, 6, 340, 258, COL.paper).setOrigin(0, 0).setStrokeStyle(1, 0xc8b88a);
    const grid = this.add.graphics();
    for (let y = RULE + 11; y < 262; y += RULE) grid.fillStyle(COL.rule, 0.7).fillRect(7, y, 338, 1); // text tops at k x 16 sit just above
    grid.fillStyle(COL.margin, 0.8).fillRect(22, 7, 1, 256);
    this.paper = this.add.container(0, 0);
    panel(this, SX - 2, 4, SW + 6, 262, 'panel_dark');
    this.side = this.add.container(0, 0);
    this.makePencil();
    this.pencil = this.add.image(PX + PW + 6, 40, 'desk_pencil').setOrigin(0.15, 0.85).setDepth(50);
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
      else if ((e.key === 'm' || e.key === 'M') && explainLevel() === 'beginner') { this.showMath = !this.showMath; this.render(); }
    }));
    gearButton(this);
    crt(this).v.setVisible(false); // the vignette's dither shows as hatching on cream paper
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
        if (this.easy) this.solve(st.expect, `The sum is ${fmt(st.expect)}.`, SCOL.body); // Easy: show it and move on
        else this.say('Type the sum, or REVEAL (-10).', SCOL.fail);
        return;
      }
      const v = evalExpr(this.calc);
      if (checkAnswer(st, v)) { audio.sfx('success'); this.solve(v, '✓ Right!', SCOL.pass); }
      else if (this.easy) { audio.sfx('error'); this.solve(st.expect, `That is ${warmer(st, v)}. It is ${fmt(st.expect)}.`, SCOL.fail); }
      else { audio.sfx('error'); this.calc = ''; this.say('× Not quite. Try again.', SCOL.fail); }
      return;
    }
    audio.sfx('select');
    if (this.shown <= sh.steps.length) {
      this.shown++; this.feedback = '';
      if (this.shown > sh.steps.length) { if (sh.n <= 2) learned(this, 'weight'); if (sh.n === 5) learned(this, 'far'); } // D1
    }
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
    this.solve(st.expect, `Revealed (-${DESK_REVEAL_PENALTY}): ${fmt(st.expect)}.`, SCOL.fail);
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
    this.say(`Done. Rocket: ${fmt(this.stats.spec!.rocket.dvTotal)} m/s.`, SCOL.pass);
  }
  toHangar() { fadeTo(this, 'Hangar'); }
  launch() {
    if (modalState.open) return;
    // D3: the second design-time role decision comes as the design heads to the review
    const card = dueDesignCard(store.design, 'design2');
    if (card) {
      const d = store.design;
      showRoleCard(this, { title: card.title, text: card.text(d), tip: card.tip, options: card.options.map((o) => ({ label: o.label, good: o.good(d), bad: o.bad(d) })) }, (i) => {
        store.design = applyDesignPick(store.design, card, i);
        store.saveDesign();
        this.launch();
      });
      return;
    }
    fadeTo(this, 'Review');
  }

  // ------------------------------------------------------------------ the pencil (B2)
  /** A small SNES-style pencil, drawn once into a texture: graphite tip, wood, yellow body, band, eraser. */
  makePencil() {
    if (this.textures.exists('desk_pencil')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x1a1a1a).fillRect(0, 13, 3, 3); // outline + graphite tip
    g.fillStyle(0xdcb47a).fillRect(3, 11, 4, 6).fillRect(1, 12, 2, 4); // sharpened wood
    g.fillStyle(0x2a2a2a).fillRect(0, 14, 2, 1);
    g.fillStyle(0xf2c230).fillRect(7, 10, 16, 8); // yellow body
    g.fillStyle(0xffe27a).fillRect(7, 11, 16, 2); // highlight
    g.fillStyle(0xc99a1a).fillRect(7, 16, 16, 2); // shade
    g.fillStyle(0xa8a8b0).fillRect(23, 10, 3, 8); // metal band
    g.fillStyle(0xe8899a).fillRect(26, 10, 4, 8); // eraser
    g.fillStyle(0x1a1a1a).fillRect(7, 9, 23, 1).fillRect(7, 18, 23, 1).fillRect(30, 10, 1, 8);
    g.generateTexture('desk_pencil', 31, 28);
    g.destroy();
  }
  /** Move the pencil to the newest line and scribble briefly (under 0.5 s). */
  movePencil(lineY: number) {
    const ty = lineY + 10;
    if (ty === this.pencilY) return;
    this.pencilY = ty;
    this.tweens.killTweensOf(this.pencil);
    this.pencil.setAngle(-28);
    const reduce = (store.settings as unknown as { reduceMotion?: boolean }).reduceMotion;
    if (reduce) { this.pencil.setPosition(PX + PW + 6, ty); return; }
    this.tweens.add({ targets: this.pencil, x: PX + PW + 6, y: ty, duration: 140, ease: 'Quad.Out', onComplete: () => {
      this.tweens.add({ targets: this.pencil, x: '-=4', angle: -22, duration: 55, yoyo: true, repeat: 2 }); // scribble: 0.33 s
    } });
  }

  // ------------------------------------------------------------------ drawing helpers
  t(x: number, y: number, s: string, color: number, size = BODY, maxWidth = PW, align?: 'left' | 'center' | 'right') {
    const o = txt(this, x, y, s, { color, size, maxWidth, align, shadow: x >= SX - 4 }); // paper text: no shadow (not bold)
    if (x < SX - 4 && size === PBODY) o.setLineSpacing(RULE - 11); // every paper line sits on a ruled line
    return o;
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
  heightOf(s: string, w: number, size = BODY) { const o = this.t(0, -999, s, 0, size, w); const h = o.height; o.destroy(); return h; }

  render() {
    this.paper.removeAll(true);
    this.side.removeAll(true);
    if (this.onBoard()) { this.pencil.setVisible(false); this.pencilY = -1; this.renderBoard(); return; }
    this.pencil.setVisible(true);
    const sh = this.sheet;
    type Line = { s: string; color: number; dx?: number; size?: number };
    const header: Line[] = [
      { s: `${sh.n}. ${sh.title}`, color: COL.title, size: PHEAD },
      // D2: Beginner sees the everyday comparison (maths on request); Curious words + numbers; Engineer the formula
      ...byLevel<Line[]>(
        [{ s: sh.think, color: COL.explain }, ...(this.showMath ? [{ s: sh.formula, color: COL.body }] : [])],
        [{ s: sh.formula, color: COL.body }, ...(this.shown <= 1 ? [{ s: sh.think, color: COL.explain }] : [])],
        [{ s: sh.formulaEngineer ?? sh.formula, color: COL.body }],
      ),
      // while an addition waits, its cyan lines carry the numbers: the build lines step aside
      // your numbers open the sheet; once the steps start, each step line carries its own numbers
      ...(this.pendingAdd() || this.shown > 1 ? [] : sh.given.map((x) => ({ s: x, color: COL.build }))),
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
        if (cur && explainLevel() !== 'engineer') b.push({ s: st.explain ?? '', color: COL.explain, dx: 8 });
        blocks.push(b);
      }
    });
    const done = this.shown > sh.steps.length;
    const vd = done ? sh.verdict() : null;
    if (vd) blocks.push([{ s: `${vd.pass ? '✓' : '×'} ${vd.text}`, color: vd.pass ? COL.pass : COL.fail, size: PVERDICT }, ...(this.easy && vd.pointer ? [{ s: `Change: ${vd.pointer}`, color: COL.explain, dx: 8 }] : []), ...(sh.extra ?? []).map((e) => ({ s: e, color: e.startsWith('×') ? COL.fail : COL.explain, dx: 8 }))]);
    // fit without shrinking: the oldest steps scroll off the top, then the "think" line goes
    const hOf = (ls: Line[]) => ls.reduce((a, l) => a + (l.size ? this.heightOf(l.s, PW - (l.dx ?? 0), l.size) + 4 : Math.ceil((this.heightOf(l.s, PW - (l.dx ?? 0), PBODY) + 2) / RULE) * RULE), 0);
    let hdr = header;
    const room = () => PBOTTOM - PTOP - hOf(hdr) - 22;
    let first = 0;
    while (first < blocks.length - 1 && blocks.slice(first).reduce((a, bl) => a + hOf(bl), 0) > room()) first++;
    if (blocks.slice(first).reduce((a, bl) => a + hOf(bl), 0) > room()) hdr = header.filter((l) => l.color !== COL.explain);
    let y = PTOP;
    let lastY = PTOP;
    const put = (l: Line) => { if (!l.s || y > PBOTTOM - 14) return; if (!l.size) y = Math.ceil(y / RULE) * RULE; if (y + (l.size ? this.heightOf(l.s, PW - (l.dx ?? 0), l.size) : 11) > PBOTTOM) return; const o = this.t(PX + (l.dx ?? 0), y, l.s, l.color, l.size ?? PBODY, PW - (l.dx ?? 0)); this.paper.add(o); underlineTerms(this, o, this.paper, COL.build); lastY = y; y += l.size ? o.height + 4 : Math.ceil((o.height + 2) / RULE) * RULE; };
    hdr.forEach(put);
    y += 4;
    if (first > 0) put({ s: `(${first} earlier step${first > 1 ? 's' : ''} above)`, color: COL.explain });
    blocks.slice(first).forEach((bl) => bl.forEach(put));
    this.movePencil(lastY);
    if (explainLevel() === 'beginner') {
      const m = this.t(PX + PW, PTOP + 22, this.showMath ? 'hide the math (M)' : 'see the math (M)', COL.add, 10, 120, 'right'); // just under the heading
      m.setInteractive({ useHandCursor: true }).on('pointerup', () => { this.showMath = !this.showMath; this.render(); });
      this.paper.add(m);
    }

    // ---- side panel
    const S = this.side;
    S.add(this.t(SX + SW / 2, 22, `SHEET ${sh.n}/${this.sheets.length}`, SCOL.title, BODY, SW, 'center'));
    S.add(this.t(SX + SW / 2, 38, this.easy ? 'EASY' : 'HARD', SCOL.body, BODY, SW, 'center'));
    const add = this.pendingAdd();
    if (add) {
      // addition-only calculator
      S.add(this.add.rectangle(SX, 56, SW, 24, 0x0a1022).setOrigin(0, 0).setStrokeStyle(1, SCOL.add));
      S.add(this.t(SX + SW - 4, 59, this.calc || '0', SCOL.add, BIG, SW - 8, 'right'));
      const keys = [['7', '8', '9', 'C'], ['4', '5', '6', '<'], ['1', '2', '3', '+'], ['0', '.', '=', '']];
      keys.forEach((row, r) => row.forEach((k, c) => { if (!k) return; const b = new Button(this, SX + c * 31, 84 + r * 20, k, () => this.key(k), { w: 29, h: 19 }); b.label.setFontSize(BODY).setY(2); S.add(b); }));
      S.add(this.btn(SX, 165, SW, 'CHECK ✓', () => this.advance(), 'Check your sum (Enter)', 'go'));
      const hint = this.easy ? `Add the ${add.addends!.length} + lines.` : '';
      S.add(this.t(SX + 2, 187, this.feedback || hint, this.feedback ? this.feedbackColor : SCOL.add, BODY, SW - 4));
    } else {
      // big key numbers: the target, then PASS / FAIL once worked
      S.add(this.t(SX + 2, 58, 'TARGET', SCOL.body, BODY, SW - 4));
      S.add(this.t(SX + 2, 74, sh.target, SCOL.build, BODY, SW - 4));
      if (vd) S.add(this.t(SX + 2, 128, `${store.settings.statusIcons ? (vd.pass ? '✓ ' : '× ') : ''}${vd.pass ? 'PASS' : 'FAIL'}`, vd.pass ? SCOL.pass : SCOL.fail, BIG, SW - 4));
      else if (this.feedback) S.add(this.t(SX + 2, 150, this.feedback, this.feedbackColor, BODY, SW - 4));
      const acts = done ? sh.actions ?? [] : [];
      acts.forEach((a, k) => { const b = new Button(this, SX, 156 + k * 21, a.label.replace('USE THIS: ', 'USE ').replace(' LB', ' lb'), () => this.act(a), { w: SW, h: 19, style: 'go' }); S.add(b); }); // 10 px labels fit the narrow panel
      if (!acts.length) S.add(this.t(SX + 2, 180, done ? 'Enter: next sheet' : 'Enter: next step', SCOL.explain, BODY, SW - 4));
    }
    S.add(this.btn(SX, 222, 59, 'NEXT ▶', () => this.advance(), 'Next step (Enter or →)'));
    S.add(this.btn(SX + 63, 222, 59, 'HANGAR', () => this.toHangar(), 'Change parts and come back; your progress stays.'));
    S.add(this.btn(SX, 244, 59, 'SKIP ▶▶', () => this.skipSheet(), 'Skip this sheet (S)'));
    if (this.easy && sh.example) S.add(this.btn(SX + 63, 244, 59, 'EXAMPLE', () => this.example(), 'A worked example (E)'));
    else if (!this.easy && add) S.add(this.btn(SX + 63, 244, 59, 'REVEAL', () => this.reveal(), `Show the sum (-${DESK_REVEAL_PENALTY} points)`));
  }

  renderBoard() {
    const all = resultsBoard(store.design, this.stats);
    // paginate at full size: section headers and rows flow onto pages that fit the sheet
    type Row = { label: string; value: string; ok?: boolean; head?: boolean };
    const rows: Row[] = all.flatMap((sec) => [{ label: sec.section, value: '', head: true } as Row, ...sec.rows]);
    const rowH = (r: Row) => (r.head ? 21 : Math.max(this.heightOf(r.label, 126, PBODY), this.heightOf(`${r.ok === undefined ? '' : '✓ '}${r.value}`, PW - 140, PBODY)) + 3);
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
    this.paper.add(this.t(PX, py, `FINAL RESULTS  ${this.boardPage + 1}/${pages.length}`, COL.title, PHEAD)); py += 24;
    for (const r of pages[this.boardPage]) {
      if (r.head) { this.paper.add(this.t(PX, py + 2, r.label, COL.title)); py += 21; continue; }
      const a = this.t(PX + 4, py, r.label, COL.body, PBODY, 126);
      const b = this.t(PX + 140, py, `${r.ok === undefined ? '' : r.ok ? '✓ ' : '× '}${r.value}`, r.ok === false ? COL.fail : r.ok ? COL.pass : COL.build, PBODY, PW - 140);
      this.paper.add([a, b]); py += Math.max(a.height, b.height) + 3;
    }
    const S = this.side;
    S.add(this.t(SX + SW / 2, 8, 'RESULTS', SCOL.title, BODY, SW, 'center'));
    S.add(this.t(SX + 2, 40, 'Launch, or go back and improve the design.', SCOL.body, BODY, SW - 4));
    if (store.deskPenalty) S.add(this.t(SX + 2, 110, `Reveals: -${store.deskPenalty} pts`, SCOL.fail, BODY, SW - 4));
    S.add(this.btn(SX, 150, SW, 'LAUNCH ▶', () => this.launch(), 'To the GO / NO-GO review (Enter)', 'go'));
    S.add(this.btn(SX, 222, 59, 'PAGE ▶', () => { this.boardPage++; this.render(); }, 'Next board page (S)'));
    S.add(this.btn(SX + 63, 222, 59, 'HANGAR', () => this.toHangar()));
    S.add(this.btn(SX, 244, SW, '◀ SHEETS', () => this.prevSheet(), 'Back to sheet 15 (←)'));
  }
}
