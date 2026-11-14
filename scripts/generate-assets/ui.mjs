// Retro UI kit: 9-slice frames, buttons, icons, cursor, mission patch, favicon.
import { Bitmap, P, save, fromStrings, sheet, rampDither, gradient, mix, sphere, fbm } from './lib.mjs';
import { drawText, measure } from './font.mjs';

/** 9-slice frame. 24x24 with 8px corners. */
function frame({ fill, fill2, light, dark, accent, rivet = true, size = 24 }) {
  const b = new Bitmap(size, size);
  const s = size;
  // fill with vertical gradient
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) b.set(x, y, rampDither([fill2, fill], y / (s - 1), x, y));
  // outer ink
  b.frame(0, 0, s, s, P.ink);
  // bevel
  b.hline(1, s - 2, 1, light); b.vline(1, 1, s - 2, light);
  b.hline(1, s - 2, s - 2, dark); b.vline(s - 2, 1, s - 2, dark);
  // inner accent line
  b.frame(3, 3, s - 6, s - 6, accent);
  b.hline(4, s - 5, 4, mix(fill2, '#000', 0.35));
  // round the outer corners
  for (const [x, y] of [[0, 0], [s - 1, 0], [0, s - 1], [s - 1, s - 1]]) b.clear(x, y);
  for (const [x, y] of [[1, 1], [s - 2, 1], [1, s - 2], [s - 2, s - 2]]) b.set(x, y, P.ink);
  if (rivet) for (const [x, y] of [[3, 3], [s - 4, 3], [3, s - 4], [s - 4, s - 4]]) { b.set(x, y, P.gold[6]); }
  return b;
}

