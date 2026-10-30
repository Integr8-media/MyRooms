import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// One version everywhere (scripts/set-version.mjs): phones/web read app.json, the Windows app
// package.json (through tauri.conf.json), and the updater compares it with latest.json.
const root = join(__dirname, '../..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

test('package.json, app.json and Cargo.toml have the same version', () => {
  const pkg = JSON.parse(read('package.json')).version;
  expect(JSON.parse(read('app.json')).expo.version).toBe(pkg);
  expect(read('src-tauri/Cargo.toml')).toMatch(new RegExp(`^version = "${pkg}"`, 'm'));
  expect(JSON.parse(read('src-tauri/tauri.conf.json')).version).toBe('../package.json');
});
