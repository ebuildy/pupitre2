import { useTranslation } from '@pupitre/i18n'

// Stand-in for pages that later features will build.
export function Placeholder({ page }: { page: 'catalogue' | 'myCourses' }) {
  const { t } = useTranslation('app')
  return <h1 className="text-2xl font-semibold">{t(`pages.${page}`)}</h1>
}
