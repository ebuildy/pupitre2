import { signOutTo, useSession } from '@pupitre/auth-ui'
import logo from '@pupitre/auth-ui/pioupitre.png'
import { LanguageSwitcher, useTranslation } from '@pupitre/i18n'
import { NavLink, Outlet } from 'react-router'

// Admin shell (spec 011): left sidebar "Administration". Sections are added with their features.
const sections = [{ to: '/', label: 'nav.dashboard', end: true }] as const

export function AdminLayout() {
  const { t } = useTranslation(['admin', 'common'])
  const { data: session } = useSession()

  return (
    <div className="flex min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-6 flex items-center gap-2 font-semibold">
          <img src={logo} alt="" className="h-7 w-7 object-contain" />
          {t('title')}
        </div>
        <nav className="flex flex-col gap-1">
          {sections.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) =>
                `rounded px-3 py-2 text-sm ${isActive ? 'bg-zinc-100 font-semibold dark:bg-zinc-800' : ''}`
              }
            >
              {t(s.label)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 text-sm">
          {/* The learner app is another frontend: plain link, full page load. */}
          <a href="/courses" className="underline">
            {t('common:backToCatalogue')}
          </a>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <LanguageSwitcher />
          <span data-testid="current-user">{session?.user.username ?? session?.user.name}</span>
          <button
            type="button"
            className="rounded border px-2 py-1 text-sm"
            onClick={() => signOutTo('/admin/login')}
          >
            {t('common:logout')}
          </button>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
