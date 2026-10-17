import { useTranslation } from '@pupitre/i18n'
import { landingPath, passwordChecks, type Role, USERNAME_MIN, USERNAME_PATTERN } from '@pupitre/shared'
import { Alert, AlertDescription, AlertTitle } from '@pupitre/ui/components/ui/alert'
import { Button } from '@pupitre/ui/components/ui/button'
import { Input } from '@pupitre/ui/components/ui/input'
import { Label } from '@pupitre/ui/components/ui/label'
import { CircleAlertIcon, LockIcon } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { authClient, useSession } from './auth-client.ts'
import { AuthCard } from './AuthCard.tsx'
import { useGoTo } from './navigation.ts'
import { PasswordChecklist } from './PasswordChecklist.tsx'
import { usePublicSettings } from './settings.ts'

type ErrorKey =
  | 'emptyFields'
  | 'usernameTooShort'
  | 'usernameInvalid'
  | 'emailInvalid'
  | 'taken'
  | 'domain'
  | 'closed'
  | 'policy'
  | 'generic'

const TAKEN_CODES = new Set([
  'USER_ALREADY_EXISTS',
  'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
  'USERNAME_IS_ALREADY_TAKEN',
  'USERNAME_IS_ALREADY_TAKEN_PLEASE_TRY_ANOTHER',
])

/** Maps a sign-up error (better-auth code, or the message of a policy check in the API) to a translation key. */
function errorKey(error: { code?: string; message?: string; status: number }): ErrorKey | 'tooManyRequests' | null {
  if (error.status === 429) return 'tooManyRequests'
  if (error.code && TAKEN_CODES.has(error.code)) return 'taken'
  const message = error.message ?? ''
  if (message.startsWith('New user registration')) return 'closed'
  if (message.startsWith('Registration is restricted')) return 'domain'
  if (message.startsWith('Password must')) return 'policy'
  return null
}

/** Specs 020–022: local account creation, then the user is signed in and lands on the catalogue. */
export function RegisterPage() {
  const { t } = useTranslation('auth')
  const goTo = useGoTo()
  const settings = usePublicSettings()
  const { data: session, isPending: sessionPending } = useSession()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<{ key: ErrorKey | 'tooManyRequests' } | { message: string } | null>(null)
  const [pending, setPending] = useState(false)

  const signedInRole = session?.user.role as Role | undefined
  useEffect(() => {
    if (signedInRole) goTo(landingPath(signedInRole, null), { replace: true })
  }, [signedInRole, goTo])

  if (sessionPending || session || settings === undefined) return null

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

  const mismatch = confirm.length > 0 && password !== confirm

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const username = String(form.get('username') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    if (!username || !email || !password || !confirm) return setError({ key: 'emptyFields' })
    if (username.length < USERNAME_MIN) return setError({ key: 'usernameTooShort' })
    if (!USERNAME_PATTERN.test(username)) return setError({ key: 'usernameInvalid' })
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) return setError({ key: 'emailInvalid' })
    if (password !== confirm) return
    if (settings && passwordChecks(password, settings).some((c) => !c.ok)) return setError({ key: 'policy' })

    setError(null)
    setPending(true)
    const { error } = await authClient.signUp.email({ email, password, name: username, username })
    setPending(false)
    if (error) {
      const key = errorKey(error)
      return setError(key ? { key } : error.message ? { message: error.message } : { key: 'generic' })
    }
    goTo('/courses', { replace: true })
  }

  return (
    <AuthCard subtitle={t('register.subtitle')}>
      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>
            {'message' in error
              ? error.message
              : error.key === 'tooManyRequests'
                ? t('login.errors.tooManyRequests')
                : t(`register.errors.${error.key}`, { count: USERNAME_MIN })}
          </AlertDescription>
        </Alert>
      )}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-username">{t('register.usernameLabel')}</Label>
          <Input id="register-username" name="username" autoComplete="username" minLength={USERNAME_MIN} className="h-11" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-email">{t('register.emailLabel')}</Label>
          <Input id="register-email" name="email" type="email" autoComplete="email" className="h-11" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-password">{t('register.passwordLabel')}</Label>
          <Input
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            className="h-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {settings && <PasswordChecklist password={password} policy={settings} />}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-confirm">{t('register.confirmLabel')}</Label>
          <Input
            id="register-confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            className="h-11"
            value={confirm}
            aria-invalid={mismatch || undefined}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {mismatch && <p className="text-sm text-destructive">{t('register.mismatch')}</p>}
        </div>
        <Button type="submit" size="lg" disabled={pending} className="h-11">
          {pending ? t('register.submitting') : t('register.submit')}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {t('register.haveAccount')}{' '}
        <a href="/login" className="font-medium text-primary hover:underline">
          {t('register.signIn')}
        </a>
      </p>
    </AuthCard>
  )
}