const ICON_KEY = {
  k: P.ink, w: '#ffffff', l: P.grey[8], g: P.grey[6], d: P.grey[4],
  y: P.gold[5], Y: P.gold[7], o: P.orange[4], O: P.orange[2], r: P.red[4], R: P.red[2],
  b: P.blue[5], B: P.blue[3], c: P.teal[5], C: P.teal[3], e: P.green[5], E: P.green[3],
  p: P.purple[5], s: P.skinA[4], m: P.regolith[7], M: P.regolith[4],
};
const ICONS = {
  fuel: ['....kkkk....', '...kooook...', '..kooyyook..', '..koyyyyok..', '.kooyyyyook.', '.koooooooook', '.kooooooook.', '.kOoooooOk..', '..kOOOOOk...', '...kkkkk....', '............', '............'],
  battery: ['....kkkk....', '..kkllllkk..', '..kwwwwwwk..', '..keeeeeek..', '..keeeeeek..', '..kEEEEEEk..', '..keeeeeek..', '..keeeeeek..', '..kEEEEEEk..', '..kkkkkkkk..', '............', '............'],
  power: ['.....kk.....', '....kyk.....', '...kyyk.....', '..kyyykkkk..', '.kyyyyyyyk..', '.kkkkyyyk...', '....kyyk....', '...kyyk.....', '...kyk......', '...kk.......', '............', '............'],
  sun: ['.....y......', '..y..y..y...', '...kkkkk....', '..kYYYYYk...', 'yykYyyyYkyy.', '..kYyyyYk...', '..kYyyyYk...', '...kkkkk....', '..y..y..y...', '.....y......', '............', '............'],
  o2: ['............', '.kkkk.......', 'kccccck.....', 'kcwwcck.kk..', 'kcwcccckcck.', 'kcccccckkck.', 'kcccccck.ck.', '.kkkkkk.kkk.', '............', '..kcck......', '..kcck......', '...kk.......'],
  water: ['.....k......', '....kbk.....', '...kbbbk....', '..kbbbbbk...', '..kbwbbbk...', '.kbwbbbbbk..', '.kbbbbbbbk..', '.kBbbbbbBk..', '..kBBBBBk...', '...kkkkk....', '............', '............'],
  comms: ['............', '.k.......k..', 'k..k...k..k.', 'k.k..k..k.k.', 'k.k.klk.k.k.', 'k..k.l.k..k.', '.k...l...k..', '.....l......', '....kgk.....', '...kgggk....', '..kkkkkkk...', '............'],
  science: ['...kkkkk....', '....klk.....', '....klk.....', '....klk.....', '...kllck....', '..kllcpck...', '..klcppck...', '.kccpppcck..', '.kcpppppck..', '..kkkkkkk...', '............', '............'],
  mass: ['....kkk.....', '...kk.kk....', '....kkk.....', '..kkkkkkk...', '.kgggggggk..', '.kglllllgk..', 'kglllllllgk.', 'kgllkkkllgk.', 'kddddddddk..', '.kkkkkkkk...', '............', '............'],
  cost: ['...kkkkk....', '..kyyyyyk...', '.kyYkkkYyk..', '.kyky.yyyk..', '.kyYkkkYyk..', '.kyyyykyyk..', '.kyYkkkYyk..', '..kyyyyyk...', '...kkkkk....', '............', '............', '............'],
  crew: ['....kkk.....', '...kssck....', '...kssck....', '....kkk.....', '..kkoookk...', '.kooooooook.', '.kokooookok.', '.kokooookok.', '..kkooookk..', '...kokkok...', '...kk..kk...', '............'],
  warn: ['.....kk.....', '....kyyk....', '....kyyk....', '...kykkyk...', '...kykkyk...', '..kyykkyyk..', '..kyykkyyk..', '.kyyyyyyyyk.', '.kyyykkyyyk.', 'kyyyyyyyyyyk', 'kkkkkkkkkkkk', '............'],
  ok: ['............', '.........kk.', '........kek.', '.......keek.', '.kk...keek..', 'keek.keek...', '.keekeek....', '..keeek.....', '...kek......', '....k.......', '............', '............'],
  fail: ['............', '.kk.....kk..', 'krrk...krrk.', '.krrk.krrk..', '..krrkrrk...', '...krrrk....', '..krrkrrk...', '.krrk.krrk..', 'krrk...krrk.', '.kk.....kk..', '............', '............'],
  clock: ['...kkkkk....', '..kwwkwwk...', '.kwwwkwwwk..', 'kwwwwkwwwwk.', 'kwwwwkwwwwk.', 'kkwwwkkkwkk.', 'kwwwwwwwwwk.', 'kwwwwwwwwwk.', '.kwwwwwwwk..', '..kwwkwwk...', '...kkkkk....', '............'],
  data: ['.kkkkkkkkk..', '.kbbbbbbbbk.', '.kbllllllbk.', '.kbllllllbk.', '.kbbbbbbbbk.', '.kbbbbbbbbk.', '.kbbkkkkbbk.', '.kbbkgkkbbk.', '.kbbkgkkbbk.', '.kkkkkkkkkk.', '............', '............'],
  thermal: ['....kkk.....', '....kwk.....', '....kwk.kk..', '....krk.....', '....krk.kk..', '....krk.....', '...krrrk....', '..krrwrrk...', '..krrrrrk...', '...kkkkk....', '............', '............'],
  guidance: ['.....k......', '.....k......', '...kkkkk....', '..kc.k.ck...', '.kc..k..ck..', 'kkkkkrkkkkk.', '.kc..k..ck..', '..kc.k.ck...', '...kkkkk....', '.....k......', '.....k......', '............'],
  safety: ['.kkkkkkkkk..', '.kbbbbbbbk..', '.kbbbwbbbk..', '.kbbwwwbbk..', '.kbbbwbbbk..', '.kbbbbbbbk..', '..kbbbbbk...', '..kBbbbBk...', '...kBBBk....', '....kkk.....', '............', '............'],
  engine: ['....kkkk....', '....kggk....', '...kgllgk...', '...kgggk....', '..kgggggk...', '..kdgggdk...', '.kddgggddk..', '.kddddddk...', 'kkkkkkkkkk..', '..o.yy.o....', '...oyyo.....', '....oo......'],
  rocket: ['.....kk.....', '....kwwk....', '....kwwk....', '...kwrrwk...', '...kwwwwk...', '...kwbbwk...', '...kwwwwk...', '..kkwwwwkk..', '.krkwwwwkrk.', '.kk.kkkk.kk.', '....oyyo....', '.....oo.....'],
  moon: ['...kkkk.....', '..kmmmmk....', '.kmmMmmmk...', 'kmmmmmmMmk..', 'kmMmmmmmmk..', 'kmmmmMmmmk..', 'kmmmmmmmMk..', '.kmMmmmmk...', '..kmmmmk....', '...kkkk.....', '............', '............'],
  earth: ['...kkkk.....', '..kbbeek....', '.kbeeebbk...', 'kbbeebbbbk..', 'kbbbbbeebk..', 'kbebbbeeek..', 'kbeebbbeek..', '.kbbbbbbk...', '..kbbbbk....', '...kkkk.....', '............', '............'],
  star: ['.....k......', '....kyk.....', '....kyk.....', 'kkkkyYykkkk.', '.kyyYYYyyk..', '..kyYYYyk...', '..kyykyyk...', '.kyk...kyk..', '.kk.....kk..', '............', '............', '............'],
  lock: ['...kkkk.....', '..kgkkgk....', '..kk..kk....', '..kk..kk....', '.kkkkkkkk...', '.kyyyyyyk...', '.kyYkkYyk...', '.kyYkkYyk...', '.kyyyyyyk...', '.kkkkkkkk...', '............', '............'],
  sample: ['............', '...kkkk.....', '..kMmmmk....', '.kMmmMmmk...', '.kmmmmMmk...', '.kMmmmmmk...', '..kkkkkk....', '.kggggggk...', '.kglllllk...', '.kkkkkkkk...', '............', '............'],
  pause: ['............', '..kkk.kkk...', '..kwk.kwk...', '..kwk.kwk...', '..kwk.kwk...', '..kwk.kwk...', '..kwk.kwk...', '..kwk.kwk...', '..kkk.kkk...', '............', '............', '............'],
  play: ['............', '..kk........', '..kwkk......', '..kwwwkk....', '..kwwwwwkk..', '..kwwwwwwwk.', '..kwwwwwkk..', '..kwwwkk....', '..kwkk......', '..kk........', '............', '............'],
  ffwd: ['............', 'kk...kk.....', 'kwk..kwk....', 'kwwk.kwwk...', 'kwwwkkwwwk..', 'kwwwwkwwwwk.', 'kwwwkkwwwk..', 'kwwk.kwwk...', 'kwk..kwk....', 'kk...kk.....', '............', '............'],
  sound: ['............', '....k.......', '...kk...k...', 'kkkwk..k.k..', 'kwwwk.k..k..', 'kwwwk.k..k..', 'kwwwk.k..k..', 'kkkwk..k.k..', '...kk...k...', '....k.......', '............', '............'],
  mute: ['............', '....k.......', '...kk.......', 'kkkwk.r...r.', 'kwwwk..r.r..', 'kwwwk...r...', 'kwwwk..r.r..', 'kkkwk.r...r.', '...kk.......', '....k.......', '............', '............'],
  gear: ['....kkk.....', '.kk.kgk.kk..', '.kgkgggkgk..', '..kgggggk...', 'kkggkkkggkk.', 'kgggk.kgggk.', 'kkggkkkggkk.', '..kgggggk...', '.kgkgggkgk..', '.kk.kgk.kk..', '....kkk.....', '............'],
  radiation: ['...kkkkk....', '..kyyyyyk...', '.kykkykkyk..', 'kyyykkkyyyk.', 'kyykkkkkyyk.', 'kyyyykyyyyk.', 'kyyykkkyyyk.', '.kykkkkkyk..', '..kyyyyyk...', '...kkkkk....', '............', '............'],
};
export const ICON_NAMES = Object.keys(ICONS);

