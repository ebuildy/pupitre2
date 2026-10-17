import { signOutTo, useSession } from '@pupitre/auth-ui'
import logo from '@pupitre/auth-ui/pioupitre.png'
import { useTranslation } from '@pupitre/i18n'
import { cn, LanguageSwitcher, ThemeToggle, UserAvatar } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@pupitre/ui/components/ui/sheet'
import {
  AwardIcon,
  BookOpenIcon,
  BriefcaseIcon,
  GraduationCapIcon,
  LogOutIcon,
  MapIcon,
  MenuIcon,
  SettingsIcon,
  TargetIcon,
  TrophyIcon,
  UsersRoundIcon,
  ZapIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { useManagerScope } from '../lib/manager.ts'

/** Spec 011: top bar (links, language, theme, account) and, on phones, a drawer with the same links. */
export function Layout() {
  const { t } = useTranslation(['common', 'app'])
  const { data: session, isPending } = useSession()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const scope = useManagerScope()

  const links = [
    { to: '/courses', label: t('app:nav.catalogue'), icon: BookOpenIcon, end: true },
    ...(session
      ? [
          { to: '/my-courses', label: t('app:nav.myCourses'), icon: GraduationCapIcon, end: false },
          { to: '/my-xp', label: t('app:nav.myXp'), icon: ZapIcon, end: false },
          { to: '/my-paths', label: t('app:nav.myPaths'), icon: MapIcon, end: false },
          { to: '/my-badges', label: t('app:nav.myBadges'), icon: AwardIcon, end: false },
          { to: '/my-skills', label: t('app:nav.mySkills'), icon: TargetIcon, end: false },
          { to: '/my-groups', label: t('app:nav.myGroups'), icon: UsersRoundIcon, end: false },
        ]
      : []),
    { to: '/leaderboard', label: t('app:nav.leaderboard'), icon: TrophyIcon, end: false },
    // Spec 001: "Mon espace" for group managers.
    ...(session && scope.data?.canManage
      ? [{ to: '/manager', label: t('app:nav.managerSpace'), icon: BriefcaseIcon, end: false }]
      : []),
  ]

  const navLink = ({ isActive }: { isActive: boolean }) =>
    cn(
      'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    )

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t('menu')}>
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <img src={logo} alt="" className="h-7 w-7 object-contain" />
                  pupitre
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4" aria-label={t('mainNavigation')}>
                {links.map(({ to, label, icon: Icon, end }) => (
                  <NavLink key={to} to={to} end={end} className={navLink} onClick={() => setDrawerOpen(false)}>
                    <Icon className="size-4" />
                    {label}
                  </NavLink>
                ))}
              </nav>
              <div className="mt-auto flex items-center gap-2 p-4">
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
            </SheetContent>
          </Sheet>

          <Link to="/courses" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <img src={logo} alt="" className="h-8 w-8 object-contain" />
            pupitre
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher className="hidden sm:block" />
            <ThemeToggle className="hidden sm:inline-flex" />
            {!isPending &&
              (session ? (
                <>
                  <Link
                    to="/profile"
                    className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm font-medium hover:bg-muted"
                    aria-label={t('profile')}
                    title={t('profile')}
                  >
                    <UserAvatar
                      image={session.user.image}
                      name={session.user.displayUsername ?? session.user.username ?? session.user.name}
                    />
                    <span className="hidden md:inline" data-testid="current-user">
                      {session.user.displayUsername ?? session.user.username ?? session.user.name}
                    </span>
                  </Link>
                  {session.user.role === 'admin' && (
                    // The admin app is another frontend: plain link, full page load.
                    <Button asChild variant="outline" size="sm">
                      <a href="/admin/">
                        <SettingsIcon className="sm:hidden" />
                        <span>{t('adminButton')}</span>
                      </a>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => signOutTo('/login')}>
                    <LogOutIcon />
                    <span className="hidden sm:inline">{t('logout')}</span>
                    <span className="sr-only sm:hidden">{t('logout')}</span>
                  </Button>
                </>
              ) : (
                <Button asChild size="sm">
                  <Link to="/login">{t('signIn')}</Link>
                </Button>
              ))}
          </div>
        </div>
        {/* Second row on desktop: every section fits (spec 011). */}
        <nav className="mx-auto hidden h-11 max-w-6xl items-center gap-1 overflow-x-auto px-4 lg:flex" aria-label={t('mainNavigation')}>
          {links.map(({ to, label, end, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} className={navLink}>
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
