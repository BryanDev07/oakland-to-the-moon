/**
 * Retro UI kit built on Phaser BitmapText + NineSlice. Every widget uses the generated pixel art.
 */
import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';

export const W = 480, H = 270;
export const C = {
  white: 0xffffff, text: 0xe8e8f2, dim: 0x8a8aa0, gold: 0xf4c63c, gold2: 0xffe27a, blue: 0x86b2ee, teal: 0x80d4bc,
  green: 0x7fbc58, red: 0xee6448, orange: 0xff9e3a, purple: 0xc098d4, ink: 0x08060f, navy: 0x0e1433,
};
export const ICON_NAMES = ['fuel', 'battery', 'power', 'sun', 'o2', 'water', 'comms', 'science', 'mass', 'cost', 'crew', 'warn', 'ok', 'fail', 'clock', 'data', 'thermal', 'guidance', 'safety', 'engine', 'rocket', 'moon', 'earth', 'star', 'lock', 'sample', 'pause', 'play', 'ffwd', 'sound', 'mute', 'gear', 'radiation'];
export const iconFrame = (n: string) => Math.max(0, ICON_NAMES.indexOf(n));

export interface TxtOpts { color?: number; scale?: 1 | 2 | 3; size?: number; align?: 'left' | 'center' | 'right'; maxWidth?: number; shadow?: boolean; origin?: [number, number]; depth?: number }
/** D2: Large text setting (body text that wraps or pages grows; fixed rows keep their size). */
export const largeText = () => store.settings.textSize === 'large';

export function txt(scene: Phaser.Scene, x: number, y: number, s: string, o: TxtOpts = {}): Phaser.GameObjects.BitmapText {
  const t = scene.add.bitmapText(Math.round(x), Math.round(y), 'px', s, o.size ?? 10 * (o.scale ?? 1));
  if (o.maxWidth) t.setMaxWidth(o.maxWidth);
  t.setTint(o.color ?? C.text);
  if (o.align === 'center') { t.setCenterAlign?.(); t.setOrigin(0.5, 0); }
  if (o.align === 'right') { t.setRightAlign?.(); t.setOrigin(1, 0); }
  if (o.origin) t.setOrigin(o.origin[0], o.origin[1]);
  if (o.shadow !== false) t.setDropShadow(1, 1, C.ink, 1);
  if (o.depth !== undefined) t.setDepth(o.depth);
  return t;
}

/**
 * Text that never clips (A3): wrapped to w and split into pages that fit maxH. With more than one page
 * a small "1/2 >" counter appears at the bottom right (click it, or pages turn every autoMs).
 */
export function pagedText(scene: Phaser.Scene, x: number, y: number, w: number, maxH: number, text: string, o: TxtOpts & { autoMs?: number } = {}): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const t = txt(scene, x, y, '', { ...o, maxWidth: w });
  c.add(t);
  const split = (room: number) => {
    const out: string[] = [];
    let cur = '';
    for (const tok of text.split(/(\n| )/)) {
      if (tok === ' ' && !cur) continue;
      const next = cur + tok;
      t.setText(next.trimEnd());
      if (t.height > room && cur.trim()) { out.push(cur.trimEnd()); cur = tok === ' ' || tok === '\n' ? '' : tok; } else cur = next;
    }
    if (cur.trim()) out.push(cur.trimEnd());
    return out.length ? out : [''];
  };
  let pages = split(maxH);
  if (pages.length > 1) pages = split(maxH - 11); // leave room for the page counter
  let i = 0;
  const counter = pages.length > 1 ? txt(scene, x + w, y + maxH - 10, '', { align: 'right', color: C.teal }) : null;
  const show = () => { t.setText(pages[i]); counter?.setText(`${i + 1}/${pages.length} >`); };
  show();
  if (counter) {
    c.add(counter);
    counter.setInteractive({ useHandCursor: true }).on('pointerup', () => { i = (i + 1) % pages.length; show(); });
    if (o.autoMs) {
      const ev = scene.time.addEvent({ delay: o.autoMs, loop: true, callback: () => { i = (i + 1) % pages.length; show(); } });
      c.once('destroy', () => ev.remove(false));
    }
  }
  return c;
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, key = 'panel'): Phaser.GameObjects.NineSlice {
  const p = scene.add.nineslice(Math.round(x), Math.round(y), key, undefined, Math.round(w), Math.round(h), 8, 8, 8, 8);
  p.setOrigin(0, 0);
  return p;
}

