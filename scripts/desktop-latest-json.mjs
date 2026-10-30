// After a release build, collects the Windows installer, its update signature and a
// latest.json (what the app's updater reads) into one folder to upload to MYROOMS_UPDATE_URL:
//
//   MYROOMS_UPDATE_URL=https://app.example.com/desktop node scripts/desktop-latest-json.mjs [notes]
//   scp dist-desktop/*.exe dist-desktop/*.sig <user>@<vps>:/var/www/myrooms-desktop/
//   scp dist-desktop/latest.json <user>@<vps>:/var/www/myrooms-desktop/
//
// Upload the installer before latest.json, so no app sees a version whose file isn't there yet.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const updateUrl = (process.env.MYROOMS_UPDATE_URL ?? '').trim().replace(/\/+$/, '');
if (!updateUrl) {
  console.error('MYROOMS_UPDATE_URL is required.');
  process.exit(1);
}

const bundle = join(
  process.env.CARGO_TARGET_DIR ?? join(root, 'src-tauri/target'),
  'release/bundle/nsis',
);
const installer = readdirSync(bundle).find(
  (f) => f.endsWith('-setup.exe') && f.includes(`_${version}_`),
);
if (!installer || !existsSync(join(bundle, `${installer}.sig`))) {
  console.error(
    `No signed installer for ${version} in ${bundle}. Build with the release config ` +
      '(scripts/desktop-release-config.mjs) and TAURI_SIGNING_PRIVATE_KEY set.',
  );
  process.exit(1);
}

const out = join(root, 'dist-desktop');
mkdirSync(out, { recursive: true });
copyFileSync(join(bundle, installer), join(out, installer));
copyFileSync(join(bundle, `${installer}.sig`), join(out, `${installer}.sig`));

const platform = {
  signature: readFileSync(join(bundle, `${installer}.sig`), 'utf8').trim(),
  url: `${updateUrl}/${encodeURIComponent(installer)}`,
};
const latest = {
  version,
  notes: process.argv[2] ?? `MyRooms ${version}`,
  pub_date: new Date().toISOString(),
  platforms: { 'windows-x86_64': platform, 'windows-x86_64-nsis': platform },
};
writeFileSync(join(out, 'latest.json'), JSON.stringify(latest, null, 2) + '\n');
console.log(`dist-desktop/: ${installer}, .sig, latest.json (${version})`);
