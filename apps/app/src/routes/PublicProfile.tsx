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
    </div>
  )
}
