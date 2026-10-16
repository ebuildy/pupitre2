import { useTranslation } from '@pupitre/i18n'
import { XP_LEVELS, type XpSource, xpLevel } from '@pupitre/shared'
import { EmptyState, ErrorState, LevelBadge, LoadingState, PageHeader, unwrap } from '@pupitre/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../lib/api.ts'

const SOURCE_ICONS: Record<XpSource, string> = { lesson: '📖', quiz: '🧩', course: '🎓', admin: '🛠️' }

/** Spec 105: total, level progress, level ladder, courses in progress, history. */
export function MyXp() {
  const { t, i18n } = useTranslation(['app', 'common'])
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['my-xp'],
    queryFn: () => unwrap(api.api.my.xp.$get()),
  })

  if (isPending) return <LoadingState label={t('myXp.loading')} />
  if (isError) return <ErrorState message={error.message} />

  const { current, next } = xpLevel(data.total)
  const progress = next ? (data.total - current.threshold) / (next.threshold - current.threshold) : 1

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('myXp.title')} description={t('myXp.subtitle', { count: data.total })} />

      <section className="flex flex-col gap-4 rounded-2xl border bg-gradient-to-br from-xp-soft to-card p-6 shadow-xs">
        <div className="flex flex-wrap items-end gap-3">
          <span className="text-5xl font-bold text-xp" data-testid="xp-total">
            {new Intl.NumberFormat(i18n.language).format(data.total)}
          </span>
          <span className="pb-1 text-muted-foreground">{t('myXp.totalLabel')}</span>
          <LevelBadge xp={data.total} className="mb-1.5" />
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div className="h-full rounded-full bg-xp" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="text-sm text-muted-foreground">
          {next
            ? t('myXp.toNext', {
                missing: next.threshold - data.total,
                level: next.level,
                name: t(`common:levels.${next.key}`),
              })
            : t('myXp.maxLevel')}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('myXp.ladderTitle')}</h2>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {XP_LEVELS.map((level) => {
            const active = level.level === current.level
            return (
              <li
                key={level.level}
                aria-current={active ? 'step' : undefined}
                className={`flex flex-col items-center gap-1 rounded-xl border bg-card p-3 text-center shadow-xs ${
                  active
                    ? 'border-xp bg-xp-soft'
                    : 'border-border'
                } ${data.total < level.threshold ? 'opacity-60' : ''}`}
              >
                <span className="text-2xl" aria-hidden="true">
                  {level.icon}
                </span>
                <span className="font-medium">{t(`common:levels.${level.key}`)}</span>
                <span className="text-xs text-muted-foreground">
                  {level.threshold === 0 ? t('myXp.start') : t('common:xpAmount', { amount: level.threshold })}
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      {data.inProgress.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('myXp.inProgressTitle', { count: data.inProgress.length })}</h2>
          <ul className="flex flex-col divide-y divide-border">
            {data.inProgress.map((c) => (
              <li key={c.slug} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link to={`/courses/${c.slug}`} className="font-medium hover:underline">
                  {c.title}
                </Link>
                <span className="text-sm text-xp">
                  {t('myXp.inProgressItem', { amount: c.completionXp })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('myXp.historyTitle')}</h2>
        {data.history.length === 0 ? (
          <EmptyState icon="⚡" title={t('myXp.empty')} />
        ) : (
          <ul className="flex flex-col divide-y divide-border" data-testid="xp-history">
            {data.history.map((e, i) => (
              <li key={i} className="flex items-center gap-3 py-2">
                <span className="text-xl" aria-hidden="true">
                  {SOURCE_ICONS[e.source]}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-xs text-muted-foreground">{t(`common:xpSources.${e.source}`)}</span>
                  {e.course ? (
                    <Link to={`/courses/${e.course.slug}`} className="truncate font-medium hover:underline">
                      {e.course.title}
                    </Link>
                  ) : (
                    <span className="truncate font-medium">{e.label}</span>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  {new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(new Date(e.earnedAt))}
                </span>
                <span
                  className={`w-20 text-right font-semibold ${e.amount < 0 ? 'text-destructive' : 'text-xp'}`}
                >
                  {e.amount > 0 ? '+' : ''}
                  {t('common:xpAmount', { amount: e.amount })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
