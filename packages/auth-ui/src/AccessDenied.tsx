import { useTranslation } from '@pupitre/i18n'
import { useGoTo } from './navigation.ts'

export function AccessDenied() {
  const { t } = useTranslation()
  const goTo = useGoTo()

  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">{t('accessDenied.title')}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{t('accessDenied.body')}</p>
      <a
        href="/courses"
        onClick={(e) => {
          e.preventDefault()
          goTo('/courses')
        }}
        className="rounded bg-zinc-900 px-3 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        {t('backToCatalogue')}
      </a>
    </div>
  )
}
