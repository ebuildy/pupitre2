import { useTranslation } from '@pupitre/i18n'
import { ErrorState, LoadingState, unwrap, UserAvatar } from '@pupitre/ui'
import { Card, CardContent, CardHeader, CardTitle } from '@pupitre/ui/components/ui/card'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { adminApi } from '../lib/api.ts'

/** Spec 160: the platform figures, computed by the API. */
export function StatCards() {
  const { t, i18n } = useTranslation('admin')
  const { data, isPending, isError, error } = useQuery({ queryKey: ['admin-stats'], queryFn: () => unwrap(adminApi.stats.$get()) })
  if (isPending) return <LoadingState label={t('courses.loading')} rows={1} />
  if (isError) return <ErrorState message={error.message} />
  const number = (n: number) => new Intl.NumberFormat(i18n.language).format(n)
  const cards = [
    { key: 'users', value: number(data.users), hint: t('stats.activeUsers', { count: data.activeUsers }) },
    { key: 'courses', value: number(data.courses), hint: t('stats.published', { count: data.publishedCourses }) },
    { key: 'enrollments', value: number(data.enrollments) },
    { key: 'completions', value: number(data.completions) },
    { key: 'submissions', value: number(data.quizSubmissions) },
    { key: 'successRate', value: data.successRate === null ? '—' : `${new Intl.NumberFormat(i18n.language).format(data.successRate)} %` },
    { key: 'badges', value: number(data.badges) },
    { key: 'upcomingSessions', value: number(data.upcomingSessions) },
  ] as const
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="admin-stats">
      {cards.map((c) => (
        <div key={c.key} className="flex flex-col-reverse rounded-xl border bg-card p-4 shadow-xs" data-testid={`stat-${c.key}`}>
          {'hint' in c && <span className="text-xs text-muted-foreground">{c.hint}</span>}
          <dt className="text-sm text-muted-foreground">{t(`stats.${c.key}`)}</dt>
          <dd className="text-2xl font-bold">{c.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Spec 115 widget: the first learners by quiz score. */
export function TopLearners({ limit, title, linkLabel }: { limit: number; title: string; linkLabel: string }) {
  const { t } = useTranslation('admin')
  const { data } = useQuery({ queryKey: ['admin-leaderboard'], queryFn: () => unwrap(adminApi.leaderboard.$get()) })
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <Link to="/leaderboard" className="text-sm text-primary hover:underline">
          {linkLabel}
        </Link>
      </CardHeader>
      <CardContent>
        {!data || data.leaderboard.length === 0 ? (
          <p className="text-muted-foreground">{t('leaderboard.empty')}</p>
        ) : (
          <ol className="flex flex-col divide-y">
            {data.leaderboard.slice(0, limit).map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="w-8 text-sm text-muted-foreground">#{r.rank}</span>
                <UserAvatar image={r.image} name={r.username} />
                <span className="flex-1 truncate font-medium">{r.username}</span>
                <span className="font-semibold">{t('leaderboard.score', { score: r.totalScore })}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
