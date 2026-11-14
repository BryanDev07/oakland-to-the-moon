// Character sprites & portraits. All original, drawn procedurally.
import { Bitmap, P, save, sheet, rampDither, mix } from './lib.mjs';

const FW = 16, FH = 24;

// Thick limb from (x0,y0) to (x1,y1)
function limb(b, x0, y0, x1, y1, w, c, cShade) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps), y = Math.round(y0 + ((y1 - y0) * i) / steps);
    for (let k = 0; k < w; k++) b.set(x + k, y, k === 0 && cShade ? cShade : c);
  }
}

/**
 * Side-view person facing right.
 * style.kind: 'civ' | 'launch' | 'eva'
 */
function person(style, pose) {
  const b = new Bitmap(FW, FH);
  const { legA = 1, legB = -1, armA = 0, armB = 0, bob = 0, armsUp = false, kneel = false, reach = 0, wave = -1 } = pose;
  const sk = style.skin;
  const hipY = 16 + bob + (kneel ? 3 : 0);
  const tTop = 9 + bob + (kneel ? 3 : 0);
  const hTop = 2 + bob + (kneel ? 3 : 0);
  const eva = style.kind === 'eva', launch = style.kind === 'launch';
  const cloth = style.top, clothD = style.topD, clothL = style.topL;
  const pants = style.pants, pantsD = style.pantsD;
  const legW = eva ? 3 : 2;

  // --- back leg
  if (kneel) {
    limb(b, 7, hipY, 5, 22, legW, pantsD);
    b.rect(2, 22, 5, 2, style.shoesD ?? P.grey[3]);
  } else {
    limb(b, 7, hipY, 7 + legB, 22, legW, pantsD);
    b.rect(7 + legB - 1, 23, legW + 2, 1, style.shoesD ?? P.grey[3]);
  }
  // --- back arm
  const shoulderY = tTop + 2;
  const handBackX = armsUp ? 5 : 7 + armB, handBackY = armsUp ? tTop - 5 : tTop + 6;
  limb(b, 7, shoulderY, handBackX, handBackY, eva ? 3 : 2, clothD);
  b.set(handBackX, handBackY + 1, eva ? P.grey[5] : sk[1]); b.set(handBackX + 1, handBackY + 1, eva ? P.grey[5] : sk[1]);

  // --- backpack (EVA PLSS)
  if (eva) {
    b.rect(2, tTop, 4, 8, P.grey[7]);
    b.rect(2, tTop, 1, 8, P.grey[5]);
    b.hline(3, 5, tTop + 2, P.grey[5]);
    b.hline(3, 5, tTop + 5, P.grey[5]);
    b.set(4, tTop + 1, P.red[4]);
  }
  // --- torso
  const tx0 = eva ? 5 : 6, tx1 = 10;
  for (let y = tTop + 1; y < hipY + (eva ? 1 : 0); y++) for (let x = tx0; x <= tx1; x++) b.set(x, y, x === tx0 ? clothD : x === tx1 ? clothL : cloth);
  if (style.kind === 'civ') {
    b.vline(9, tTop + 1, hipY - 1, style.zip ?? clothD); // jacket zip
    b.hline(tx0, tx1, hipY - 1, style.trim ?? P.gold[5]); // waistband
    b.set(10, tTop + 1, style.trim ?? P.gold[5]); b.set(8, tTop + 1, style.trim ?? P.gold[5]);
  }
  if (launch) { b.vline(8, tTop + 2, hipY - 1, P.orange[2]); b.set(10, tTop + 3, P.blue[5]); b.set(7, tTop + 3, P.grey[8]); }
  if (eva) { b.rect(7, tTop + 3, 3, 2, P.grey[5]); b.set(8, tTop + 3, P.teal[5]); b.set(9, tTop + 4, P.red[4]); }
  // neck
  b.set(8, tTop, eva || launch ? P.grey[6] : sk[2]);
  // --- front leg
  if (kneel) {
    limb(b, 8, hipY, 11, hipY + 2, legW, pants);
    limb(b, 11, hipY + 2, 11, 22, legW, pants);
    b.rect(11, 23, legW + 2, 1, style.shoes ?? P.grey[5]);
  } else {
    limb(b, 8, hipY, 8 + legA, 22, legW, pants);
    b.rect(8 + legA - 1, 23, legW + 2, 1, style.shoes ?? P.grey[5]);
    b.set(8 + legA + legW, 23, style.shoesL ?? style.shoes ?? P.grey[6]);
  }
  if (eva) { b.hline(7 + legB, 9 + legB, 20, P.grey[5]); b.hline(8 + legA, 10 + legA, 20, P.grey[6]); }
  // --- head
  if (eva || launch) {
    // helmet shell
    b.ellipse(8.5, hTop + 3.5, 3.6, 3.8, P.grey[9]);
    b.set(5, hTop + 3, P.grey[7]); b.set(5, hTop + 4, P.grey[7]); b.set(6, hTop + 6, P.grey[7]);
    if (eva) {
      // gold visor
      for (let y = hTop + 1; y <= hTop + 6; y++) for (let x = 9; x <= 12; x++) if (b.alpha(x, y)) b.set(x, y, y < hTop + 3 ? P.gold[6] : P.gold[4]);
      b.set(11, hTop + 2, '#fff');
    } else {
      // clear visor: face visible
      for (let y = hTop + 2; y <= hTop + 5; y++) for (let x = 9; x <= 11; x++) if (b.alpha(x, y)) b.set(x, y, sk[3]);
      b.set(10, hTop + 3, P.ink);
      b.set(11, hTop + 1, P.grey[10]);
    }
  } else {
    b.rect(6, hTop + 1, 5, 6, sk[3]);
    b.set(6, hTop + 6, sk[2]); b.set(10, hTop + 6, sk[2]);
    b.set(11, hTop + 4, sk[3]); // nose
    b.set(9, hTop + 3, P.ink); // eye
    b.set(10, hTop + 5, sk[1]); // mouth
    b.set(7, hTop + 3, sk[1]); // ear
    // hair
    const h = style.hair;
    if (style.hairStyle === 'bun') {
      b.rect(6, hTop, 5, 2, h[1]); b.rect(5, hTop + 1, 2, 4, h[1]); b.set(10, hTop + 2, h[1]);
      b.ellipse(6, hTop - 1, 1.6, 1.4, h[2]); b.set(6, hTop - 2, h[3]);
      b.set(8, hTop, h[3]);
    } else if (style.hairStyle === 'cap') {
      b.rect(5, hTop, 6, 2, style.capColor ?? P.green[4]); b.hline(9, 12, hTop + 1, style.capColor ?? P.green[4]);
      b.set(6, hTop + 2, h[1]);
    } else if (style.hairStyle === 'puff') {
      b.ellipse(7.5, hTop + 0.5, 3.2, 2.2, h[1]); b.set(6, hTop - 1, h[2]); b.set(9, hTop - 1, h[2]);
    } else if (style.hairStyle === 'long') {
      b.rect(6, hTop, 5, 2, h[1]); b.rect(5, hTop + 1, 2, 7, h[1]); b.set(4, hTop + 6, h[1]);
    } else {
      b.rect(6, hTop, 5, 2, h[1]); b.rect(6, hTop + 2, 1, 2, h[1]); b.set(9, hTop, h[2]);
    }
  }
  // --- front arm (drawn last)
  let hx = 8 + armA, hy = tTop + 6;
  if (armsUp) { hx = 10; hy = tTop - 5; }
  if (wave >= 0) { hx = 10 + wave; hy = tTop - 4; }
  if (kneel) { hx = 12 + reach; hy = 21 - reach; }
  limb(b, 8, shoulderY, hx, hy, eva ? 3 : 2, cloth, clothD);
  if (eva) { b.set(hx, hy - 2, P.red[4]); b.set(hx + 1, hy - 2, P.red[4]); }
  b.set(hx, hy + 1, eva ? P.grey[6] : launch ? P.grey[7] : sk[3]); b.set(hx + 1, hy + 1, eva ? P.grey[6] : launch ? P.grey[7] : sk[2]);
  b.outline(P.ink);
  return b;
}

