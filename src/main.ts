import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { TitleScene } from './game/scenes/TitleScene';
import { IntroScene } from './game/scenes/IntroScene';
import { BriefingScene } from './game/scenes/BriefingScene';
import { HangarScene } from './game/scenes/HangarScene';
import { OverlayScene } from './game/scenes/OverlayScene';
import { ReviewScene } from './game/scenes/ReviewScene';
import { LaunchScene } from './game/scenes/LaunchScene';
import { OpsScene } from './game/scenes/OpsScene';
import { LandingScene } from './game/scenes/LandingScene';
import { SurfaceScene } from './game/scenes/SurfaceScene';
import { ReturnScene } from './game/scenes/ReturnScene';
import { ReportScene } from './game/scenes/ReportScene';
import { RoleSelectScene } from './game/scenes/RoleSelectScene';
import { MissionSelectScene } from './game/scenes/MissionSelectScene';
import { DockingScene } from './game/scenes/DockingScene';
import { SpacewalkScene } from './game/scenes/SpacewalkScene';
import { DeskScene } from './game/scenes/DeskScene';
import { store } from './state/store';
import { audio } from './game/audio/audio';
import * as debug from './state/debug';
import { emergencyUI } from './game/ui/emergency';

const scenes: Phaser.Types.Scenes.SceneType[] = [BootScene, TitleScene, IntroScene, BriefingScene, RoleSelectScene, MissionSelectScene, HangarScene, DeskScene, ReviewScene, LaunchScene, OpsScene, DockingScene, SpacewalkScene, LandingScene, SurfaceScene, ReturnScene, ReportScene, OverlayScene];

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 480,
  height: 270,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#0b0820',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, fullscreenTarget: 'game' },
  scene: scenes,
  fps: { target: 60 },
  input: { activePointers: 1 },
});

// A5: re-fit on any resize without a reload (FIT does most of it; refresh covers browser zoom,
// orientation changes and leaving fullscreen, where the parent's size can lag a frame)
const refit = () => requestAnimationFrame(() => game.scale.refresh());
window.addEventListener('resize', refit);
window.addEventListener('orientationchange', refit);
document.addEventListener('fullscreenchange', refit);

// F toggles fullscreen anywhere (the gear's neighbour button does the same).
window.addEventListener('keydown', (e) => {
  if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) game.scale.toggleFullscreen();
});

const sceneLog: string[] = [];
game.events.once('ready', () => { for (const sc of game.scene.scenes) sc.sys.events.on('create', () => sceneLog.push(sc.scene.key)); });

// Test / debugging hooks (used by Playwright).
declare global { interface Window { __ottm: unknown } }
window.__ottm = {
  game,
  store,
  audio,
  debug,
  emergencyOpen: () => emergencyUI.open,
  /** Every scene started this session, in order (the ISS e2e checks Landing and Surface never ran). */
  sceneLog,
  /** A3: visible text that runs past the screen or was cut off with an ellipsis, in the active scenes. */
  textOverflow: () => {
    const bad: string[] = [];
    const walk = (o: Phaser.GameObjects.GameObject, sc: Phaser.Scene) => {
      if (o instanceof Phaser.GameObjects.Container) { if (o.visible && o.alpha > 0) o.list.forEach((c) => walk(c, sc)); return; }
      if (!(o instanceof Phaser.GameObjects.BitmapText) || !o.visible || o.alpha === 0 || !o.text.trim()) return;
      let p: Phaser.GameObjects.Container | null = o.parentContainer, hidden = false;
      let sf: { scrollFactorX: number; scrollFactorY: number } = o;
      while (p) { if (!p.visible || p.alpha === 0) hidden = true; sf = p; p = p.parentContainer; } // the outermost container's scroll factor wins
      if (hidden) return;
      const b = o.getBounds(), cam = sc.cameras.main;
      const x = b.x - cam.scrollX * sf.scrollFactorX, y = b.y - cam.scrollY * sf.scrollFactorY;
      if (y < -500) return; // measuring probes
      const out = x < -1 || y < -1 || x + b.width > cam.width + 1 || y + b.height > cam.height + 1;
      if (out || /…$/.test(o.text)) bad.push(`${sc.scene.key}: "${o.text.slice(0, 60)}" at ${Math.round(x)},${Math.round(y)} ${Math.round(b.width)}x${Math.round(b.height)}`);
    };
    for (const sc of game.scene.getScenes(true)) sc.children.list.forEach((o) => walk(o, sc));
    return bad;
  },
  scene: () => game.scene.getScenes(true).map((s) => s.scene.key),
  goto: (key: string, data?: object) => {
    for (const s of game.scene.getScenes(true)) if (s.scene.key !== key) game.scene.stop(s.scene.key);
    game.scene.start(key, data);
  },
};
