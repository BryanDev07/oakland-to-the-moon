import Phaser from 'phaser';
import { C, H, W } from '../ui/ui';

const A = 'assets/';
const IMAGES: Record<string, string> = {
  title_logo: 'ui/title_logo.png', patch: 'ui/patch.png', vignette: 'ui/vignette.png', scanline: 'ui/scanline.png', meter_bg: 'ui/meter_bg.png', cursor: 'ui/cursor.png',
  panel: 'ui/panel.png', panel_dark: 'ui/panel_dark.png', panel_alert: 'ui/panel_alert.png', panel_ok: 'ui/panel_ok.png', dialog: 'ui/dialog.png',
  card: 'ui/card.png', card_sel: 'ui/card_sel.png', card_bad: 'ui/card_bad.png', button: 'ui/button.png', button_hover: 'ui/button_hover.png',
  button_go: 'ui/button_go.png', button_off: 'ui/button_off.png', tooltip: 'ui/tooltip.png',
  sky_dusk: 'oakland/sky_dusk.png', sky_night: 'oakland/sky_night.png', skyline_dusk: 'oakland/skyline_dusk.png', skyline_night: 'oakland/skyline_night.png',
  oak_mid: 'oakland/mid.png', oak_street: 'oakland/street.png', title_fg: 'oakland/title_fg.png', train: 'oakland/train.png', banner: 'oakland/banner.png',
  portrait_kai: 'characters/portrait_kai.png', portrait_kai_suit: 'characters/portrait_kai_suit.png', portrait_director: 'characters/portrait_director.png',
  portrait_theo: 'characters/portrait_theo.png', portrait_capcom: 'characters/portrait_capcom.png', portrait_dee: 'characters/portrait_grandma.png',
  hangar: 'backgrounds/hangar.png', mission_control: 'backgrounds/mission_control.png', earth_big: 'backgrounds/earth_big.png', earth_med: 'backgrounds/earth_med.png',
  earth_small: 'backgrounds/earth_small.png', moon_big: 'backgrounds/moon_big.png', moon_med: 'backgrounds/moon_med.png', moon_small: 'backgrounds/moon_small.png',
  stars_far: 'backgrounds/stars_far.png', stars_near: 'backgrounds/stars_near.png', space_bg: 'backgrounds/space_bg.png', reentry: 'backgrounds/reentry.png', ocean: 'backgrounds/ocean.png',
  surface_equator: 'lunar/surface_equator.png', surface_marius: 'lunar/surface_marius.png', surface_pole: 'lunar/surface_pole.png',
  boulder_0: 'lunar/boulder_0.png', boulder_1: 'lunar/boulder_1.png', boulder_2: 'lunar/boulder_2.png', plaque: 'lunar/plaque.png', footprint: 'lunar/footprint.png',
  sky_tall: 'launch/sky_tall.png', tower: 'launch/tower.png', pad: 'launch/pad.png', mast: 'launch/mast.png', clouds: 'launch/clouds.png',
  lv_bayhawk_s1: 'launch/lv_bayhawk_s1.png', lv_bayhawk_s2: 'launch/lv_bayhawk_s2.png', lv_estuary_s1: 'launch/lv_estuary_s1.png', lv_estuary_s2: 'launch/lv_estuary_s2.png',
  lv_estuary_booster: 'launch/lv_estuary_booster.png', lv_goldenbear_s1: 'launch/lv_goldenbear_s1.png', lv_goldenbear_s2: 'launch/lv_goldenbear_s2.png',
  spark: 'effects/spark.png', pixel: 'effects/pixel.png', chutes: 'effects/chutes.png', drogue: 'effects/drogue.png', capsule_float: 'effects/capsule_float.png', ship: 'effects/ship.png',
};
const PARTS = ['capsule', 'las', 'hs_std', 'hs_thick', 'sm_s', 'sm_m', 'sm_l', 'eng_hyper', 'eng_methalox', 'pwr_solar4', 'pwr_solar8', 'pwr_fuelcell', 'thr_std', 'thr_ext', 'battery',
  'com_sband', 'com_hga', 'com_laser', 'dat_s', 'dat_l', 'ls_open', 'ls_regen', 'gnc_std', 'gnc_trn', 'saf_redund', 'saf_shelter', 'sci_mapcam', 'sci_neutron', 'sci_seismo',
  'sci_samples', 'sci_pancam', 'sci_retro', 'lander_scout', 'lander_path', 'capsule_small', 'las_small', 'ascent_scout', 'ascent_path'];
