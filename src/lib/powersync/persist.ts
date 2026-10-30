/**
 * Phones keep the SQLite file in the app's own storage, which the OS doesn't clear on its
 * own (only uninstalling or "Clear data" does). Web has its own version (persist.web.ts).
 */
export async function requestPersistentStorage(): Promise<boolean> {
  return true;
}
