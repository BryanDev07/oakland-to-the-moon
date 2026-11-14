// Asset pipeline entry point: `npm run assets` (or `node scripts/generate-assets/index.mjs <step>`)
import { buildFont, buildLogo } from './font.mjs';
import { buildUI } from './ui.mjs';
import { buildCharacters } from './characters.mjs';
import { buildOakland } from './oakland.mjs';
import { buildParts, buildRockets, buildLaunchSite, buildHangar, buildMissionControl } from './spacecraft.mjs';
import { buildSpace } from './space.mjs';

const only = process.argv[2];
const steps = {
  font: () => { buildFont(); buildLogo(); },
  ui: buildUI,
  characters: buildCharacters,
  oakland: buildOakland,
  spacecraft: () => { buildParts(); buildRockets(); },
  interiors: () => { buildLaunchSite(); buildHangar(); buildMissionControl(); },
  space: buildSpace,
};
for (const [name, fn] of Object.entries(steps)) {
  if (only && only !== name) continue;
  const t = Date.now();
  fn();
  console.log(`generated ${name} in ${Date.now() - t}ms`);
}
