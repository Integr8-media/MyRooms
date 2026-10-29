import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ar from './locales/ar.json';
import en from './locales/en.json';

export const LANGUAGES = ['en', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

/** Device language if we support it, otherwise English. */
export function getDeviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return isLanguage(code) ? code : 'en';
}

export function isRTL(language: Language): boolean {
  return language === 'ar';
}

// eslint-disable-next-line import/no-named-as-default-member -- i18next's documented API
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: getDeviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
