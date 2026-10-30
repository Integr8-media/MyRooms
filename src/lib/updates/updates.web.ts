import type { AvailableUpdate } from './updates';

export type { AvailableUpdate } from './updates';

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Windows app: asks the update server (latest.json next to the installers, see
 * scripts/desktop-release-config.mjs) whether a newer signed version exists. A browser, a build
 * without the updater config, or no internet: no update.
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!isTauri()) return null;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      notes: update.body ?? null,
      install: async (onProgress) => {
        let total = 0;
        let received = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === 'Started') total = event.data.contentLength ?? 0;
          if (event.event === 'Progress') {
            received += event.data.chunkLength;
            onProgress(total ? Math.min(1, received / total) : null);
          }
        });
        // On Windows the installer usually closes the app itself; restart if it didn't.
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      },
    };
  } catch {
    return null;
  }
}
