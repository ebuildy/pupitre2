import { useTranslation } from '@pupitre/i18n'
import { EmptyState, ErrorState, LoadingState, unwrap, UserAvatar } from '@pupitre/ui'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pupitre/ui/components/ui/card'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../lib/api.ts'

/** Spec 136: one card per group (not the default one): courses of the group, members. A section of the profile page. */
export function MyGroups() {
  const { t } = useTranslation(['app', 'common'])
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['my-groups'],
    queryFn: () => unwrap(api.api.my.groups.$get()),
  })

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{t('myGroups.subtitle')}</p>
      {isPending ? (
        <LoadingState label={t('myGroups.loading')} />
      ) : isError ? (
        <ErrorState message={error.message} />
      ) : data.groups.length === 0 ? (
        <EmptyState icon="👥" title={t('myGroups.empty')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.groups.map((g) => (
            <Card key={g.id} data-testid={`my-group-${g.name}`}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <h2>{g.name}</h2>
                  {g.role === 'manager' && <Badge variant="info">{t('common:membershipRoles.manager')}</Badge>}
                </CardTitle>
                {(g.path.length > 0 || g.description) && (
                  <CardDescription>
                    {g.path.length > 0 && <span className="block">{[...g.path, g.name].join(' › ')}</span>}
                    {g.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <section className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold">{t('myGroups.courses')}</h3>
                  {g.courses.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('myGroups.noCourses')}</p>
                  ) : (
                    <ul className="flex flex-col gap-1 text-sm">
                      {g.courses.map((c) => (
                        <li key={c.slug}>
                          <Link to={`/courses/${c.slug}`} className="text-primary hover:underline">
                            {c.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">{t('myGroups.members', { count: g.members.length })}</h3>
                  <ul className="flex flex-wrap gap-2">
                    {g.members.map((m) => (
                      <li key={m.id}>
                        <Link
                          to={`/users/${m.id}`}
                          className="flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-sm hover:bg-muted"
                        >
                          <UserAvatar image={m.image} name={m.username} className="size-6 text-xs" />
                          {m.username}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
