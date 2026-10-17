import { useTranslation } from '@pupitre/i18n'
import { ExportsPanel, PageHeader } from '@pupitre/ui'

/** Spec 182: "Exports CSV" for admins (whole platform). */
export function Exports() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('exports.title')} />
      <ExportsPanel basePath="/api/admin/exports" />
    </div>
  )
}
