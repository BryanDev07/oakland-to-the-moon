// Refresh the README screenshots in docs/screenshots by running the Playwright suite with
// SHOTS_DIR set. A plain `npm run test:e2e` writes its screenshots to the git-ignored
// test-results/ folder instead, so normal test runs never change tracked files.
import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, SHOTS_DIR: 'docs/screenshots' },
});
process.exit(r.status ?? 1);
