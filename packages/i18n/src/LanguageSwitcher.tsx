import { useTranslation } from 'react-i18next'
import { changeLocale, LOCALES, type Locale } from './i18n.ts'

/** Each language is named in itself, so it can be found whatever the current language. */
const LOCALE_NAMES: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
}

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation()

  return (
    <select
      aria-label={t('language')}
      value={i18n.resolvedLanguage}
      onChange={(e) => changeLocale(e.target.value as Locale)}
      className={`rounded border border-zinc-300 bg-transparent px-1 py-1 text-sm dark:border-zinc-700 ${className}`}
    >
      {LOCALES.map((locale) => (
        <option key={locale} value={locale} lang={locale}>
          {LOCALE_NAMES[locale]}
        </option>
      ))}
    </select>
  )
}
