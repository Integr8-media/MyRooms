/**
 * Web and Windows (WebView2): the local database lives in the browser's storage, which the
 * browser may clear when the disk runs low, losing changes that haven't uploaded. Asking for
 * persistent storage stops that (Chrome/Edge grant it to installed or often-used sites).
 * Returns null when the browser can't tell.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!storage?.persist) return null;
  try {
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return null;
  }
}
