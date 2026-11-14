/**
 * Modular spacecraft renderer. Builds the vehicle from the selected components using consistent
 * attachment coordinates. Modes: 'stack' (vertical, hangar), 'flight' (horizontal, docked lander),
 * 'csm' (horizontal, no lander).
 */
import Phaser from 'phaser';
import type { Design } from '../../data/mission';

type Mode = 'stack' | 'flight' | 'csm';

const SM_H: Record<string, number> = { tank_s: 30, tank_m: 40, tank_l: 50 };

export class SpacecraftView extends Phaser.GameObjects.Container {
  stack: Phaser.GameObjects.Container;
  landerC: Phaser.GameObjects.Container;
  byPart: Record<string, Phaser.GameObjects.Image[]> = {};
  mode: Mode;
  showLander: boolean;
  constructor(scene: Phaser.Scene, x: number, y: number, design: Design, mode: Mode = 'stack') {
    super(scene, x, y);
    this.mode = mode;
    this.showLander = mode !== 'csm';
    this.stack = scene.add.container(0, 0);
    this.landerC = scene.add.container(0, 0);
    this.add([this.stack, this.landerC]);
    this.build(design);
    scene.add.existing(this);
  }

  private img(c: Phaser.GameObjects.Container, key: string, x: number, y: number, part?: string, flip = false) {
    const im = this.scene.add.image(Math.round(x), Math.round(y), key).setOrigin(0, 0);
    if (flip) im.setFlipX(true);
    c.add(im);
    if (part) (this.byPart[part] ??= []).push(im);
    return im;
  }

