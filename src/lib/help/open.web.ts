import { config } from '@/lib/config';

import { helpPath, helpUrl, type HelpPage } from './pages';

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Web: the pages are part of this site, so they always open (new tab).
 * Windows: open the hosted web app's copy in the browser (needs EXPO_PUBLIC_APP_URL),
 * because the Tauri window can't open tabs.
 */
export function canOpenHelp(): boolean {
  return !isTauri() || !!config.appUrl;
}

export async function openHelp(page: HelpPage, language: string): Promise<void> {
  if (isTauri()) {
    const url = helpUrl(config.appUrl, page, language);
    if (url) await (await import('@tauri-apps/plugin-opener')).openUrl(url);
    return;
  }
  window.open(`/${helpPath(page, language)}`, '_blank', 'noopener');
}
