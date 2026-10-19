import { useTranslation } from '@pupitre/i18n'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@pupitre/ui/components/ui/accordion'
import { Alert, AlertDescription } from '@pupitre/ui/components/ui/alert'
import { Button } from '@pupitre/ui/components/ui/button'
import { Input } from '@pupitre/ui/components/ui/input'
import { CircleAlertIcon, InfoIcon, KeyRoundIcon, MailIcon, UserPlusIcon } from 'lucide-react'
import { landingPath, type Role } from '@pupitre/shared'
import { type FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { signInWithIdentifier, useSession } from './auth-client.ts'
import { AuthCard } from './AuthCard.tsx'
import { useGoTo } from './navigation.ts'
import { RegisterForm } from './RegisterForm.tsx'
import { type SsoProviderInfo, usePublicSettings, useSsoProviders } from './settings.ts'

const SSO_ERRORS = ['access_denied', 'state', 'conflict', 'inactive', 'no_email', 'unknown_provider', 'failed'] as const

const INVALID_CREDENTIALS = new Set(['INVALID_EMAIL_OR_PASSWORD', 'INVALID_USERNAME_OR_PASSWORD'])

/** The ways in, one accordion section each. */
type Section = 'sso' | 'email' | 'register'
const SECTION_ICONS = { sso: KeyRoundIcon, email: MailIcon, register: UserPlusIcon } as const

type ErrorKey = 'emptyFields' | 'invalidCredentials' | 'localLoginDisabled' | 'tooManyRequests' | 'generic'

/** A known account the login page can sign in with in one click (dev only, see `demoAccounts`). */
export type DemoAccount = { name: string; role: Role; identifier: string; password: string }

/**
 * Spec 023, shared by every frontend. One accordion section per way in, one open at a time: "Connexion SSO" (the
 * providers' buttons and the LDAP form, specs 027–030), "Se connecter avec un e-mail" (identifier or e-mail and
 * password) and "Créer un compte avec un e-mail" (spec 021, while registration is open). With local login disabled
 * (spec 024) the e-mail section is "Connexion administrateur" and registration is hidden. The open section is
 * `section` (`/register`), else SSO after an SSO error or when it is the only way in, else e-mail. `redirect` and
 * landing paths are origin-absolute (spec 025).
 *
 * `demoAccounts` adds one-click sign-in buttons under the sections (spec 015); `ssoDemoAccounts` adds some to the SSO
 * section, signed in through the first provider the API allows it for (`demoLogin`, the Keycloak demo of spec 027).
 * Only pass them in dev (`import.meta.env.DEV`), so the credentials are not in production bundles.
 */
export function LoginPage({
  demoAccounts,
  ssoDemoAccounts,
  section,
}: { demoAccounts?: readonly DemoAccount[]; ssoDemoAccounts?: readonly DemoAccount[]; section?: Section } = {}) {
  const { t } = useTranslation(['auth', 'common'])
  const goTo = useGoTo()
  const [params] = useSearchParams()
  const { data: session, isPending: sessionPending } = useSession()
  const settings = usePublicSettings()
  const ssoProviders = useSsoProviders()
  const ssoError = params.get('sso_error')
  // Kept as a key or a raw API message so the banner follows language changes.
  const [error, setError] = useState<{ key: ErrorKey } | { message: string } | null>(null)
  const [pending, setPending] = useState(false)
  // `null` until the visitor picks one: the default depends on the settings, not loaded yet.
  const [picked, setPicked] = useState<Section | '' | null>(section ?? null)

  const redirect = params.get('redirect')

  const signedInRole = session?.user.role as Role | undefined
  useEffect(() => {
    if (signedInRole) goTo(landingPath(signedInRole, redirect), { replace: true })
  }, [signedInRole, redirect, goTo])

  if (sessionPending || session || settings === undefined) return null
  const localLogin = settings?.sso_local_login_enabled ?? true
  const ldap = settings?.ldap_enabled ?? false
  const ssoAvailable = ssoProviders.length > 0 || ldap
  const demoProvider = ssoDemoAccounts?.length ? ssoProviders.find((p) => p.demoLogin) : undefined
  const openSection = picked ?? (ssoAvailable && (ssoError || !localLogin) ? 'sso' : 'email')

  // Spec 030: the LDAP form signs in through the API, which sets the session cookie.
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
    <form onSubmit={onLdapSubmit} noValidate className="flex flex-col gap-3" aria-labelledby="ldap-title">
      <h3 id="ldap-title" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t('login.ldapTitle')}
      </h3>
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
    await signIn(String(form.get('identifier') ?? '').trim(), String(form.get('password') ?? ''))
  }

  async function signIn(identifier: string, password: string) {
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

  // Spec 027, SSO demo: the API signs in with the provider's password grant and sets the session cookie.
  async function ssoSignInAs(provider: SsoProviderInfo, account: DemoAccount) {
    setError(null)
    setPending(true)
    const res = await fetch(`/api/sso/${provider.id}/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: account.identifier, password: account.password }),
    }).catch(() => null)
    setPending(false)
    const body = (await res?.json().catch(() => ({}))) as { role?: Role; error?: string } | undefined
    if (!res?.ok) {
      if (res?.status === 401) return setError({ key: 'invalidCredentials' })
      if (res?.status === 429) return setError({ key: 'tooManyRequests' })
      if (res?.status === 502) return setError({ message: t('login.demo.ssoUnreachable', { name: provider.name }) })
      return setError(body?.error ? { message: body.error } : { key: 'generic' })
    }
    // Full page load: the session is a cookie the client store has not seen yet.
    window.location.assign(landingPath(body?.role, redirect))
  }

  // A demo sign-in goes through the same path as a manual one, whichever section is open.
  function signInAs(account: DemoAccount) {
    setPicked('email')
    void signIn(account.identifier, account.password)
  }

  const form = (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
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

  // The sections offered: SSO (providers and LDAP), e-mail sign-in, registration (spec 021).
  const sections: Section[] = [
    ...(ssoProviders.length > 0 || ldap ? (['sso'] as const) : []),
    'email',
    ...(localLogin && settings?.registration_enabled ? (['register'] as const) : []),
  ]
  const open = sections.includes(openSection as Section) ? openSection : ''

  return (
    <AuthCard>
      {!localLogin && (
        <Alert>
          <InfoIcon />
          <AlertDescription>{t('login.localDisabled')}</AlertDescription>
        </Alert>
      )}

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

      <Accordion
        type="single"
        collapsible
        value={open}
        onValueChange={(value) => {
          setPicked(value as Section | '')
          setError(null)
        }}
        className="flex flex-col gap-2"
      >
        {sections.map((value) => {
          const Icon = SECTION_ICONS[value]
          return (
            <AccordionItem key={value} value={value} className="rounded-lg border bg-card px-4 last:border-b">
              <AccordionTrigger className="items-center hover:no-underline">
                <span className="flex items-center gap-3">
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">
                      {value === 'email' && !localLogin ? t('login.adminLogin') : t(`login.sections.${value}`)}
                    </span>
                    {value === 'sso' && ssoProviders.length > 0 && (
                      <span className="text-xs font-normal text-muted-foreground">{ssoProviders.map((p) => p.name).join(' · ')}</span>
                    )}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-3">
                {value === 'sso' && (
                  <>
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
                      </div>
                    )}
                    {ssoProviders.length > 0 && ldap && (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
                        <span className="h-px flex-1 bg-border" />
                        {t('login.or')}
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    {ldap && ldapForm}
                    {demoProvider && ssoDemoAccounts && (
                      <DemoButtons
                        id="sso-demo-accounts"
                        title={t('login.demo.ssoTitle', { name: demoProvider.name })}
                        accounts={ssoDemoAccounts}
                        disabled={pending}
                        onPick={(account) => void ssoSignInAs(demoProvider, account)}
                      />
                    )}
                  </>
                )}
                {value === 'email' && form}
                {value === 'register' && <RegisterForm redirect={redirect} />}
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>

      {demoAccounts && demoAccounts.length > 0 && (
        <DemoButtons id="demo-accounts" title={t('login.demo.title')} accounts={demoAccounts} disabled={pending} onPick={signInAs} />
      )}
    </AuthCard>
  )
}

/** One-click sign-in buttons for known demo accounts (dev only). */
function DemoButtons(props: { id: string; title: string; accounts: readonly DemoAccount[]; disabled: boolean; onPick: (a: DemoAccount) => void }) {
  const { t } = useTranslation(['auth', 'common'])
  return (
    <section aria-labelledby={props.id} className="flex flex-col gap-2 border-t pt-4">
      <h2 id={props.id} className="text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {props.title}
      </h2>
      {props.accounts.map((account) => (
        <Button
          key={account.identifier}
          type="button"
          variant="outline"
          disabled={props.disabled}
          onClick={() => props.onPick(account)}
          aria-label={t('login.demo.signInAs', { name: account.name })}
          className="h-11 justify-between"
        >
          <span className="font-medium">{account.name}</span>
          <span className="text-muted-foreground">{t(`common:roles.${account.role}`)}</span>
        </Button>
      ))}
    </section>
  )
}
