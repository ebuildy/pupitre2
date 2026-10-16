import { useTranslation } from '@pupitre/i18n'
import { LanguageSwitcher, ThemeToggle } from '@pupitre/ui'
import { Alert, AlertDescription } from '@pupitre/ui/components/ui/alert'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card, CardContent } from '@pupitre/ui/components/ui/card'
import { Input } from '@pupitre/ui/components/ui/input'
import { CircleAlertIcon } from 'lucide-react'
import { landingPath, type Role } from '@pupitre/shared'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { signInWithIdentifier, useSession } from './auth-client.ts'
import { useGoTo } from './navigation.ts'
import logo from './pioupitre.png'

const INVALID_CREDENTIALS = new Set(['INVALID_EMAIL_OR_PASSWORD', 'INVALID_USERNAME_OR_PASSWORD'])

type ErrorKey = 'emptyFields' | 'invalidCredentials' | 'generic'

/** A known account the login page can sign in with in one click (dev only, see `demoAccounts`). */
export type DemoAccount = { name: string; role: Role; identifier: string; password: string }

/**
 * Spec 023, shared by every frontend (email tab only for now; SSO/LDAP tabs and the registration
 * link come with their features). `redirect` and landing paths are origin-absolute (spec 025).
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
  // Kept as a key or a raw API message so the banner follows language changes.
  const [error, setError] = useState<{ key: ErrorKey } | { message: string } | null>(null)
  const [pending, setPending] = useState(false)

  const redirect = params.get('redirect')

  const signedInRole = session?.user.role as Role | undefined
  useEffect(() => {
    if (signedInRole) goTo(landingPath(signedInRole, redirect), { replace: true })
  }, [signedInRole, redirect, goTo])

  if (sessionPending || session) return null

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

  return (
    <div className="flex min-h-screen items-start justify-center bg-gradient-to-b from-secondary to-background px-4 py-10 sm:items-center">
      <Card className="w-full max-w-[430px] gap-5 px-2 py-7 shadow-xl sm:px-4 sm:py-9">
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center justify-center gap-3">
            <img src={logo} alt="" className="h-12 w-12 object-contain" />
            <span className="text-3xl font-bold tracking-tight">pupitre</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>

          {error && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>{'key' in error ? t(`login.errors.${error.key}`) : error.message}</AlertDescription>
            </Alert>
          )}

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
        </CardContent>
      </Card>
    </div>
  )
}
