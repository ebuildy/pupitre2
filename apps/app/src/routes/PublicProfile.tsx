import { useTranslation } from '@pupitre/i18n'
import { ErrorState, isNotFound, LevelBadge, LoadingState, unwrap, UserAvatar } from '@pupitre/ui'
import { Card, CardContent } from '@pupitre/ui/components/ui/card'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { api } from '../lib/api.ts'

/** Spec 037: what anyone can see of a user (no e-mail). Reached from the leaderboard. */
export function PublicProfile() {
  const { t } = useTranslation(['app', 'common'])
  const { id = '' } = useParams()
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['user', id],
    queryFn: () => unwrap(api.api.users[':id'].$get({ param: { id } })),
  })
  const badges = useQuery({
    queryKey: ['user-badges', id],
    queryFn: () => unwrap(api.api.users[':id'].badges.$get({ param: { id } })),
    enabled: !!data,
  })

  return (
    <div className="flex flex-col gap-6">
      <Link to="/leaderboard" className="text-sm text-muted-foreground hover:text-foreground">
        {t('publicProfile.back')}
      </Link>
      {isPending ? (
        <LoadingState label={t('publicProfile.loading')} />
      ) : isError ? (
        <ErrorState message={isNotFound(error) ? t('publicProfile.notFound') : error.message} />
      ) : (
        <Card>
          <CardContent className="flex flex-wrap items-start gap-5">
            <UserAvatar image={data.image} name={data.username} className="size-20 text-3xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <h1 className="text-2xl font-bold">{data.username}</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <LevelBadge xp={data.xp} />
                <span className="font-semibold text-xp">{t('common:xpAmount', { amount: data.xp })}</span>
                <span className="text-muted-foreground">
                  · {t('publicProfile.completedCourses', { count: data.completedCourses })}
                </span>
              </div>
              {data.bio && <p className="whitespace-pre-line">{data.bio}</p>}
              <p className="text-sm text-muted-foreground">
                {t('publicProfile.memberSince', { date: new Date(data.memberSince) })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {data && badges.data && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('publicProfile.badgesTitle')}</h2>
          {badges.data.badges.length === 0 ? (
            <p className="text-muted-foreground">{t('publicProfile.badgesEmpty')}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2" aria-label={t('publicProfile.badgesTitle')}>
              {badges.data.badges.map((b, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs">
                  <span className="text-3xl" aria-hidden="true">
                    {b.icon}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold">{b.name}</span>
                    <span className="truncate text-sm text-muted-foreground">{b.course?.title ?? b.courseTitle}</span>
                    <span className="text-xs text-muted-foreground">{t('myBadges.earnedOn', { date: new Date(b.earnedAt) })}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
