import { useTranslation } from '@pupitre/i18n'

export function Dashboard() {
  const { t } = useTranslation('admin')
  return <h1 className="text-2xl font-semibold">{t('dashboard.title')}</h1>
}
