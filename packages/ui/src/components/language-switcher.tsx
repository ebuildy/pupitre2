import { changeLocale, LOCALES, type Locale, useTranslation } from '@pupitre/i18n'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'

/** Each language is named in itself, so it can be found whatever the current language. */
const LOCALE_NAMES: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
}

/** Spec 018: the language selector of every frontend. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()

  return (
    <NativeSelect
      size="sm"
      aria-label={t('language')}
      value={i18n.resolvedLanguage}
      onChange={(e) => changeLocale(e.target.value as Locale)}
      containerClassName={className}
    >
      {LOCALES.map((locale) => (
        <NativeSelectOption key={locale} value={locale} lang={locale}>
          {LOCALE_NAMES[locale]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
