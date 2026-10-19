import { useTranslation } from '@pupitre/i18n'
import { Alert, AlertDescription, AlertTitle } from '@pupitre/ui/components/ui/alert'
import { Button } from '@pupitre/ui/components/ui/button'
import { LockIcon } from 'lucide-react'
import { AuthCard } from './AuthCard.tsx'
import { LoginPage } from './LoginPage.tsx'
import { usePublicSettings } from './settings.ts'

/** Specs 020–022: `/register` is the login page with its registration section open, or a card while registration is closed. */
export function RegisterPage() {
  const { t } = useTranslation('auth')
  const settings = usePublicSettings()
  if (settings === undefined) return null
  if (settings && !settings.registration_enabled) {
    return (
      <AuthCard>
        <Alert>
          <LockIcon />
          <AlertTitle>🔒 {t('register.closedTitle')}</AlertTitle>
          <AlertDescription>{t('register.closedBody')}</AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <a href="/login">{t('register.backToLogin')}</a>
        </Button>
      </AuthCard>
    )
  }
  return <LoginPage section="register" />
}
