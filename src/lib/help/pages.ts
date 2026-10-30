/**
 * The user guide and privacy policy are static pages in `public/` (copied to the web export,
 * so they live at https://<app domain>/guide.html …). Store listings link to the same URLs.
 */
export type HelpPage = 'guide' | 'privacy';

export function helpPath(page: HelpPage, language: string): string {
  const ar = language.startsWith('ar');
  if (page === 'guide') return ar ? 'guide-ar.html' : 'guide.html';
  return ar ? 'privacy.html#ar' : 'privacy.html#en';
}

/** Absolute URL on the hosted web app, or null when its address isn't configured. */
export function helpUrl(appUrl: string, page: HelpPage, language: string): string | null {
  if (!appUrl) return null;
  return `${appUrl.replace(/\/+$/, '')}/${helpPath(page, language)}`;
}
