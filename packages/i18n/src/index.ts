// Localization shared by every frontend (spec 018). Importing this module initializes i18next.
// Use `useTranslation` / `Trans` from here so every package shares one react-i18next instance.
export { Trans, useTranslation } from 'react-i18next'
export { changeLocale, DEFAULT_LOCALE, i18next, type Locale, LOCALES } from './i18n.ts'
export { LanguageSwitcher } from './LanguageSwitcher.tsx'
export type { Messages } from './types.ts'
