import * as WebBrowser from 'expo-web-browser';

import { config } from '@/lib/config';

import { helpUrl, type HelpPage } from './pages';

/** Phones: the pages on the hosted web app (needs EXPO_PUBLIC_APP_URL). */
export function canOpenHelp(): boolean {
  return !!config.appUrl;
}

export async function openHelp(page: HelpPage, language: string): Promise<void> {
  const url = helpUrl(config.appUrl, page, language);
  if (url) await WebBrowser.openBrowserAsync(url);
}