const KAI_CIV = { kind: 'civ', skin: P.skinA, hair: P.hair, hairStyle: 'bun', top: P.blue[4], topD: P.blue[3], topL: P.blue[5], trim: P.gold[5], pants: P.space[3], pantsD: P.space[2], shoes: '#f0f0f0', shoesD: P.grey[6], shoesL: P.red[4] };
const KAI_LAUNCH = { kind: 'launch', skin: P.skinA, hair: P.hair, top: P.orange[4], topD: P.orange[3], topL: P.orange[5], pants: P.orange[4], pantsD: P.orange[3], shoes: P.grey[2], shoesD: P.grey[1] };
const KAI_EVA = { kind: 'eva', skin: P.skinA, hair: P.hair, top: P.grey[9], topD: P.grey[7], topL: '#ffffff', pants: P.grey[9], pantsD: P.grey[7], shoes: P.grey[4], shoesD: P.grey[3] };

const WALK = [
  { legA: 3, legB: -3, armA: -2, armB: 2, bob: 0 },
  { legA: 1, legB: -1, armA: 0, armB: 0, bob: -1 },
  { legA: -3, legB: 3, armA: 2, armB: -2, bob: 0 },
  { legA: -1, legB: 1, armA: 0, armB: 0, bob: -1 },
];
const IDLE = [{ legA: 1, legB: -1, bob: 0 }, { legA: 1, legB: -1, bob: 0, armA: 1, armB: -1 }];

