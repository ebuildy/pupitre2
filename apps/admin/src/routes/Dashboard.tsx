import { useTranslation } from '@pupitre/i18n'
import { PageHeader } from '@pupitre/ui'
import { Card, CardDescription, CardHeader, CardTitle } from '@pupitre/ui/components/ui/card'
import { BookOpenIcon, FolderTreeIcon, UsersIcon } from 'lucide-react'
import { Link } from 'react-router'

/** Admin home: shortcuts to the sections (the real dashboard, spec 160, comes later). */
export function Dashboard() {
  const { t } = useTranslation('admin')
  const shortcuts = [
    { to: '/courses', title: t('nav.courses'), hint: t('dashboard.coursesHint'), icon: BookOpenIcon },
    { to: '/categories', title: t('nav.categories'), hint: t('dashboard.categoriesHint'), icon: FolderTreeIcon },
    { to: '/users', title: t('nav.users'), hint: t('dashboard.usersHint'), icon: UsersIcon },
  ]
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('dashboard.title')} />
      <div className="grid gap-4 sm:grid-cols-3">
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
