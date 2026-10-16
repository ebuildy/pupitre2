import { signOutTo, useSession } from '@pupitre/auth-ui'
import logo from '@pupitre/auth-ui/pioupitre.png'
import { LanguageSwitcher, useTranslation } from '@pupitre/i18n'
import { Link, Outlet } from 'react-router'

export function Layout() {
  const { t } = useTranslation()
  const { data: session, isPending } = useSession()

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <Link to="/courses" className="flex items-center gap-2 font-semibold">
          <img src={logo} alt="" className="h-7 w-7 object-contain" />
          pupitre
        </Link>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {!isPending &&
            (session ? (
              <>
                <span data-testid="current-user">{session.user.username ?? session.user.name}</span>
                {session.user.role === 'admin' && (
                  // The admin app is another frontend: plain link, full page load.
                  <a href="/admin/" className="rounded border px-2 py-1 text-sm">
                    {t('adminButton')}
                  </a>
                )}
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-sm"
                  onClick={() => signOutTo('/login')}
                >
                  {t('logout')}
                </button>
              </>
            ) : (
              <Link to="/login" className="text-sm underline">
                {t('signIn')}
              </Link>
            ))}
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Outlet />
      </main>
    </div>
  )
}
