import { signOutTo, useSession } from '@pupitre/auth-ui'
import logo from '@pupitre/auth-ui/pioupitre.png'
import { useTranslation } from '@pupitre/i18n'
import { cn, LanguageSwitcher, ThemeToggle } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@pupitre/ui/components/ui/sheet'
import { ArrowLeftIcon, BookOpenIcon, FolderTreeIcon, LayoutDashboardIcon, LogOutIcon, MenuIcon, UsersIcon } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'

// Admin shell (spec 011): left sidebar "Administration". Sections are added with their features.
const sections = [
  { to: '/', label: 'nav.dashboard', end: true, icon: LayoutDashboardIcon },
  { to: '/courses', label: 'nav.courses', end: false, icon: BookOpenIcon },
  { to: '/categories', label: 'nav.categories', end: false, icon: FolderTreeIcon },
  { to: '/users', label: 'nav.users', end: false, icon: UsersIcon },
] as const

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation(['admin', 'common'])
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-2 px-2 font-semibold">
        <img src={logo} alt="" className="h-8 w-8 object-contain" />
        {t('title')}
      </div>
      <nav className="flex flex-col gap-1">
        {sections.map(({ to, label, end, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
              )
            }
          >
            <Icon className="size-4" />
            {t(label)}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2 text-sm">
        {/* The learner app is another frontend: plain link, full page load. */}
        <a href="/courses" className="flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" />
          {t('common:backToCatalogue')}
        </a>
      </div>
    </div>
  )
}

export function AdminLayout() {
  const { t } = useTranslation(['admin', 'common'])
  const { data: session } = useSession()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground md:block">
        <Sidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('common:menu')}>
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0">
              <SheetTitle className="sr-only">{t('title')}</SheetTitle>
              <Sidebar onNavigate={() => setDrawerOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <span className="hidden text-sm font-medium sm:inline" data-testid="current-user">
              {session?.user.username ?? session?.user.name}
            </span>
            <Button variant="ghost" size="sm" onClick={() => signOutTo('/admin/login')}>
              <LogOutIcon />
              {t('common:logout')}
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