function cursor() {
  return fromStrings([
    'kk..........', 'kwk.........', 'kwwk........', 'kwwwk.......', 'kwwwwk......', 'kwwwwwk.....', 'kwwwwwwk....', 'kwwwwwwwk...', 'kwwwwwkkkk..', 'kwwkwwk.....', 'kwk.kwwk....', 'kk..kwwk....', '.....kk.....',
  ], ICON_KEY);
}

/** Circular mission patch: Moon over Oakland hills + oak tree + bay bridge tower. */
export function missionPatch(size = 96) {
  const b = new Bitmap(size, size);
  const c = size / 2, R = size / 2 - 1;
  // background disk
  b.circle(c - 0.5, c - 0.5, R, P.ink);
  b.circle(c - 0.5, c - 0.5, R - 1, P.gold[4]);
  b.circle(c - 0.5, c - 0.5, R - 3, P.gold[6]);
  b.circle(c - 0.5, c - 0.5, R - 4, P.ink);
  const inner = R - 5;
  const sky = [P.space[1], P.space[2], P.space[3], P.purple[3], P.sky[6], P.sky[8], P.sky[9]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - c + 0.5, dy = y - c + 0.5;
    if (dx * dx + dy * dy > inner * inner) continue;
    b.set(x, y, rampDither(sky, (y - (c - inner)) / (inner * 2), x, y));
  }
  const inDisk = (x, y) => { const dx = x - c + 0.5, dy = y - c + 0.5; return dx * dx + dy * dy <= inner * inner; };
  // stars
  for (const [x, y] of [[30, 22], [62, 18], [70, 34], [24, 38], [44, 14], [56, 28]]) if (inDisk(x * size / 96, y * size / 96)) b.set(Math.round(x * size / 96), Math.round(y * size / 96), '#fff');
  // moon
  const mx = c + inner * 0.25, my = c - inner * 0.28, mr = inner * 0.34;
  sphere(b, mx, my, mr, (nx, ny, nz, x, y) => {
    const l = 0.35 + 0.65 * Math.max(0, -nx * 0.6 - ny * 0.3 + nz * 0.75);
    const maria = fbm(nx * 2.5 + 3, ny * 2.5, 9) > 0.55 ? -0.2 : 0;
    return rampDither(P.regolith.slice(3), l + maria, x, y);
  });
  // hills
  for (let x = 0; x < size; x++) {
    const hY = c + inner * 0.38 + Math.sin(x * 0.09) * 3 + Math.sin(x * 0.23) * 1.5;
    for (let y = Math.floor(hY); y < size; y++) if (inDisk(x, y)) b.set(x, y, rampDither([P.green[2], P.green[1], P.green[0]], (y - hY) / 18, x, y));
  }
  // bridge tower silhouette (left) with cables
  const tx = Math.round(c - inner * 0.55), ty = Math.round(c - inner * 0.1);
  for (let y = ty; y < c + inner * 0.5; y++) { if (inDisk(tx, y)) b.set(tx, y, P.grey[7]); if (inDisk(tx + 1, y)) b.set(tx + 1, y, P.grey[5]); }
  for (let i = 1; i < 16; i++) { if (inDisk(tx + 1 + i, ty + Math.round(i * i / 16) + 1)) b.set(tx + 1 + i, ty + Math.round(i * i / 16) + 1, P.grey[5]); if (inDisk(tx - i, ty + Math.round(i * i / 16) + 1)) b.set(tx - i, ty + Math.round(i * i / 16) + 1, P.grey[5]); }
  // oak tree (center bottom)
  const ox = c, oy = c + inner * 0.42;
  b.rect(Math.round(ox - 1), Math.round(oy - 6), 3, 9, P.brick[1]);
  for (const [dx, dy, r] of [[0, -12, 7], [-6, -9, 5], [6, -9, 5], [-3, -15, 4], [4, -15, 4]]) b.circle(ox + dx, oy + dy, r * size / 96, (x, y, nx, ny) => rampDither([P.green[6], P.green[5], P.green[4], P.green[3]], 0.2 + (ny + 1) * 0.35, x, y));
  // rocket trail arcing up to the moon
  for (let t = 0; t < 1; t += 0.01) {
    const x = c - inner * 0.1 + t * inner * 0.4, y = c + inner * 0.2 - Math.sin(t * Math.PI * 0.5) * inner * 0.45;
    if (inDisk(x, y)) b.set(Math.round(x), Math.round(y), t > 0.9 ? '#fff' : P.gold[6]);
  }
  // text ring: TOWN-1 at the bottom band
  const label = 'TOWN-1';
  const lw = measure(label, 1);
  drawText(b, label, Math.round(c - lw / 2), Math.round(c + inner * 0.62), 1, () => P.gold[7]);
  return b;
}

