import { useSession } from '@pupitre/auth-ui'
import { useTranslation } from '@pupitre/i18n'
import { EmptyState, ErrorState, LevelBadge, LoadingState, PageHeader, unwrap } from '@pupitre/ui'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api.ts'

const MEDALS = ['🥇', '🥈', '🥉']

/** XP leaderboard (public): podium for ranks 1–3, then a list; the signed-in user's own position. */
export function Leaderboard() {
  const { t } = useTranslation(['app', 'common'])
  const { data: session } = useSession()
  const { data, isPending, isError, error } = useQuery({
    // The response includes the viewer's own rank.
    queryKey: ['leaderboard', session?.user.id ?? null],
    queryFn: () => unwrap(api.api.leaderboard.$get()),
  })

  const self = session?.user.username ?? null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('leaderboard.title')} description={t('leaderboard.subtitle')} />

      {session && data && (
        <p className="rounded-lg bg-xp-soft px-3 py-2 text-sm" data-testid="my-rank">
          {data.me ? t('leaderboard.yourRank', { rank: data.me.rank, xp: data.me.xp }) : t('leaderboard.notRanked')}
        </p>
      )}

      {isPending ? (
        <LoadingState label={t('leaderboard.loading')} />
      ) : isError ? (
        <ErrorState message={error.message} />
      ) : data.leaderboard.length === 0 ? (
        <EmptyState icon="🏆" title={t('leaderboard.empty')} />
      ) : (
        <ol className="flex flex-col gap-2" aria-label={t('leaderboard.title')}>
          {data.leaderboard.map((entry) => {
            const podium = entry.rank <= 3
            const mine = entry.username === self
            return (
              <li
                key={entry.username}
                aria-current={mine ? 'true' : undefined}
                className={`flex items-center gap-3 rounded-xl border bg-card px-4 shadow-xs ${podium ? 'py-3' : 'py-2'} ${
                  mine ? 'border-xp bg-xp-soft' : 'border-border'
                }`}
              >
                <span className={`w-10 text-center font-semibold ${podium ? 'text-2xl' : 'text-muted-foreground'}`}>
                  {podium ? MEDALS[entry.rank - 1] : `#${entry.rank}`}
                </span>
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground uppercase"
                  aria-hidden="true"
                >
                  {entry.image ? <img src={entry.image} alt="" className="h-9 w-9 rounded-full" /> : entry.username[0]}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{entry.username}</span>
                <LevelBadge xp={entry.xp} className="hidden sm:inline-flex" />
                <span className="w-24 text-right font-semibold text-xp">
                  {t('common:xpAmount', { amount: entry.xp })}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
