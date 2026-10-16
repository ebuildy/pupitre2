import { LanguageSwitcher, useTranslation } from '@pupitre/i18n'
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

  const input =
    'h-11 w-full rounded-lg border border-zinc-300 bg-transparent px-3 outline-none focus:border-blue-500 dark:border-zinc-700'

  return (
    <div className="flex min-h-screen items-start justify-center bg-zinc-100 px-4 py-10 text-zinc-900 sm:items-center dark:bg-zinc-950 dark:text-zinc-100">
      <div className="flex w-full max-w-[430px] flex-col gap-5 rounded-2xl border border-zinc-200 bg-white px-5 pt-7 pb-6 shadow-lg sm:px-9 sm:pt-9 sm:pb-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-center gap-3">
          <img src={logo} alt="" className="h-12 w-12 object-contain" />
          <span className="text-3xl font-bold">pupitre</span>
        </div>
        <LanguageSwitcher className="self-center" />

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-500 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {'key' in error ? t(`login.errors.${error.key}`) : error.message}
          </div>
        )}

        <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          <input
            name="identifier"
            placeholder={t('login.identifierPlaceholder')}
            aria-label={t('login.identifierLabel')}
            autoComplete="username"
            className={input}
          />
          <input
            name="password"
            type="password"
            placeholder={t('login.passwordPlaceholder')}
            aria-label={t('login.passwordLabel')}
            autoComplete="current-password"
            className={input}
          />
          <button
            type="submit"
            disabled={pending}
            className="h-11 rounded-lg bg-blue-600 font-semibold text-white disabled:opacity-60"
          >
            {pending ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        {demoAccounts && demoAccounts.length > 0 && (
          <section aria-labelledby="demo-accounts" className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h2 id="demo-accounts" className="text-center text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              {t('login.demo.title')}
            </h2>
            {demoAccounts.map((account) => (
              <button
                key={account.identifier}
                type="button"
                disabled={pending}
                onClick={() => signInAs(account)}
                aria-label={t('login.demo.signInAs', { name: account.name })}
                className="flex h-11 items-center justify-between rounded-lg border border-zinc-300 px-3 text-sm hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <span className="font-medium">{account.name}</span>
                <span className="text-zinc-500">{t(`common:roles.${account.role}`)}</span>
              </button>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
