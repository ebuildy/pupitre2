import { useTranslation } from '@pupitre/i18n'
import { EmptyState, ErrorState, LoadingState, PageHeader, unwrap, UserAvatar } from '@pupitre/ui'
import { Card } from '@pupitre/ui/components/ui/card'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { adminApi } from '../lib/api.ts'

/** Spec 115: "Classement général", by total quiz score. */
export function Leaderboard() {
  const { t } = useTranslation('admin')
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin-leaderboard'],
    queryFn: () => unwrap(adminApi.leaderboard.$get()),
  })
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('leaderboard.title')}
        description={data ? t('leaderboard.count', { count: data.leaderboard.length }) : undefined}
      />
      {isPending ? (
        <LoadingState label={t('leaderboard.loading')} />
      ) : isError ? (
        <ErrorState message={error.message} />
      ) : data.leaderboard.length === 0 ? (
        <EmptyState icon="🏆" title={t('leaderboard.empty')} />
      ) : (
        <Card className="gap-0 py-0">
          <ol className="divide-y" aria-label={t('leaderboard.title')}>
            {data.leaderboard.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3" data-testid={`admin-rank-${r.username}`}>
                <span className="w-10 text-center font-semibold text-muted-foreground">#{r.rank}</span>
                <UserAvatar image={r.image} name={r.username} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link to={`/users/${r.id}`} className="truncate font-medium hover:underline">
                    {r.username}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {t('leaderboard.detail', { courses: r.enrolledCourses, modules: r.passedModules })}
                  </span>
                </div>
                <span className="font-semibold">{t('leaderboard.score', { score: r.totalScore })}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  )
}
