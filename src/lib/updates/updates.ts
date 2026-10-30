/**
 * App updates. Only the Windows app updates itself (Tauri updater, see updates.web.ts);
 * phones update through the stores and the web app on reload.
 */
export type AvailableUpdate = {
  version: string;
  notes: string | null;
  /** Downloads, installs and restarts the app. Progress is 0–1, or null when unknown. */
  install: (onProgress: (fraction: number | null) => void) => Promise<void>;
};

export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  return null;
}
