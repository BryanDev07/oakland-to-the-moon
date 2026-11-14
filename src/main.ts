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
import { DeskScene } from './game/scenes/DeskScene';
import { store } from './state/store';
import { audio } from './game/audio/audio';
import * as debug from './state/debug';
import { emergencyUI } from './game/ui/emergency';

const scenes: Phaser.Types.Scenes.SceneType[] = [BootScene, TitleScene, IntroScene, BriefingScene, RoleSelectScene, HangarScene, DeskScene, ReviewScene, LaunchScene, OpsScene, LandingScene, SurfaceScene, ReturnScene, ReportScene, OverlayScene];

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

// F toggles fullscreen anywhere (the gear's neighbour button does the same).
window.addEventListener('keydown', (e) => {
  if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) game.scale.toggleFullscreen();
});

// Test / debugging hooks (used by Playwright).
declare global { interface Window { __ottm: unknown } }
window.__ottm = {
  game,
  store,
  audio,
  debug,
  emergencyOpen: () => emergencyUI.open,
  scene: () => game.scene.getScenes(true).map((s) => s.scene.key),
  goto: (key: string, data?: object) => {
    for (const s of game.scene.getScenes(true)) if (s.scene.key !== key) game.scene.stop(s.scene.key);
    game.scene.start(key, data);
  },
};