export function icon(scene: Phaser.Scene, x: number, y: number, name: string): Phaser.GameObjects.Image {
  return scene.add.image(Math.round(x), Math.round(y), 'icons', iconFrame(name)).setOrigin(0, 0);
}

// ----------------------------------------------------------------- Button
export interface ButtonOpts { w?: number; h?: number; icon?: string; style?: 'normal' | 'go' | 'quiet'; key?: string; tooltip?: string; disabled?: boolean; scale?: 1 | 2 }
export class Button extends Phaser.GameObjects.Container {
  bg: Phaser.GameObjects.NineSlice;
  label: Phaser.GameObjects.BitmapText;
  ic?: Phaser.GameObjects.Image;
  disabled = false;
  selected = false;
  private hovering = false;
  private styleKey: string;
  onClick: () => void;
  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, o: ButtonOpts = {}) {
    super(scene, Math.round(x), Math.round(y));
    const w = o.w ?? Math.max(48, text.length * 6 + (o.icon ? 26 : 16));
    const h = o.h ?? 18;
    this.styleKey = o.style === 'go' ? 'button_go' : 'button';
    this.bg = scene.add.nineslice(0, 0, this.styleKey, undefined, w, h, 4, 4, 4, 4).setOrigin(0, 0);
    this.add(this.bg);
    let tx = w / 2;
    if (o.icon) { this.ic = scene.add.image(6, Math.round(h / 2 - 6), 'icons', iconFrame(o.icon)).setOrigin(0, 0); this.add(this.ic); tx = w / 2 + 6; }
    this.label = txt(scene, Math.round(tx), Math.round(h / 2 - 5 * (o.scale ?? 1)) - (o.scale === 2 ? 1 : 0), text, { align: 'center', color: C.white, scale: o.scale ?? 1 });
    // never clip: a label wider than its button drops to the small font
    if (this.label.width > w - 4) this.label.setFontSize(8).setY(Math.round(h / 2 - 4));
    this.add(this.label);
    this.setSize(w, h);
    this.onClick = onClick;
    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on('pointerover', () => { if (this.disabled) return; this.hovering = true; audio.sfx('move'); this.refresh(); if (o.tooltip) Tooltip.show(scene, o.tooltip, this); });
    this.bg.on('pointerout', () => { this.hovering = false; this.refresh(); Tooltip.hide(scene); });
    this.bg.on('pointerdown', () => { this.y += 1; });
    this.bg.on('pointerup', () => { this.y = Math.round(y); if (this.disabled) { audio.sfx('error'); return; } audio.unlock(); audio.sfx('select'); this.onClick(); });
    this.bg.on('pointerupoutside', () => { this.y = Math.round(y); });
    if (o.disabled) this.setDisabled(true);
    scene.add.existing(this);
  }
  refresh() {
    const key = this.disabled ? 'button_off' : this.hovering || this.selected ? 'button_hover' : this.styleKey;
    this.bg.setTexture(key);
    this.label.setTint(this.disabled ? C.dim : this.selected ? C.gold2 : C.white);
    return this;
  }
  setDisabled(v: boolean) { this.disabled = v; return this.refresh(); }
  setSelected(v: boolean) { this.selected = v; return this.refresh(); }
  setText(s: string) { this.label.setText(s); return this; }
}

