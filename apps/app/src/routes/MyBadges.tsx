import { useTranslation } from '@pupitre/i18n'
import { ErrorState, LoadingState, PageHeader, unwrap } from '@pupitre/ui'
import { Card } from '@pupitre/ui/components/ui/card'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../lib/api.ts'

/** Spec 107: stats, earned badges (with rarity), badges still to unlock. */
export function MyBadges() {
  const { t } = useTranslation('app')
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['my-badges'],
    queryFn: () => unwrap(api.api.my.badges.$get()),
  })
  if (isPending) return <LoadingState label={t('myBadges.loading')} />
  if (isError) return <ErrorState message={error.message} />

  const total = data.earned.length + data.locked.length
  const percent = total ? Math.round((data.earned.length / total) * 100) : 0
  const stats = [
    { value: data.earned.length, label: t('myBadges.stats.earned', { count: data.earned.length }) },
    { value: data.locked.length, label: t('myBadges.stats.locked', { count: data.locked.length }) },
    { value: percent, label: t('myBadges.stats.percent') },
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('myBadges.title')} />
      <dl className="grid grid-cols-3 gap-3" data-testid="badge-stats">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col-reverse rounded-xl border bg-card p-4 text-center shadow-xs">
            <dt className="text-sm text-muted-foreground">{s.label}</dt>
            <dd className="text-3xl font-bold">{s.value}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('myBadges.earnedTitle')}</h2>
        {data.earned.length === 0 ? (
          <p className="text-muted-foreground">{t('myBadges.empty')}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('myBadges.earnedTitle')}>
            {data.earned.map((b, i) => (
              <li key={i}>
                <Card className="flex-row items-center gap-4 p-4">
                  <span className="text-4xl" aria-hidden="true">
                    {b.icon}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="font-semibold">{b.name}</span>
                    {b.course ? (
                      <Link to={`/courses/${b.course.slug}`} className="truncate text-sm text-primary hover:underline">
                        {b.course.title}
                      </Link>
                    ) : (
                      <span className="truncate text-sm text-muted-foreground">{b.courseTitle}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {t('myBadges.earnedOn', { date: new Date(b.earnedAt) })} · {t('myBadges.rarity', { count: b.earnedBy })}
                    </span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.locked.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('myBadges.lockedTitle')}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('myBadges.lockedTitle')}>
            {data.locked.map((b) => (
              <li key={b.course.slug}>
                <Link to={`/courses/${b.course.slug}`} className="block">
                  <Card className="flex-row items-center gap-4 p-4 opacity-70 transition-opacity hover:opacity-100">
                    <span className="text-4xl grayscale" aria-hidden="true">
                      {b.icon}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-semibold">{b.name}</span>
                      <span className="truncate text-sm">{b.course.title}</span>
                      <span className="text-xs text-muted-foreground">{t('myBadges.notEarned')}</span>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
