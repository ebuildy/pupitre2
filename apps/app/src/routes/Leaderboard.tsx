import { useSession } from '@pupitre/auth-ui'
import { useTranslation } from '@pupitre/i18n'
import { LevelBadge, unwrap } from '@pupitre/ui'
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
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('leaderboard.title')}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{t('leaderboard.subtitle')}</p>
      </header>

      {session && data && (
        <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm dark:bg-violet-950" data-testid="my-rank">
          {data.me ? t('leaderboard.yourRank', { rank: data.me.rank, xp: data.me.xp }) : t('leaderboard.notRanked')}
        </p>
      )}

      {isPending ? (
        <p className="text-zinc-600 dark:text-zinc-400">{t('leaderboard.loading')}</p>
      ) : isError ? (
        <p role="alert" className="text-red-600">
          {error.message}
        </p>
      ) : data.leaderboard.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">{t('leaderboard.empty')}</p>
      ) : (
        <ol className="flex flex-col gap-2" aria-label={t('leaderboard.title')}>
          {data.leaderboard.map((entry) => {
            const podium = entry.rank <= 3
            const mine = entry.username === self
            return (
              <li
                key={entry.username}
                aria-current={mine ? 'true' : undefined}
                className={`flex items-center gap-3 rounded-xl border px-4 ${podium ? 'py-3' : 'py-2'} ${
                  mine ? 'border-violet-600 bg-violet-50 dark:bg-violet-950' : 'border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <span className={`w-10 text-center font-semibold ${podium ? 'text-2xl' : 'text-zinc-500'}`}>
                  {podium ? MEDALS[entry.rank - 1] : `#${entry.rank}`}
                </span>
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 font-semibold uppercase dark:bg-zinc-800"
                  aria-hidden="true"
                >
                  {entry.image ? <img src={entry.image} alt="" className="h-9 w-9 rounded-full" /> : entry.username[0]}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{entry.username}</span>
                <LevelBadge xp={entry.xp} className="hidden sm:inline-flex" />
                <span className="w-24 text-right font-semibold text-violet-700 dark:text-violet-300">
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