// ----------------------------------------------------------------- Meter
export class Meter extends Phaser.GameObjects.Container {
  bar: Phaser.GameObjects.Graphics;
  valueText: Phaser.GameObjects.BitmapText;
  labelText: Phaser.GameObjects.BitmapText;
  w: number;
  constructor(scene: Phaser.Scene, x: number, y: number, w: number, label: string, iconName?: string) {
    super(scene, Math.round(x), Math.round(y));
    this.w = w;
    let lx = 0;
    if (iconName) { this.add(scene.add.image(0, 0, 'icons', iconFrame(iconName)).setOrigin(0, 0)); lx = 14; }
    this.labelText = txt(scene, lx, 1, label, { color: C.dim });
    this.valueText = txt(scene, w, 1, '', { align: 'right' });
    this.bar = scene.add.graphics();
    this.add([this.labelText, this.valueText, this.bar]);
    scene.add.existing(this);
  }
  /** frac 0..1; marker optional threshold line; status text for colour-independent reading */
  set(frac: number, value: string, color?: number, marker?: number) {
    const f = Math.max(0, Math.min(1, frac));
    const c = color ?? (f < 0.15 ? C.red : f < 0.35 ? C.orange : C.green);
    const g = this.bar; g.clear();
    const y = 12, w = this.w;
    g.fillStyle(C.ink).fillRect(0, y, w, 6);
    g.fillStyle(0x080a1e).fillRect(1, y + 1, w - 2, 4);
    g.fillStyle(c).fillRect(1, y + 1, Math.round((w - 2) * f), 4);
    g.fillStyle(0xffffff, 0.35).fillRect(1, y + 1, Math.round((w - 2) * f), 1);
    for (let i = 1; i < 10; i++) g.fillStyle(C.ink, 0.5).fillRect(Math.round((w * i) / 10), y + 1, 1, 4);
    if (marker !== undefined) g.fillStyle(C.white).fillRect(Math.round(1 + (w - 2) * Math.max(0, Math.min(1, marker))), y - 1, 1, 8);
    this.valueText.setText(value).setFontSize(10).setTint(c === C.red ? C.red : c === C.orange ? C.orange : C.text);
    // never run into the label: trim at full size (the pixel font is unreadable when scaled down)
    const room = this.w - (this.labelText.x + this.labelText.width + 4);
    while (this.valueText.width > room && this.valueText.text.length > 3) this.valueText.setText(this.valueText.text.slice(0, -2) + '…');
    return this;
  }
}

// ----------------------------------------------------------------- Tooltip
/** The hovered thing's bounds; with abs: true, x / y are the tooltip's own top-left instead. */
type Anchor = { x: number; y: number; width?: number; height?: number; parentContainer?: Phaser.GameObjects.Container | null; abs?: boolean };
const tooltipScenes = new WeakSet<Phaser.Scene>();
/**
 * Hover help. Appears after 400 ms of hovering, disappears on mouse-out, click or any key, and is
 * placed beside the hovered thing (above it in the lower half of the screen, below it in the upper
 * half), never on top of it.
 */
export const Tooltip = {
  obj: null as Phaser.GameObjects.Container | null,
  timer: null as Phaser.Time.TimerEvent | null,
  DELAY: 400,
  show(scene: Phaser.Scene, text: string, anchor?: Anchor) {
    this.hide(scene);
    if (!tooltipScenes.has(scene)) {
      tooltipScenes.add(scene);
      scene.input.keyboard?.on('keydown', () => Tooltip.hide());
      scene.input.on('pointerdown', () => Tooltip.hide());
      scene.events.once('shutdown', () => { tooltipScenes.delete(scene); Tooltip.hide(); });
    }
    const at = anchor ?? { x: scene.input.activePointer.x, y: scene.input.activePointer.y, width: 1, height: 1 };
    this.timer = scene.time.delayedCall(this.DELAY, () => { this.timer = null; this.draw(scene, text, at); });
  },
  draw(scene: Phaser.Scene, text: string, anchor: Anchor) {
    let maxW = 280;
    const t = txt(scene, 6, 5, text, { maxWidth: maxW - 12, color: C.white, size: largeText() ? 20 : 15 });
    if (t.height + 11 > H - 4) { maxW = W - 8; t.setMaxWidth(maxW - 12); }
    if (t.height + 11 > H - 4) t.setFontSize(10).setMaxWidth(maxW - 12);
    const h = Math.max(18, t.height + 11);
    maxW = Math.min(maxW, Math.ceil(t.width) + 14); // hug the text
    const c = scene.add.container(0, 0);
    c.add(panel(scene, 0, 0, maxW, h, 'tooltip'));
    c.add(t);
    let ax = anchor.x, ay = anchor.y;
    if (anchor.parentContainer) { ax += anchor.parentContainer.x; ay += anchor.parentContainer.y; }
    if (anchor.abs) { c.setPosition(Math.round(Math.max(2, Math.min(ax, W - maxW - 2))), Math.round(Math.max(2, Math.min(ay, H - h - 2)))).setDepth(1000); pinToScreen(c); this.obj = c; return; }
    const aw = anchor.width ?? 1, ah = anchor.height ?? 1;
    // beside the anchor, never over it: above it in the lower half, below it in the upper half
    let y = ay + ah / 2 > H / 2 ? ay - h - 3 : ay + ah + 3;
    if (y < 2) y = ay + ah + 3;
    if (y + h > H - 2) y = Math.max(2, ay - h - 3);
    let x = ax + aw / 2 - maxW / 2;
    x = Math.max(2, Math.min(x, W - maxW - 2));
    c.setPosition(Math.round(x), Math.round(Math.max(2, Math.min(y, H - h - 2)))).setDepth(1000);
    pinToScreen(c);
    this.obj = c;
  },
  hide(_scene?: Phaser.Scene) {
    if (this.timer) { this.timer.remove(false); this.timer = null; }
    if (this.obj) { this.obj.destroy(); this.obj = null; }
  },
};

