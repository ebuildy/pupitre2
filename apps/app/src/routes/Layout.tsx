import { signOutTo, useSession } from '@pupitre/auth-ui'
import logo from '@pupitre/auth-ui/pioupitre.png'
import { LanguageSwitcher, useTranslation } from '@pupitre/i18n'
import { Link, NavLink, Outlet } from 'react-router'

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'font-semibold text-blue-600 dark:text-blue-400' : 'hover:underline'

export function Layout() {
  const { t } = useTranslation(['common', 'app'])
  const { data: session, isPending } = useSession()

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <Link to="/courses" className="flex items-center gap-2 font-semibold">
          <img src={logo} alt="" className="h-7 w-7 object-contain" />
          pupitre
        </Link>
        {/* Spec 011 top bar links. */}
        <nav className="mr-auto flex items-center gap-4 text-sm">
          <NavLink to="/courses" end className={navClass}>
            {t('app:nav.catalogue')}
          </NavLink>
          {session && (
            <NavLink to="/my-courses" className={navClass}>
              {t('app:nav.myCourses')}
            </NavLink>
          )}
        </nav>
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
              <Link to="/login" className="text-sm whitespace-nowrap underline">
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
