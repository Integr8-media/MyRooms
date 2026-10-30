// Sets the app version everywhere it is written down:
//   node scripts/set-version.mjs 1.0.1      (or: npm run version:set -- 1.0.1)
// package.json (the Windows app reads it through tauri.conf.json), app.json (phones and web),
// src-tauri/Cargo.toml. Store build numbers are counted by EAS (appVersionSource: remote).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2] ?? '';
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/set-version.mjs <major.minor.patch>');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const editJson = (file, edit) => {
  const path = join(root, file);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  edit(data);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
};
editJson('package.json', (p) => (p.version = version));
editJson('app.json', (a) => (a.expo.version = version));

const cargo = join(root, 'src-tauri/Cargo.toml');
writeFileSync(
  cargo,
  readFileSync(cargo, 'utf8').replace(/^version = "[^"]*"/m, `version = "${version}"`),
);
console.log(`version ${version}: package.json, app.json, src-tauri/Cargo.toml`);
console.log('Also run `npm install --package-lock-only` so package-lock.json matches.');