function characterSheet(style, extra = []) {
  const frames = [...IDLE.map((p) => person(style, p)), ...WALK.map((p) => person(style, p)), ...extra.map((p) => person(style, p))];
  return sheet(frames);
}

// ------------------------------- portraits ---------------------------------
function portrait(o) {
  const S = 48;
  const b = new Bitmap(S, S);
  const sk = o.skin;
  if (o.helmet) {
    b.circle(24, 23, 22, P.grey[9]);
    b.circle(24, 23, 20, P.space[1]);
    for (let y = 2; y < 9; y++) for (let x = 0; x < S; x++) { const dx = x - 24, dy = y - 23; const d = Math.sqrt(dx * dx + dy * dy); if (d < 20 && d > 15.5) b.set(x, y, y < 5 ? P.gold[6] : P.gold[4]); }
  }
  // shoulders / outfit
  b.ellipse(24, 50, 23, 14, (x, y, nx) => rampDither(o.outfit, 0.25 + nx * 0.35 + 0.15, x, y));
  if (o.collar) { b.poly([[17, 37], [24, 46], [31, 37], [28, 36], [24, 41], [20, 36]], o.collar); }
  if (o.helmet) { b.rect(13, 38, 22, 3, P.grey[7]); b.hline(13, 34, 38, P.grey[9]); }
  // neck
  b.rect(19, 30, 10, 9, sk[2]); b.rect(19, 30, 10, 2, sk[1]);
  // hair behind head
  if (o.hairStyle === 'bun' && !o.helmet) { b.circle(24, 3.5, 5, (x, y, nx, ny) => rampDither(P.hair, 0.6 - ny * 0.5, x, y)); b.ellipse(24, 8, 4, 1.4, P.gold[5]); }
  if (o.hairStyle === 'long') b.ellipse(24, 22, 14, 16, P.hair[1]);
  // ears
  b.ellipse(13, 21, 2, 3, sk[2]); b.ellipse(35, 21, 2, 3, sk[2]);
  if (o.earring) { b.set(13, 25, P.gold[6]); b.set(35, 25, P.gold[6]); }
  // head
  b.ellipse(24, 20, 10.5, 13, (x, y, nx, ny) => rampDither(sk, 0.78 - nx * 0.28 - ny * 0.18 - (Math.abs(nx) > 0.8 ? 0.2 : 0), x, y));
  // hair
  const hs = o.hairStyle;
  const hairFn = (x, y) => rampDither(P.hair, 0.15 + ((x * 3 + y * 5) % 7) / 18, x, y);
  if (hs === 'bun' || hs === 'long') {
    for (let y = 5; y < 16; y++) for (let x = 12; x < 37; x++) {
      const dx = (x - 24) / 12, dy = (y - 15) / 10;
      const inCap = dx * dx + dy * dy < 1;
      const hairline = 11 + Math.abs(x - 24) * 0.45;
      if (inCap && (y < hairline || x < 15 || x > 33)) b.set(x, y, hairFn(x, y));
    }
    b.hline(18, 22, 9, P.hair[3]);
  } else if (hs === 'crop') {
    for (let y = 5; y < 14; y++) for (let x = 13; x < 36; x++) {
      const dx = (x - 24) / 11.5, dy = (y - 14) / 9;
      if (dx * dx + dy * dy < 1 && (y < 10 + Math.abs(x - 24) * 0.2 || x < 15 || x > 33)) b.set(x, y, hairFn(x, y));
    }
  } else if (hs === 'natural') {
    b.ellipse(24, 10, 14, 9, (x, y) => rampDither(P.hair, ((x * 7 + y * 13) % 9) / 14, x, y));
    for (let y = 10; y < 19; y++) for (const x of [12, 13, 35, 36]) b.set(x, y, hairFn(x, y));
    // re-draw forehead
    for (let y = 12; y < 16; y++) for (let x = 16; x < 33; x++) { const dx = (x - 24) / 10.5, dy = (y - 20) / 13; if (dx * dx + dy * dy < 1 && y > 12 + Math.abs(x - 24) * 0.25) b.set(x, y, rampDither(sk, 0.75 - (x - 24) / 40, x, y)); }
  }
  // eyebrows
  b.hline(17, 21, 16, P.hair[0]); b.hline(27, 31, 16, P.hair[0]); b.set(17, 17, P.hair[1]); b.set(31, 17, P.hair[1]);
  // eyes
  for (const ex of [18, 28]) {
    b.rect(ex, 19, 4, 2, '#f4efe8'); b.hline(ex, ex + 3, 18, P.ink);
    b.rect(ex + (ex < 24 ? 2 : 0), 19, 2, 2, o.eye ?? '#2a160e'); b.set(ex + (ex < 24 ? 2 : 0), 19, P.ink);
  }
  // nose
  b.set(24, 23, sk[2]); b.set(24, 24, sk[2]); b.set(23, 25, sk[1]); b.set(25, 25, sk[1]); b.set(26, 25, sk[2]);
  // mouth
  b.hline(21, 27, 28, o.lip ?? sk[0]); b.set(20, 27, sk[1]); b.set(28, 27, sk[1]); b.hline(22, 26, 29, sk[4]);
  // cheeks
  b.set(17, 24, mix(sk[4], P.red[5], 0.25)); b.set(31, 24, mix(sk[4], P.red[5], 0.25));
  if (o.glasses) { b.frame(16, 18, 7, 5, P.grey[2]); b.frame(26, 18, 7, 5, P.grey[2]); b.hline(23, 25, 19, P.grey[2]); }
  if (o.headset) {
    for (let x = 12; x <= 36; x++) { const y = Math.round(9 - Math.sqrt(Math.max(0, 144 - (x - 24) * (x - 24))) * 0.5); b.set(x, y, P.grey[3]); }
    b.rect(10, 18, 4, 7, P.grey[3]); b.rect(11, 19, 2, 5, P.grey[5]);
    b.line(13, 24, 19, 30, P.grey[4]); b.rect(19, 29, 3, 2, P.grey[2]);
  }
  b.outline(P.ink);
  return b;
}

