import { useTranslation } from '@pupitre/i18n'
import { cn, LoadingState, PageHeader } from '@pupitre/ui'
import { NavLink, Outlet } from 'react-router'
import { AccessDenied } from '@pupitre/auth-ui'
import { useManagerScope } from '../../lib/manager.ts'

/** Specs 140–142: "Mon espace" for group managers, with its own tabs. */
export function ManagerLayout() {
  const { t } = useTranslation('app')
  const scope = useManagerScope()
  if (scope.isPending) return <LoadingState label={t('manager.members.loading')} />
  if (!scope.data?.canManage) return <AccessDenied />

  const tab = ({ isActive }: { isActive: boolean }) =>
    cn(
      'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
    )
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('manager.title')} />
      <nav className="flex gap-1 border-b" aria-label={t('manager.title')}>
        <NavLink to="/manager/users" className={tab}>
          {t('manager.nav.members')}
        </NavLink>
        <NavLink to="/manager/groups" className={tab}>
          {t('manager.nav.groups')}
        </NavLink>
        <NavLink to="/manager/paths" className={tab}>
          {t('manager.nav.paths')}
        </NavLink>
      </nav>
      {scope.data.groups.length === 0 && <p className="text-muted-foreground">{t('manager.noScope')}</p>}
      <Outlet />
    </div>
  )
}