const SHEETS: [string, string, number, number][] = [
  ['icons', 'ui/icons.png', 12, 12], ['arrow', 'ui/arrow.png', 8, 7],
  ['kai_civ', 'characters/kai_civ.png', 16, 24], ['kai_launch', 'characters/kai_launch.png', 16, 24], ['kai_eva', 'characters/kai_eva.png', 16, 24],
  ['town_0', 'characters/town_0.png', 16, 24], ['town_1', 'characters/town_1.png', 16, 24], ['town_2', 'characters/town_2.png', 16, 24], ['town_3', 'characters/town_3.png', 16, 24],
  ['operators', 'characters/operators.png', 16, 18],
  ['flame', 'effects/flame.png', 16, 40], ['smoke', 'effects/smoke.png', 32, 32], ['dust', 'effects/dust.png', 48, 16], ['plasma', 'effects/plasma.png', 64, 64], ['splash', 'effects/splash.png', 48, 24],
];

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    // font first so the loading screen can use it
    this.load.bitmapFont('px', A + 'ui/font.png', A + 'ui/font.xml');
    const g = this.add.graphics();
    const label = this.add.text(W / 2, H / 2 - 20, 'LOADING', { fontFamily: 'monospace', fontSize: '10px', color: '#f4c63c' }).setOrigin(0.5);
    this.load.on('progress', (p: number) => {
      g.clear();
      g.fillStyle(C.ink).fillRect(W / 2 - 82, H / 2 - 6, 164, 12);
      g.fillStyle(0x22336b).fillRect(W / 2 - 80, H / 2 - 4, 160, 8);
      g.fillStyle(C.gold).fillRect(W / 2 - 80, H / 2 - 4, Math.round(160 * p), 8);
      for (let i = 0; i < 16; i++) g.fillStyle(C.ink, 0.6).fillRect(W / 2 - 80 + i * 10, H / 2 - 4, 1, 8);
    });
    this.load.on('loaderror', (f: { key: string }) => console.warn('Asset failed to load (game continues):', f.key));
    this.load.once('complete', () => label.destroy());
    for (const [k, p] of Object.entries(IMAGES)) this.load.image(k, A + p);
    for (const k of PARTS) this.load.image(k, A + 'spacecraft/' + k + '.png');
    for (const [k, p, fw, fh] of SHEETS) this.load.spritesheet(k, A + p, { frameWidth: fw, frameHeight: fh });
  }
  create() {
    // placeholder textures for anything that failed to load, so scenes never crash
    const ensure = (key: string, w = 8, h = 8) => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x525268).fillRect(0, 0, w, h); g.generateTexture(key, w, h); g.destroy();
    };
    [...Object.keys(IMAGES), ...PARTS].forEach((k) => ensure(k));
    const anim = (key: string, sheet: string, frames: number[], rate: number, repeat = -1) => {
      if (!this.textures.exists(sheet) || this.anims.exists(key)) return;
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(sheet, { frames }), frameRate: rate, repeat });
    };
    for (const who of ['kai_civ', 'kai_launch', 'kai_eva', 'town_0', 'town_1', 'town_2', 'town_3']) {
      anim(`${who}-idle`, who, [0, 0, 0, 1], 3);
      anim(`${who}-walk`, who, [2, 3, 4, 5], 8);
    }
    anim('kai_civ-wave', 'kai_civ', [6, 7], 4);
    for (const t of ['town_0', 'town_1', 'town_2', 'town_3']) anim(`${t}-wave`, t, [6, 7], 4);
    anim('kai_launch-cheer', 'kai_launch', [6, 7], 4);
    anim('kai_eva-cheer', 'kai_eva', [6, 7], 4);
    anim('kai_eva-work', 'kai_eva', [8, 9], 3);
    for (let i = 0; i < 4; i++) anim(`op${i}`, 'operators', [i * 2, i * 2 + 1], 1 + i * 0.3);
    anim('flame', 'flame', [0, 1, 2, 3], 18);
    anim('smoke', 'smoke', [0, 1, 2, 3, 4, 5], 8, 0);
    anim('dust', 'dust', [0, 1, 2, 3, 4, 5], 14);
    anim('plasma', 'plasma', [0, 1, 2, 3], 14);
    anim('splash', 'splash', [0, 1, 2, 3], 8, 0);
    anim('arrow-blink', 'arrow', [0, 1], 3);
    this.scene.start('Title');
  }
}