  build(d: Design) {
    this.stack.removeAll(true);
    this.landerC.removeAll(true);
    this.byPart = {};
    const s = d.slots;
    const has = (id: string) => d.science.includes(id) || d.safety.includes(id) || Object.values(s).includes(id);
    const C = this.stack;
    const tex = (k: string) => this.scene.textures.exists(k);
    // vertical layout, x=0 is the centreline, y=0 top of LAS
    let y = 0;
    if (this.mode === 'stack') { this.img(C, 'las', -4, 0); }
    y = 28;
    const capY = y;
    // heat shield first so the capsule overlaps it slightly
    const hs = s.heatShield as string | undefined;
    const hsH = hs === 'hs_thick' ? 6 : 4;
    if (hs && tex(hs)) this.img(C, hs, hs === 'hs_thick' ? -22 : -21, capY + 27, hs);
    this.img(C, 'capsule', -20, capY);
    const smY = capY + 27 + (hs ? hsH : 4) - 1;
    const tank = (s.tank as string) || 'tank_m';
    const smH = SM_H[tank] ?? 40;
    // engine (behind SM)
    const eng = s.propulsion as string | undefined;
    if (eng) { const w = eng === 'eng_methalox' ? 24 : 18; this.img(C, eng, -w / 2, smY + smH - 1, eng); }
    // power
    const pwr = s.power as string | undefined;
    if (pwr === 'pwr_solar6' || pwr === 'pwr_solar11') {
      const key = pwr === 'pwr_solar6' ? 'pwr_solar4' : 'pwr_solar8';
      const w = pwr === 'pwr_solar6' ? 44 : 64;
      this.img(C, key, 19, smY + 9, pwr);
      this.img(C, key, -19 - w, smY + 9, pwr, true);
    }
    // deployable radiator fins (behind SM)
    if (s.thermal === 'thr_ext') { this.img(C, 'thr_ext', 16, smY + smH - 26, 'thr_ext'); this.img(C, 'thr_ext', -26, smY + smH - 26, 'thr_ext', true); }
    if (tank && tex(tank === 'tank_s' ? 'sm_s' : tank === 'tank_l' ? 'sm_l' : 'sm_m')) this.img(C, tank === 'tank_s' ? 'sm_s' : tank === 'tank_l' ? 'sm_l' : 'sm_m', -19, smY, tank);
    // SM front-panel equipment
    if (pwr === 'pwr_fuelcell') this.img(C, 'pwr_fuelcell', -14, smY + Math.round(smH / 2) - 6, pwr);
    if (s.thermal === 'thr_std') this.img(C, 'thr_std', 6, smY + 6, 'thr_std');
    const bat = s.battery as string | undefined;
    const nb = bat === 'bat_40' ? 3 : bat === 'bat_24' ? 2 : bat ? 1 : 0;
    for (let i = 0; i < nb; i++) this.img(C, 'battery', -17, smY + 7 + i * 7, bat);
    const ls = s.lifeSupport as string | undefined;
    if (ls === 'ls_open') this.img(C, 'ls_open', -8, smY + 7, ls);
    if (ls === 'ls_regen') this.img(C, 'ls_regen', -7, smY + 6, ls);
    const dat = s.storage as string | undefined;
    if (dat) this.img(C, dat === 'dat_1t' ? 'dat_l' : 'dat_s', -3, smY + smH - 10, dat);
    if (has('sci_mapcam')) this.img(C, 'sci_mapcam', -15, smY + smH - 13, 'sci_mapcam');
    if (has('sci_neutron')) this.img(C, 'sci_neutron', 7, smY + smH - 14, 'sci_neutron');
    if (has('saf_redund')) this.img(C, 'saf_redund', 8, smY + 1, 'saf_redund');
    // comms
    const com = s.comms as string | undefined;
    if (com === 'com_sband') this.img(C, 'com_sband', 9, capY + 4, com);
    if (com === 'com_hga') this.img(C, 'com_hga', 17, smY + smH - 20, com);
    if (com === 'com_laser') this.img(C, 'com_laser', 14, smY - 6, com);
    // capsule details
    if (s.guidance === 'gnc_std') this.img(C, 'gnc_std', -13, capY + 10, 'gnc_std');
    if (has('saf_shelter')) this.img(C, 'saf_shelter', 5, capY + 15, 'saf_shelter');

    // lander
    const lander = s.lander as string | undefined;
    if (lander && this.showLander) {
      const key = lander === 'lander_path' ? 'lander_path' : 'lander_scout';
      const lw = lander === 'lander_path' ? 70 : 56, lh = lander === 'lander_path' ? 62 : 50;
      const L = this.landerC;
      this.img(L, key, 0, 0, lander);
      const descW = Math.round(lw * 0.62), dx = Math.round((lw - descW) / 2), dy = Math.round(lh * 0.5), descH = Math.round(lh * 0.34);
      if (has('sci_seismo')) this.img(L, 'sci_seismo', dx - 9, dy + 3, 'sci_seismo');
      if (has('sci_retro')) this.img(L, 'sci_retro', dx - 10, dy + 11, 'sci_retro');
      if (has('sci_samples')) this.img(L, 'sci_samples', dx + descW - 1, dy + 4, 'sci_samples');
      if (has('sci_pancam')) this.img(L, 'sci_pancam', Math.round(lw / 2) + 9, Math.round(dy - lh * 0.4) - 12, 'sci_pancam');
      if (s.guidance === 'gnc_trn') this.img(L, 'gnc_trn', dx + descW - 8, dy + descH - 5, 'gnc_trn');
      if (this.mode === 'stack') { L.setPosition(60, smY + smH + 22 - lh); }
    }
    if (this.mode !== 'stack') {
      // horizontal flight configuration: capsule nose points right
      this.stack.setAngle(90);
      this.stack.setPosition(0, 0);
      if (lander && this.showLander) {
        const lw = lander === 'lander_path' ? 70 : 56, lh = lander === 'lander_path' ? 62 : 50;
        this.landerC.setAngle(-90);
        // docking hatch (top centre of lander) meets capsule nose at (-capY,0) after rotation
        this.landerC.setPosition(-capY + 3, lw / 2);
        void lh;
      }
    }
  }

  /** Pulse-highlight the sprites belonging to a component. */
  highlight(partId: string | null) {
    for (const [id, imgs] of Object.entries(this.byPart)) for (const im of imgs) {
      this.scene.tweens.killTweensOf(im);
      im.clearTint().setAlpha(1);
      if (id === partId) {
        im.setTint(0xffe27a);
        this.scene.tweens.add({ targets: im, alpha: 0.55, yoyo: true, repeat: -1, duration: 260 });
      }
    }
  }
  flashParts(ids: string[], color = 0xee6448) {
    for (const id of ids) for (const im of this.byPart[id] ?? []) {
      im.setTint(color);
      this.scene.time.delayedCall(700, () => im.clearTint());
    }
  }
}