// ------------------------------- operators ---------------------------------
function operator(shirt, hair, f, headset = true) {
  const b = new Bitmap(16, 18);
  b.rect(3, 10, 10, 8, P.grey[2]); b.rect(4, 11, 8, 7, P.grey[3]); // chair back
  b.ellipse(8 + (f ? 1 : 0), 10, 6, 3.5, shirt);
  b.ellipse(8 + (f ? 1 : 0), 5, 3.6, 4, hair);
  if (headset) { b.hline(5 + f, 11 + f, 2, P.grey[5]); b.rect(4 + f, 5, 1, 3, P.grey[6]); }
  if (f) { b.rect(12, 9, 3, 2, shirt); }
  b.outline(P.ink);
  return b;
}

// ------------------------------- townsfolk --------------------------------
const TOWN = [
  { kind: 'civ', skin: P.skinB, hair: P.hair, hairStyle: 'cap', capColor: P.green[4], top: P.green[4], topD: P.green[3], topL: P.green[5], trim: P.gold[5], pants: P.blue[2], pantsD: P.blue[1], shoes: P.grey[8] },
  { kind: 'civ', skin: P.skinC, hair: P.hair, hairStyle: 'long', top: P.red[3], topD: P.red[2], topL: P.red[4], trim: P.red[5], pants: P.space[2], pantsD: P.space[1], shoes: P.grey[3] },
  { kind: 'civ', skin: P.skinA, hair: P.hair, hairStyle: 'puff', top: P.purple[4], topD: P.purple[3], topL: P.purple[5], trim: P.gold[6], pants: P.grey[3], pantsD: P.grey[2], shoes: '#ffffff' },
  { kind: 'civ', skin: P.skinB, hair: [P.grey[6], P.grey[7], P.grey[8], P.grey[9]], hairStyle: 'short', top: P.teal[3], topD: P.teal[2], topL: P.teal[4], trim: P.teal[5], pants: P.brick[2], pantsD: P.brick[1], shoes: P.grey[2] },
];

