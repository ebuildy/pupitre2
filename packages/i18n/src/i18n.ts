import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import * as en from './locales/en/index.ts'
import * as fr from './locales/fr/index.ts'

export const LOCALES = ['fr', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'fr'

/** Shared by every frontend: they are served on the same origin (spec 004). */
const STORAGE_KEY = 'locale'

export const resources = { fr, en } as const

export const namespaces = ['common', 'auth', 'app', 'admin'] as const

function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale)
}

function storedLocale(): Locale {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isLocale(value) ? value : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

i18next.use(initReactI18next).init({
  resources,
  lng: storedLocale(),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: LOCALES,
  ns: namespaces,
  defaultNS: 'common',
  initAsync: false,
  interpolation: { escapeValue: false }, // React escapes
})

document.documentElement.lang = i18next.language

i18next.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {}
})

export function changeLocale(locale: Locale) {
  return i18next.changeLanguage(locale)
}

export { i18next }

// Typed `t()` keys in every package that imports this module, checked against the French reference.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: (typeof resources)['fr']
  }
}
