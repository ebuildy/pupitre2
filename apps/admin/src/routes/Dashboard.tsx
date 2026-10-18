import { useTranslation } from '@pupitre/i18n'
import { PageHeader } from '@pupitre/ui'
import { Card, CardDescription, CardHeader, CardTitle } from '@pupitre/ui/components/ui/card'
import { ActivityIcon, BookOpenIcon, FileDownIcon, MapIcon, PuzzleIcon, FolderTreeIcon, SettingsIcon, TrophyIcon, UsersIcon, UsersRoundIcon } from 'lucide-react'
import { Link } from 'react-router'
import { StatCards, TopLearners } from '../components/StatCards.tsx'

/** Spec 160: figures, top learners, and shortcuts to the sections. */
export function Dashboard() {
  const { t } = useTranslation('admin')
  const shortcuts = [
    { to: '/courses', title: t('nav.courses'), hint: t('dashboard.coursesHint'), icon: BookOpenIcon },
    { to: '/paths', title: t('nav.paths'), hint: t('dashboard.pathsHint'), icon: MapIcon },
    { to: '/patterns', title: t('nav.patterns'), hint: t('dashboard.patternsHint'), icon: PuzzleIcon },
    { to: '/categories', title: t('nav.categories'), hint: t('dashboard.categoriesHint'), icon: FolderTreeIcon },
    { to: '/groups', title: t('nav.groups'), hint: t('dashboard.groupsHint'), icon: UsersRoundIcon },
    { to: '/users', title: t('nav.users'), hint: t('dashboard.usersHint'), icon: UsersIcon },
    { to: '/leaderboard', title: t('nav.leaderboard'), hint: t('dashboard.leaderboardHint'), icon: TrophyIcon },
    { to: '/monitoring', title: t('nav.monitoring'), hint: t('dashboard.monitoringHint'), icon: ActivityIcon },
    { to: '/exports', title: t('nav.exports'), hint: t('dashboard.exportsHint'), icon: FileDownIcon },
    { to: '/settings', title: t('nav.settings'), hint: t('dashboard.settingsHint'), icon: SettingsIcon },
  ]
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('dashboard.title')} />
      <StatCards />
      <TopLearners limit={5} title={t('stats.leaderboard')} linkLabel={t('stats.seeAll')} />
      <h2 className="text-lg font-semibold">{t('stats.shortcuts')}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts.map(({ to, title, hint, icon: Icon }) => (
          <Link key={to} to={to} className="group">
            <Card className="transition-shadow group-hover:shadow-md">
              <CardHeader>
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <CardTitle>{title}</CardTitle>
                <CardDescription>{hint}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
