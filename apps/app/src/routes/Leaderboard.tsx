import { useSession } from '@pupitre/auth-ui'
import { useTranslation } from '@pupitre/i18n'
import { EmptyState, ErrorState, LevelBadge, LoadingState, PageHeader, unwrap, UserAvatar } from '@pupitre/ui'
import { Link } from 'react-router'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pupitre/ui/components/ui/tabs'
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

  const self = session?.user.id ?? null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('leaderboard.title')} description={t('leaderboard.subtitle')} />

      {session && data && (
        <p className="rounded-lg bg-xp-soft px-3 py-2 text-sm" data-testid="my-rank">
          {data.me ? t('leaderboard.yourRank', { rank: data.me.rank, xp: data.me.xp }) : t('leaderboard.notRanked')}
        </p>
      )}

      <Tabs defaultValue="xp">
        <TabsList>
          <TabsTrigger value="xp">{t('leaderboard.tabs.xp')}</TabsTrigger>
          <TabsTrigger value="badges">{t('leaderboard.tabs.badges')}</TabsTrigger>
        </TabsList>
        <TabsContent value="badges" className="pt-4">
          <BadgeLeaderboard selfId={self} />
        </TabsContent>
        <TabsContent value="xp" className="pt-4">
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
                const mine = entry.id === self
                return (
                  <li
                    key={entry.id}
                    aria-current={mine ? 'true' : undefined}
                    className={`flex items-center gap-3 rounded-xl border bg-card px-4 shadow-xs ${podium ? 'py-3' : 'py-2'} ${
                      mine ? 'border-xp bg-xp-soft' : 'border-border'
                    }`}
                  >
                    <span className={`w-10 text-center font-semibold ${podium ? 'text-2xl' : 'text-muted-foreground'}`}>
                      {podium ? MEDALS[entry.rank - 1] : `#${entry.rank}`}
                    </span>
                    <UserAvatar image={entry.image} name={entry.username} className="size-9" />
                    {/* Spec 037: rows open the public profile. */}
                    <Link to={`/users/${entry.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                      {entry.username}
                    </Link>
                    <LevelBadge xp={entry.xp} className="hidden sm:inline-flex" />
                    <span className="w-24 text-right font-semibold text-xp">
                      {t('common:xpAmount', { amount: entry.xp })}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Spec 108: ranked by number of badges, with their icons. */
function BadgeLeaderboard({ selfId }: { selfId: string | null }) {
  const { t } = useTranslation('app')
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['leaderboard-badges'],
    queryFn: () => unwrap(api.api.leaderboard.badges.$get()),
  })
  if (isPending) return <LoadingState label={t('leaderboard.loading')} />
  if (isError) return <ErrorState message={error.message} />
  if (data.leaderboard.length === 0) return <EmptyState icon="🏅" title={t('leaderboard.badgesEmpty')} />
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('leaderboard.badgesSubtitle')}</p>
      <ol className="flex flex-col gap-2" aria-label={t('leaderboard.tabs.badges')}>
        {data.leaderboard.map((entry) => {
          const podium = entry.rank <= 3
          return (
            <li
              key={entry.id}
              aria-current={entry.id === selfId ? 'true' : undefined}
              className={`flex items-center gap-3 rounded-xl border bg-card px-4 shadow-xs ${podium ? 'py-3' : 'py-2'} ${
                entry.id === selfId ? 'border-xp bg-xp-soft' : 'border-border'
              }`}
            >
              <span className={`w-10 text-center font-semibold ${podium ? 'text-2xl' : 'text-muted-foreground'}`}>
                {podium ? MEDALS[entry.rank - 1] : `#${entry.rank}`}
              </span>
              <UserAvatar image={entry.image} name={entry.username} className="size-9" />
              <Link to={`/users/${entry.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                {entry.username}
              </Link>
              <span className="hidden truncate sm:inline" aria-hidden="true">
                {entry.icons.join(' ')}
              </span>
              <span className="w-24 text-right font-semibold">{t('leaderboard.badgeCount', { count: entry.count })}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