// ----------------------------------------------------------------- Dialogue
export interface Line { who: string; text: string; portrait?: string }
const SPEEDS = { slow: 22, normal: 45, fast: 90, instant: 100000 };
/**
 * Character dialogue (Director Cole, CAPCOM Sam, Commander Kai, Mission Control). Readable 15 px text
 * in a box no taller than about a quarter of the screen, anchored to the top or bottom edge (away
 * from the action). Long lines are split into pages (click / Enter for the next page); the box never grows.
 */
export class Dialogue extends Phaser.GameObjects.Container {
  static readonly H = 62; // 62 / 270: under a quarter of the screen
  static readonly LINES = 2;
  lines: Line[] = [];
  idx = 0;
  shown = 0;
  full = '';
  done?: () => void;
  bodyText: Phaser.GameObjects.BitmapText;
  nameText: Phaser.GameObjects.BitmapText;
  portrait: Phaser.GameObjects.Image;
  frame: Phaser.GameObjects.NineSlice;
  arrow: Phaser.GameObjects.Sprite;
  hint: Phaser.GameObjects.BitmapText;
  private typing = false;
  private accum = 0;
  private keyHandler: (e: KeyboardEvent) => void;
  /** where: 'bottom' (default), 'top', or an explicit y. */
  constructor(scene: Phaser.Scene, where: number | 'top' | 'bottom' = 'bottom') {
    const h = Dialogue.H;
    super(scene, 6, typeof where === 'number' ? Math.min(where, H - h - 4) : where === 'top' ? 4 : H - h - 4);
    const w = W - 12;
    this.frame = panel(scene, 0, 0, w, h, 'dialog');
    this.portrait = scene.add.image(6, 6, 'portrait_kai').setOrigin(0, 0).setScale(0.75); // smaller portrait
    this.nameText = txt(scene, 50, 5, '', { color: C.gold2 });
    this.bodyText = txt(scene, 50, 17, '', { maxWidth: w - 64, color: C.white, size: largeText() ? 20 : 15 });
    this.arrow = scene.add.sprite(w - 14, h - 12, 'arrow', 0).setOrigin(0, 0);
    this.arrow.play('arrow-blink');
    this.hint = txt(scene, w - 18, h - 12, '', { align: 'right', color: 0x9fe0ff });
    this.add([this.frame, this.portrait, this.nameText, this.bodyText, this.arrow, this.hint]);
    this.setDepth(500);
    this.frame.setInteractive({ useHandCursor: true }).on('pointerup', () => this.advance());
    this.keyHandler = (e: KeyboardEvent) => { if (!this.visible) return; if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') this.advance(); };
    scene.input.keyboard?.on('keydown', this.keyHandler);
    scene.events.on('update', this.tick, this);
    scene.events.once('shutdown', () => { scene.events.off('update', this.tick, this); scene.input.keyboard?.off('keydown', this.keyHandler); });
    scene.add.existing(this);
    this.setVisible(false);
  }
  /** Text width for a line (narrower when there is a portrait). */
  private bodyX(l: Line) { return l.portrait && this.scene.textures.exists(l.portrait) ? 50 : 10; }
  /** Split a line into pages of at most LINES wrapped lines at the box's width. */
  paginate(l: Line): Line[] {
    const w = W - 12 - this.bodyX(l) - 14;
    const big = largeText();
    const probe = txt(this.scene, 0, -999, '', { maxWidth: w, size: big ? 20 : 15 });
    const maxH = big ? 2 * 21 + 2 : Dialogue.LINES * 16 + 2;
    const pages: string[] = [];
    let cur = '';
    for (const word of l.text.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      probe.setText(next);
      if (probe.height > maxH && cur) { pages.push(cur); cur = word; } else cur = next;
    }
    if (cur) pages.push(cur);
    probe.destroy();
    return pages.map((t) => ({ ...l, text: t }));
  }
  play(lines: Line[], done?: () => void) {
    // one box at a time: close any toast now showing; queued toasts wait until this dialogue ends
    const q = toastQueue(this.scene);
    q.current?.destroy(); q.current = null; q.busy = true;
    this.lines = lines.flatMap((l) => this.paginate(l)); this.idx = 0; this.done = done; this.setVisible(true); this.showLine();
    return this;
  }
  private showLine() {
    const l = this.lines[this.idx];
    this.nameText.setText(l.who.toUpperCase());
    const hasP = !!l.portrait && this.scene.textures.exists(l.portrait);
    this.portrait.setVisible(hasP);
    if (hasP) this.portrait.setTexture(l.portrait!);
    const bx = this.bodyX(l);
    this.nameText.setX(bx); this.bodyText.setX(bx).setMaxWidth(W - 12 - bx - 14);
    this.full = l.text; this.shown = 0; this.typing = true; this.accum = 0;
    this.bodyText.setText('');
    this.arrow.setVisible(false); this.hint.setVisible(false);
  }
  private tick(_t: number, dt: number) {
    if (!this.visible || !this.typing) return;
    this.accum += (dt / 1000) * SPEEDS[store.settings.textSpeed];
    const n = Math.min(this.full.length, Math.floor(this.accum));
    if (n !== this.shown) { this.shown = n; this.bodyText.setText(this.full.slice(0, n)); if (n % 3 === 0) audio.sfx('blip'); }
    if (n >= this.full.length) this.finishTyping();
  }
  private finishTyping() {
    this.typing = false; this.shown = this.full.length; this.bodyText.setText(this.full);
    const more = this.idx < this.lines.length - 1;
    this.arrow.setVisible(true);
    this.hint.setText(more ? 'MORE' : 'OK').setVisible(true);
  }
  advance() {
    if (!this.visible) return;
    if (this.typing) { this.finishTyping(); return; }
    audio.sfx('move');
    this.idx++;
    if (this.idx >= this.lines.length) {
      this.setVisible(false);
      const q = toastQueue(this.scene); q.busy = false; const nxt = q.queue.shift(); if (nxt) this.scene.time.delayedCall(300, nxt);
      const d = this.done; this.done = undefined; d?.(); return;
    }
    this.showLine();
  }
}

/**
 * Phaser can hand the same browser key event to a 'keydown' listener more than once when keys
 * arrive quickly (fast typing, scripted input). Wrap handlers so each event is handled once.
 */
export function onceKey(fn: (e: KeyboardEvent) => void) {
  const seen = new WeakSet<KeyboardEvent>();
  return (e: KeyboardEvent) => { if (seen.has(e)) return; seen.add(e); fn(e); };
}

// ----------------------------------------------------------------- Modal (choices)
/** How many modals are open: scenes ignore their own Enter / arrow keys while one is up. */
export const modalState = { open: 0 };
export function modal(scene: Phaser.Scene, opts: { title: string; text: string; learn?: string; options: { label: string; detail?: string; good?: string; bad?: string }[]; alert?: boolean; onChoose: (i: number) => void; width?: number; size?: number }) {
  let chosen = false;
  const choose = (i: number) => { if (chosen) return; chosen = true; cleanup(); opts.onChoose(i); };
  let btns: Button[] = []; // the option buttons of the current layout (keyboard: Up / Down + Enter)
  let sel = 0;
  /** Lay the modal out at width w and font size `size`; returns the container and its height. */
  const build = (w: number, size: number) => {
    btns = [];
    const c = scene.add.container(0, 0).setDepth(900);
    c.add(scene.add.rectangle(0, 0, W, H, 0x04030c, 0.72).setOrigin(0, 0).setInteractive());
    const x = Math.round((W - w) / 2);
    const lh = size / 10;
    const body = txt(scene, x + 12, 0, opts.text, { maxWidth: w - 24, color: C.white, size });
    const learn = opts.learn ? txt(scene, x + 26, 0, opts.learn, { maxWidth: w - 40, color: C.teal, size }) : null;
    c.add(body); if (learn) c.add(learn);
    // option sub-lines: detail (blue), Good (green), Bad (red); heights measured so nothing overlaps
    const subs = opts.options.map((o) => [
      ...(o.detail ? [txt(scene, 0, 0, o.detail, { color: C.blue, maxWidth: w - 44, size })] : []),
      ...(o.good ? [txt(scene, 0, 0, `Good: ${o.good}`, { color: C.green, maxWidth: w - 44, size })] : []),
      ...(o.bad ? [txt(scene, 0, 0, `Bad: ${o.bad}`, { color: C.red, maxWidth: w - 44, size })] : []),
    ]);
    const optH = subs.map((ps) => (ps.length ? Math.round(16 * lh) + ps.reduce((a, t) => a + t.height, 0) + 3 : Math.round(20 * lh)));
    const top = size > 10 ? 28 : 22;
    const h = top + body.height + 8 + (learn ? learn.height + 10 : 0) + optH.reduce((a, b) => a + b, 0) + 8;
    const y = Math.round(Math.max(4, (H - h) / 2));
    c.addAt(panel(scene, x, y, w, h, opts.alert ? 'panel_alert' : 'panel'), 1);
    c.add(txt(scene, x + w / 2, y + 7, opts.title, { align: 'center', color: opts.alert ? C.gold2 : C.gold, maxWidth: w - 30, size: Math.max(10, size) }));
    if (opts.alert) c.add(scene.add.image(x + 8, y + 6, 'icons', iconFrame('warn')).setOrigin(0, 0));
    body.setY(y + top);
    let cy = y + top + body.height + 8;
    if (learn) { learn.setY(cy); c.add(scene.add.image(x + 12, cy - 1, 'icons', iconFrame('science')).setOrigin(0, 0)); cy += learn.height + 10; }
    opts.options.forEach((o, i) => {
      const b = new Button(scene, x + 10, cy, `${i + 1}. ${o.label}`, () => choose(i), { w: w - 20, h: optH[i] - 2 });
      btns.push(b);
      b.label.setFontSize(size).setMaxWidth(w - 40).setOrigin(0, 0).setX(8).setY(Math.round(4 * lh)).setLeftAlign?.();
      let oy = Math.round(15 * lh);
      for (const t of subs[i]) { t.setPosition(14, oy); b.add(t); oy += t.height; }
      void o;
      c.add(b);
      cy += optH[i];
    });
    return { c, h };
  };
  // Readable first (15 px). Never clip: grow to the screen width, then step the font down.
  const base = opts.size ?? (largeText() ? 20 : 15);
  let w = Math.min(Math.max(opts.width ?? 340, base > 10 ? 400 : 0), W - 8);
  let r = build(w, base);
  if (r.h > H - 8 && w < W - 8) { r.c.destroy(); w = W - 8; r = build(w, base); }
  if (r.h > H - 8 && base > 10) { r.c.destroy(); r = build(w, 10); }
  if (r.h > H - 8) { r.c.destroy(); r = build(w, 8); }
  const c = pinToScreen(r.c); // stays put in scenes whose camera scrolls (launch, landing)
  const mark = () => btns.forEach((b, i) => b.setSelected(i === sel));
  mark();
  const keyH = onceKey((e: KeyboardEvent) => {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= opts.options.length) { audio.sfx('select'); choose(n - 1); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { sel = (sel + 1) % btns.length; audio.sfx('move'); mark(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { sel = (sel + btns.length - 1) % btns.length; audio.sfx('move'); mark(); }
    else if (e.key === 'Enter') { audio.sfx('select'); choose(sel); }
  });
  scene.input.keyboard?.on('keydown', keyH);
  modalState.open++;
  let closed = false;
  const release = () => { if (!closed) { closed = true; modalState.open = Math.max(0, modalState.open - 1); } };
  function cleanup() { release(); scene.input.keyboard?.off('keydown', keyH); c.destroy(); }
  scene.events.once('shutdown', () => { release(); scene.input.keyboard?.off('keydown', keyH); });
  return c;
}

/** Pin a container and everything in it to the screen (ignores camera scroll, keeps clicks aligned). */
export function pinToScreen<T extends Phaser.GameObjects.Container>(c: T): T {
  c.setScrollFactor(0);
  c.each((o: Phaser.GameObjects.GameObject) => {
    (o as unknown as { setScrollFactor?: (v: number) => void }).setScrollFactor?.(0);
    if (o instanceof Phaser.GameObjects.Container) pinToScreen(o);
  });
  return c;
}

// ----------------------------------------------------------------- Toast (mission control message)
/** One toast on screen at a time: later ones wait their turn (never drawn over an older box). */
const toastQueues = new WeakMap<Phaser.Scene, { busy: boolean; queue: (() => void)[]; current: Phaser.GameObjects.Container | null }>();
function toastQueue(scene: Phaser.Scene) {
  let q = toastQueues.get(scene);
  if (!q) { q = { busy: false, queue: [], current: null }; toastQueues.set(scene, q); scene.events.once('shutdown', () => toastQueues.delete(scene)); }
  return q;
}
/**
 * Mission Control / CAPCOM message: at most two lines (about a fifth of the screen), top right, clear of
 * the resource meters and time buttons. Long messages page; messages queue so only one box shows.
 */
export function toast(scene: Phaser.Scene, who: string, text: string, portrait = 'portrait_capcom', ms = 4200): void {
  const q = toastQueue(scene);
  const run = () => {
    q.busy = true;
    const probe = txt(scene, 0, -999, '', { maxWidth: 214, size: 15 });
    const pages: string[] = [];
    let cur = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      probe.setText(next);
      if (probe.height > 2 * 16 + 2 && cur) { pages.push(cur); cur = word; } else cur = next;
    }
    if (cur) pages.push(cur);
    probe.destroy();
    const done = () => { q.busy = false; const nxt = q.queue.shift(); if (nxt && scene.sys.isActive()) nxt(); };
    const show = (i: number) => {
      const c = scene.add.container(W - 256, 21).setDepth(800); // below the SKIP / fullscreen / gear buttons
      q.current = c;
      const t = txt(scene, 34, 15, pages[i] ?? '', { maxWidth: 214, color: C.white, size: 15 });
      const h = Math.max(36, t.height + 21);
      c.add(panel(scene, 0, 0, 252, h, 'dialog'));
      const pi = scene.add.image(4, 4, portrait).setOrigin(0, 0).setScale(0.5);
      c.add([pi, txt(scene, 34, 4, `${who.toUpperCase()}${pages.length > 1 ? `  ${i + 1}/${pages.length}` : ''}`, { color: C.gold2 }), t]);
      pinToScreen(c);
      c.setAlpha(0);
      scene.tweens.add({ targets: c, alpha: 1, duration: 200 });
      const per = pages.length > 1 ? Math.max(2600, ms * 0.8) : ms;
      scene.time.delayedCall(per, () => { if (!c.active) return; scene.tweens.add({ targets: c, alpha: 0, duration: 250, onComplete: () => { c.destroy(); if (q.current === c) q.current = null; if (i + 1 < pages.length && scene.sys.isActive()) show(i + 1); else done(); } }); });
    };
    audio.sfx('beep');
    show(0);
  };
  if (q.busy) q.queue.push(run); else run();
}

/**
 * Small one-line notice (e.g. "Stage 1 now burns methane + LOX"): at most about 15% of the screen,
 * placed where the caller says (over the art, never over the panel being edited), gone after 3 s or
 * on any click or key. A new notice replaces the old one.
 */
const notices = new WeakMap<Phaser.Scene, Phaser.GameObjects.Container>();
export function notice(scene: Phaser.Scene, text: string, at: { x: number; y: number; w?: number } = { x: W / 2, y: 30 }) {
  notices.get(scene)?.destroy();
  const w = at.w ?? 200;
  const t = txt(scene, w / 2, 5, text, { align: 'center', color: C.white, maxWidth: w - 12 });
  const h = Math.min(Math.round(H * 0.15), t.height + 10);
  const c = scene.add.container(Math.round(at.x - w / 2), at.y).setDepth(820);
  c.add([panel(scene, 0, 0, w, h, 'dialog'), t]);
  pinToScreen(c);
  notices.set(scene, c);
  const hide = () => { if (c.active) c.destroy(); if (notices.get(scene) === c) notices.delete(scene); scene.input.keyboard?.off('keydown', hide); scene.input.off('pointerdown', hide); };
  scene.time.delayedCall(3000, hide);
  scene.time.delayedCall(50, () => { scene.input.keyboard?.once('keydown', hide); scene.input.once('pointerdown', hide); });
  audio.sfx('beep');
}

// ----------------------------------------------------------------- transitions & chrome
export function fadeTo(scene: Phaser.Scene, key: string, data?: object, ms = 350) {
  if ((scene as unknown as { _leaving?: boolean })._leaving) return;
  (scene as unknown as { _leaving?: boolean })._leaving = true;
  Tooltip.hide();
  scene.input.enabled = false;
  scene.cameras.main.fadeOut(ms, 4, 3, 12);
  scene.cameras.main.once('camerafadeoutcomplete', () => { scene.scene.start(key, data); });
}
export function fadeIn(scene: Phaser.Scene, ms = 350) {
  (scene as unknown as { _leaving?: boolean })._leaving = false;
  scene.input.enabled = true;
  scene.cameras.main.fadeIn(ms, 4, 3, 12);
}

/** CRT polish: subtle scanlines + vignette, fixed to camera, above everything. */
export function crt(scene: Phaser.Scene) {
  const v = scene.add.image(0, 0, 'vignette').setOrigin(0, 0).setScrollFactor(0).setDepth(2000);
  const s = scene.add.tileSprite(0, 0, W, H, 'scanline').setOrigin(0, 0).setScrollFactor(0).setDepth(2001).setAlpha(0.35); // light: keeps text contrast
  s.setVisible(store.settings.scanlines);
  return { v, s };
}

export function chapterCard(scene: Phaser.Scene, num: number, title: string, onDone?: () => void) {
  const c = scene.add.container(0, 0).setDepth(1500).setScrollFactor(0);
  const bg = scene.add.rectangle(0, 0, W, H, 0x04030c, 1).setOrigin(0, 0);
  const a = txt(scene, W / 2, 104, `CHAPTER ${num}`, { align: 'center', color: C.gold });
  const b = txt(scene, W / 2, 120, title, { align: 'center', color: C.white, scale: 2 });
  const line = scene.add.rectangle(W / 2, 146, 0, 1, C.gold).setOrigin(0.5, 0);
  c.add([bg, a, b, line]);
  scene.tweens.add({ targets: line, width: 200, duration: 600, ease: 'Cubic.Out' });
  scene.time.delayedCall(1700, () => scene.tweens.add({ targets: c, alpha: 0, duration: 450, onComplete: () => { c.destroy(); onDone?.(); } }));
  return c;
}

/** Gear button that opens the pause/settings overlay. */
export function gearButton(scene: Phaser.Scene, x = W - 18, y = 3) {
  fullscreenButton(scene, x - 17, y);
  const b = new Button(scene, x, y, '', () => openOverlay(scene), { w: 15, h: 15, icon: 'gear', tooltip: 'Pause, settings & help (Esc)' });
  b.ic?.setX(2).setY(2);
  b.setDepth(1200).setScrollFactor(0);
  scene.input.keyboard?.on('keydown-ESC', () => openOverlay(scene));
  return b;
}
/** Fullscreen toggle (also the F key, see main.ts). Draws four corner brackets. */
export function fullscreenButton(scene: Phaser.Scene, x: number, y: number) {
  const b = new Button(scene, x, y, '', () => scene.scale.toggleFullscreen(), { w: 15, h: 15, tooltip: 'Fullscreen on/off (F)' });
  const g = scene.add.graphics().lineStyle(1, C.white, 1);
  for (const [cx, cy, dx, dy] of [[3, 3, 1, 1], [11, 3, -1, 1], [3, 11, 1, -1], [11, 11, -1, -1]]) { g.lineBetween(cx, cy, cx + 3 * dx, cy); g.lineBetween(cx, cy, cx, cy + 3 * dy); }
  b.add(g);
  b.setDepth(1200).setScrollFactor(0);
  g.setScrollFactor(0);
  return b;
}
export function openOverlay(scene: Phaser.Scene) {
  if (scene.scene.isActive('Overlay')) return;
  scene.scene.pause();
  scene.scene.launch('Overlay', { from: scene.scene.key });
}

export function fmtTime(sec: number) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return `${String(d).padStart(2, '0')}d ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
/** Weight for display: the player sees lb (spec A3); internal math stays in kg. */
export const kg = (v: number) => `${Math.round(v / 0.45359237).toLocaleString('en-US')} lb`;