export function buildUI() {
  const panels = {
    panel: frame({ fill: P.space[2], fill2: P.space[4], light: P.blue[6], dark: P.space[1], accent: P.blue[3] }),
    panel_dark: frame({ fill: P.space[0], fill2: P.space[2], light: P.space[5], dark: P.ink, accent: P.space[3], rivet: false }),
    panel_alert: frame({ fill: P.red[1], fill2: P.red[2], light: P.red[5], dark: P.red[0], accent: P.red[3] }),
    panel_ok: frame({ fill: P.teal[1], fill2: P.teal[2], light: P.teal[6], dark: P.teal[0], accent: P.teal[3] }),
    dialog: frame({ fill: P.blue[1], fill2: P.blue[3], light: P.grey[9], dark: P.space[1], accent: P.grey[6] }),
    card: frame({ fill: P.space[3], fill2: P.space[4], light: P.space[6], dark: P.space[1], accent: P.space[5], rivet: false }),
    card_sel: frame({ fill: P.blue[2], fill2: P.blue[3], light: P.gold[6], dark: P.gold[2], accent: P.gold[5], rivet: false }),
    card_bad: frame({ fill: P.red[1], fill2: P.red[2], light: P.red[5], dark: P.red[0], accent: P.red[4], rivet: false }),
    button: frame({ fill: P.blue[2], fill2: P.blue[4], light: P.blue[7], dark: P.blue[0], accent: P.blue[3], rivet: false }),
    button_hover: frame({ fill: P.blue[3], fill2: P.blue[5], light: P.gold[7], dark: P.blue[1], accent: P.gold[5], rivet: false }),
    button_go: frame({ fill: P.orange[2], fill2: P.orange[4], light: P.gold[7], dark: P.orange[0], accent: P.gold[5], rivet: false }),
    button_off: frame({ fill: P.grey[2], fill2: P.grey[3], light: P.grey[5], dark: P.grey[1], accent: P.grey[3], rivet: false }),
    tooltip: frame({ fill: P.space[1], fill2: P.space[2], light: P.gold[6], dark: P.ink, accent: P.space[3], rivet: false }),
  };
  for (const [k, v] of Object.entries(panels)) save(v, `ui/${k}.png`);
  // icons sheet 12x12
  const iconFrames = ICON_NAMES.map((n) => fromStrings(ICONS[n], ICON_KEY));
  save(sheet(iconFrames), 'ui/icons.png');
  save(cursor(), 'ui/cursor.png');
  save(missionPatch(96), 'ui/patch.png');
  const fav = missionPatch(32);
  save(fav, 'ui/favicon.png');
  // meter frame (bar) 64x8 and bar fill segments
  const meter = new Bitmap(4, 8);
  meter.rect(0, 0, 4, 8, P.ink); meter.rect(0, 1, 4, 6, P.space[1]); meter.hline(0, 3, 1, P.space[0]);
  save(meter, 'ui/meter_bg.png');
  // selection arrow (animated 2 frames)
  const arr = ['k.......', 'kyk.....', 'kyYk....', 'kyYYk...', 'kyYk....', 'kyk.....', 'k.......'];
  const arr2 = ['.k......', '.kyk....', '.kyYk...', '.kyYYk..', '.kyYk...', '.kyk....', '.k......'];
  save(sheet([fromStrings(arr, ICON_KEY), fromStrings(arr2, ICON_KEY)]), 'ui/arrow.png');
  // scanline overlay tile (subtle CRT feel)
  const scan = new Bitmap(4, 4);
  scan.hline(0, 3, 3, [0, 0, 0, 38]);
  save(scan, 'ui/scanline.png');
  // vignette 480x270
  const vig = new Bitmap(480, 270);
  for (let y = 0; y < 270; y++) for (let x = 0; x < 480; x++) {
    const dx = (x - 240) / 240, dy = (y - 135) / 135;
    const d = Math.sqrt(dx * dx * 0.8 + dy * dy * 0.9);
    const t = Math.max(0, d - 0.75) / 0.5;
    if (t > 0) { const a = Math.min(1, t) * 0.55; if (a > 0.2 * ((x * 7 + y * 3) % 5) / 5 + 0.02) vig.set(x, y, [4, 3, 12, Math.round(a * 255)]); }
  }
  save(vig, 'ui/vignette.png');
}
