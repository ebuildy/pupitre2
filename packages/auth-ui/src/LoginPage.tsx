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
import { usePublicSettings, useSsoProviders } from './settings.ts'

const SSO_ERRORS = ['access_denied', 'state', 'conflict', 'inactive', 'no_email', 'unknown_provider', 'failed'] as const

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
  const ssoProviders = useSsoProviders()
  const ssoError = params.get('sso_error')
  // Kept as a key or a raw API message so the banner follows language changes.
  const [error, setError] = useState<{ key: ErrorKey } | { message: string } | null>(null)
  const [pending, setPending] = useState(false)
  const [tab, setTab] = useState<'local' | 'ldap'>('local')

  const redirect = params.get('redirect')

  const signedInRole = session?.user.role as Role | undefined
  useEffect(() => {
    if (signedInRole) goTo(landingPath(signedInRole, redirect), { replace: true })
  }, [signedInRole, redirect, goTo])

  if (sessionPending || session || settings === undefined) return null
  const localLogin = settings?.sso_local_login_enabled ?? true
  const ldap = settings?.ldap_enabled ?? false

  // Spec 030: the LDAP tab signs in through the API, which sets the session cookie.
  async function onLdapSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const identifier = String(form.get('identifier') ?? '').trim()
    const password = String(form.get('password') ?? '')
    if (!identifier || !password) return setError({ key: 'emptyFields' })
    setError(null)
    setPending(true)
    const res = await fetch('/api/sso/ldap/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    })
    setPending(false)
    const body = (await res.json().catch(() => ({}))) as { role?: Role; error?: string }
    if (!res.ok) {
      if (res.status === 401) return setError({ message: t('login.ldapInvalid') })
      if (res.status === 429) return setError({ key: 'tooManyRequests' })
      if (res.status === 409) return setError({ message: t('login.errors.sso.conflict') })
      if (res.status === 403) return setError({ message: t('login.errors.sso.inactive') })
      return setError(body.error ? { message: body.error } : { key: 'generic' })
    }
    // Full page load: the session is a cookie the client store has not seen yet.
    window.location.assign(landingPath(body.role, redirect))
  }

  const ldapForm = (
    <form onSubmit={onLdapSubmit} noValidate className="flex flex-col gap-3" aria-label={t('login.tabs.ldap')}>
      <Input name="identifier" placeholder={t('login.ldapIdentifier')} aria-label={t('login.ldapIdentifier')} autoComplete="username" className="h-11" />
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
      {(error || ssoError) && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>
            {error
              ? 'key' in error
                ? t(`login.errors.${error.key}`)
                : error.message
              : t(`login.errors.sso.${(SSO_ERRORS.includes(ssoError as (typeof SSO_ERRORS)[number]) ? ssoError : 'failed') as 'failed'}`)}
          </AlertDescription>
        </Alert>
      )}

      {ssoProviders.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="sso-providers">
          {ssoProviders.map((p) => (
            <Button key={p.id} asChild variant="outline" size="lg" className="h-11">
              {/* A full page load: the API redirects to the identity provider. */}
              <a href={`/api/sso/${p.id}/authorize${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`}>
                {t('login.sso', { name: p.name })}
              </a>
            </Button>
          ))}
          {localLogin && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-border" />
              {t('login.or')}
              <span className="h-px flex-1 bg-border" />
            </div>
          )}
        </div>
      )}

      {ldap && (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist">
          {(['local', 'ldap'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => {
                setTab(k)
                setError(null)
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-background shadow-xs' : 'text-muted-foreground'}`}
            >
              {t(`login.tabs.${k}`)}
            </button>
          ))}
        </div>
      )}

      {ldap && tab === 'ldap' ? (
        ldapForm
      ) : localLogin ? (
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
