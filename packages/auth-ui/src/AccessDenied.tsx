import { useTranslation } from '@pupitre/i18n'
import { Button } from '@pupitre/ui/components/ui/button'
import { ShieldXIcon } from 'lucide-react'
import { useGoTo } from './navigation.ts'

export function AccessDenied() {
  const { t } = useTranslation()
  const goTo = useGoTo()

  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 text-center">
      <ShieldXIcon className="size-12 text-destructive" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">{t('accessDenied.title')}</h1>
      <p className="text-muted-foreground">{t('accessDenied.body')}</p>
      <Button asChild>
        <a
          href="/courses"
          onClick={(e) => {
            e.preventDefault()
            goTo('/courses')
          }}
        >
          {t('backToCatalogue')}
        </a>
      </Button>
    </div>
  )
}
