import { useTranslation } from '@pupitre/i18n'
import { Alert, AlertDescription } from '@pupitre/ui/components/ui/alert'
import { Button } from '@pupitre/ui/components/ui/button'
import { Input } from '@pupitre/ui/components/ui/input'
import { CircleAlertIcon, InfoIcon } from 'lucide-react'
import { landingPath, type Role } from '@pupitre/shared'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { signInWithIdentifier, useSession } from './auth-client.ts'
import { AuthCard } from './AuthCard.tsx'
import { useGoTo } from './navigation.ts'
import { usePublicSettings } from './settings.ts'

const INVALID_CREDENTIALS = new Set(['INVALID_EMAIL_OR_PASSWORD', 'INVALID_USERNAME_OR_PASSWORD'])

type ErrorKey = 'emptyFields' | 'invalidCredentials' | 'localLoginDisabled' | 'tooManyRequests' | 'generic'

/** A known account the login page can sign in with in one click (dev only, see `demoAccounts`). */
export type DemoAccount = { name: string; role: Role; identifier: string; password: string }

/**
 * Spec 023, shared by every frontend (SSO/LDAP tabs come with their features). The "Créer un compte" link shows
 * while registration is open (spec 021); with local login disabled (spec 024) the form is folded under
 * "Connexion administrateur". `redirect` and landing paths are origin-absolute (spec 025).
 *
 * `demoAccounts` adds one-click sign-in buttons under the form (spec 015). Only pass them in dev
 * (`import.meta.env.DEV`), so the credentials are not in production bundles.
 */
export function LoginPage({ demoAccounts }: { demoAccounts?: readonly DemoAccount[] } = {}) {
  const { t } = useTranslation(['auth', 'common'])
  const formRef = useRef<HTMLFormElement>(null)
  const goTo = useGoTo()
  const [params] = useSearchParams()
  const { data: session, isPending: sessionPending } = useSession()
  const settings = usePublicSettings()
  // Kept as a key or a raw API message so the banner follows language changes.
  const [error, setError] = useState<{ key: ErrorKey } | { message: string } | null>(null)
  const [pending, setPending] = useState(false)

  const redirect = params.get('redirect')

  const signedInRole = session?.user.role as Role | undefined
  useEffect(() => {
    if (signedInRole) goTo(landingPath(signedInRole, redirect), { replace: true })
  }, [signedInRole, redirect, goTo])

  if (sessionPending || session || settings === undefined) return null
  const localLogin = settings?.sso_local_login_enabled ?? true

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const identifier = String(form.get('identifier') ?? '').trim()
    const password = String(form.get('password') ?? '')
    if (!identifier || !password) return setError({ key: 'emptyFields' })

    setError(null)
    setPending(true)
    const { data, error } = await signInWithIdentifier(identifier, password)
    setPending(false)
    if (error) {
      if (error.code && INVALID_CREDENTIALS.has(error.code)) return setError({ key: 'invalidCredentials' })
      if (error.status === 429) return setError({ key: 'tooManyRequests' })
      if (error.message?.startsWith('Local login is disabled')) return setError({ key: 'localLoginDisabled' })
      return setError(error.message ? { message: error.message } : { key: 'generic' })
    }
    goTo(landingPath(data.user.role as Role, redirect), { replace: true })
  }

  // Fills the form and submits it, so a demo sign-in goes through the same path as a manual one.
  function signInAs(account: DemoAccount) {
    const form = formRef.current
    if (!form) return
    ;(form.elements.namedItem('identifier') as HTMLInputElement).value = account.identifier
    ;(form.elements.namedItem('password') as HTMLInputElement).value = account.password
    form.requestSubmit()
  }

  const form = (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <Input
        name="identifier"
        placeholder={t('login.identifierPlaceholder')}
        aria-label={t('login.identifierLabel')}
        autoComplete="username"
        className="h-11"
      />
      <Input
        name="password"
        type="password"
        placeholder={t('login.passwordPlaceholder')}
        aria-label={t('login.passwordLabel')}
        autoComplete="current-password"
        className="h-11"
      />
      <Button type="submit" size="lg" disabled={pending} className="h-11">
        {pending ? t('login.submitting') : t('login.submit')}
      </Button>
    </form>
  )

  return (
    <AuthCard>
      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{'key' in error ? t(`login.errors.${error.key}`) : error.message}</AlertDescription>
        </Alert>
      )}

      {localLogin ? (
        form
      ) : (
        <>
          <Alert>
            <InfoIcon />
            <AlertDescription>{t('login.localDisabled')}</AlertDescription>
          </Alert>
          <details className="group rounded-lg border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">{t('login.adminLogin')}</summary>
            <div className="pt-3">{form}</div>
          </details>
        </>
      )}

      {localLogin && settings?.registration_enabled && (
        <p className="text-center text-sm text-muted-foreground">
          {t('login.noAccount')}{' '}
          {/* The registration page belongs to the learner app: plain link, full page load. */}
          <a href="/register" className="font-medium text-primary hover:underline">
            {t('login.register')}
          </a>
        </p>
      )}

      {demoAccounts && demoAccounts.length > 0 && (
        <section aria-labelledby="demo-accounts" className="flex flex-col gap-2 border-t pt-4">
          <h2 id="demo-accounts" className="text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('login.demo.title')}
          </h2>
          {demoAccounts.map((account) => (
            <Button
              key={account.identifier}
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => signInAs(account)}
              aria-label={t('login.demo.signInAs', { name: account.name })}
              className="h-11 justify-between"
            >
              <span className="font-medium">{account.name}</span>
              <span className="text-muted-foreground">{t(`common:roles.${account.role}`)}</span>
            </Button>
          ))}
        </section>
      )}
    </AuthCard>
  )
}