export function buildCharacters() {
  // Kai: civ (idle2, walk4, wave2)
  save(characterSheet(KAI_CIV, [{ wave: 0 }, { wave: 1 }]), 'characters/kai_civ.png');
  save(characterSheet(KAI_LAUNCH, [{ armsUp: true, bob: -1 }, { armsUp: true, bob: -2, legA: 1, legB: -1 }]), 'characters/kai_launch.png');
  // EVA: idle2, walk4, celebrate2, work2
  save(characterSheet(KAI_EVA, [{ armsUp: true, bob: -1 }, { armsUp: true, bob: -3, legA: 1, legB: -1 }, { kneel: true, reach: 0 }, { kneel: true, reach: 1 }]), 'characters/kai_eva.png');
  // townspeople, each idle2 + walk4 + wave2
  TOWN.forEach((s, i) => save(characterSheet(s, [{ wave: 0 }, { wave: 1 }]), `characters/town_${i}.png`));
  // portraits
  save(portrait({ skin: P.skinA, hairStyle: 'bun', outfit: [P.blue[2], P.blue[3], P.blue[4], P.blue[5]], collar: P.gold[5], earring: true }), 'characters/portrait_kai.png');
  save(portrait({ skin: P.skinA, hairStyle: 'bun', outfit: [P.orange[2], P.orange[3], P.orange[4], P.orange[5]], helmet: true }), 'characters/portrait_kai_suit.png');
  save(portrait({ skin: P.skinB, hairStyle: 'natural', outfit: [P.teal[1], P.teal[2], P.teal[3], P.teal[4]], collar: P.grey[9], glasses: true, headset: true }), 'characters/portrait_director.png');
  save(portrait({ skin: P.skinC, hairStyle: 'crop', outfit: [P.orange[2], P.orange[3], P.orange[4], P.orange[5]], helmet: true }), 'characters/portrait_theo.png');
  save(portrait({ skin: P.skinB, hairStyle: 'crop', outfit: [P.grey[3], P.grey[4], P.grey[5], P.grey[6]], collar: P.blue[5], headset: true }), 'characters/portrait_capcom.png');
  save(portrait({ skin: P.skinA, hairStyle: 'natural', outfit: [P.purple[2], P.purple[3], P.purple[4], P.purple[5]], collar: P.gold[6], glasses: true }), 'characters/portrait_grandma.png');
  // operators: 4 variants x 2 frames
  const ops = [];
  const shirts = [P.blue[4], P.grey[7], P.teal[4], P.red[3]];
  const hairs = [P.hair[1], P.brick[2], P.hair[0], P.grey[7]];
  for (let i = 0; i < 4; i++) { ops.push(operator(shirts[i], hairs[i], 0)); ops.push(operator(shirts[i], hairs[i], 1)); }
  save(sheet(ops), 'characters/operators.png');
}
