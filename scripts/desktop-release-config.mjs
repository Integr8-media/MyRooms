// Writes src-tauri/tauri.release.conf.json: the Windows release settings that need secrets or
// the production domain, merged into tauri.conf.json at build time:
//
//   node scripts/desktop-release-config.mjs
//   npx tauri build --bundles nsis --config src-tauri/tauri.release.conf.json
//
// Environment:
//   MYROOMS_UPDATE_URL      where latest.json and the installers are served,
//                           e.g. https://app.example.com/desktop (required)
//   TAURI_UPDATER_PUBKEY    public key from `npx tauri signer generate` (required)
//   TAURI_SIGNING_PRIVATE_KEY (+ _PASSWORD) must also be set for `tauri build` itself:
//                           it signs the update files. Never commit the private key.
//   WINDOWS_SIGN_COMMAND    optional: a code-signing command for the installer and exe,
//                           e.g. Azure Artifact Signing (`trusted-signing-cli … %1`)
//   WINDOWS_CERT_THUMBPRINT optional: or a certificate already in the Windows store
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const env = (name) => (process.env[name] ?? '').trim();
const updateUrl = env('MYROOMS_UPDATE_URL').replace(/\/+$/, '');
const pubkey = env('TAURI_UPDATER_PUBKEY');
if (!updateUrl || !pubkey) {
  console.error('MYROOMS_UPDATE_URL and TAURI_UPDATER_PUBKEY are required.');
  process.exit(1);
}
if (!/^https:\/\//.test(updateUrl)) {
  console.error('MYROOMS_UPDATE_URL must be https (the updater refuses plain http).');
  process.exit(1);
}

const windows = {};
if (env('WINDOWS_SIGN_COMMAND')) {
  windows.signCommand = env('WINDOWS_SIGN_COMMAND');
} else if (env('WINDOWS_CERT_THUMBPRINT')) {
  windows.certificateThumbprint = env('WINDOWS_CERT_THUMBPRINT');
  windows.digestAlgorithm = 'sha256';
  windows.timestampUrl = 'http://timestamp.digicert.com';
}

const config = {
  bundle: { createUpdaterArtifacts: true, windows },
  plugins: {
    updater: {
      pubkey,
      endpoints: [`${updateUrl}/latest.json`],
      // Shows the installer's progress, no questions; the app restarts afterwards.
      windows: { installMode: 'passive' },
    },
  },
};

const out = join(dirname(fileURLToPath(import.meta.url)), '../src-tauri/tauri.release.conf.json');
writeFileSync(out, JSON.stringify(config, null, 2) + '\n');
console.log(
  `wrote ${out} (updates from ${updateUrl}, code signing: ${
    windows.signCommand ? 'command' : windows.certificateThumbprint ? 'certificate' : 'none'
  })`,
);
