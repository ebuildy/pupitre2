import { useTranslation } from '@pupitre/i18n'
import { EmptyState, ErrorState, LoadingState, PageHeader, sortByTitle, StatusBadge, unwrap } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { Input } from '@pupitre/ui/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { SearchIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { CourseCard } from '../components/CourseCard.tsx'
import { api } from '../lib/api.ts'

type StatusFilter = 'all' | 'notStarted' | 'inProgress' | 'completed'

function statusOf(c: { completed: boolean; progress: { done: number } | null }): Exclude<StatusFilter, 'all'> {
  if (c.completed) return 'completed'
  return c.progress && c.progress.done > 0 ? 'inProgress' : 'notStarted'
}

/** Spec 052: stats, text and status filters, cards with progress and "Commencer / Continuer / Revoir". */
export function MyCourses() {
  const { t } = useTranslation(['app', 'common'])
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['my-courses'],
    queryFn: () => unwrap(api.api.my.courses.$get()),
  })

  const term = filter.trim().toLocaleLowerCase()
  const all = data?.courses ?? []
  const courses = sortByTitle(all).filter(
    (c) =>
      (!term || `${c.title} ${c.description ?? ''}`.toLocaleLowerCase().includes(term)) &&
      (status === 'all' || statusOf(c) === status),
  )
  const modulesDone = all.reduce((n, c) => n + (c.progress?.done ?? 0), 0)
  const modulesTotal = all.reduce((n, c) => n + (c.progress?.total ?? 0), 0)
  const stats = [
    { key: 'enrolled', value: String(all.length) },
    { key: 'completed', value: String(all.filter((c) => c.completed).length) },
    { key: 'modules', value: String(modulesDone) },
    { key: 'progress', value: `${modulesTotal ? Math.round((modulesDone / modulesTotal) * 100) : 0} %` },
  ] as const

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('myCourses.title')}
        actions={
          <Button asChild variant="outline">
            <Link to="/courses">{t('myCourses.browse')}</Link>
          </Button>
        }
      />

      {isPending ? (
        <LoadingState label={t('myCourses.loading')} />
      ) : isError ? (
        <ErrorState message={error.message} />
      ) : data.courses.length === 0 ? (
        <EmptyState
          icon="🎓"
          title={t('myCourses.emptyTitle')}
          action={
            <Button asChild>
              <Link to="/courses">{t('myCourses.emptyCta')}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="my-courses-stats">
            {stats.map(({ key, value }) => (
              <div key={key} className="flex flex-col-reverse rounded-xl border bg-card p-4 shadow-xs">
                <dt className="text-sm text-muted-foreground">{t(`myCourses.stats.${key}`)}</dt>
                <dd className="text-2xl font-bold">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-auto sm:min-w-0 sm:flex-1 sm:max-w-sm">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t('myCourses.filterPlaceholder')}
                aria-label={t('myCourses.filterLabel')}
                className="h-10 pl-9"
              />
            </div>
            <NativeSelect
              aria-label={t('myCourses.statusLabel')}
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="h-10"
            >
              {(['all', 'notStarted', 'inProgress', 'completed'] as const).map((s) => (
                <NativeSelectOption key={s} value={s}>
                  {t(`myCourses.statuses.${s}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <span className="text-sm text-muted-foreground" role="status">
              {t('myCourses.count', { count: courses.length })}
            </span>
          </div>
          {courses.length === 0 ? (
            <EmptyState title={t('myCourses.filteredEmpty')} />
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <li key={course.slug}>
                  <CourseCard
                    course={course}
                    footer={
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
                        <span className="text-muted-foreground">
                          {course.completedAt
                            ? `✓ ${t('myCourses.completedOn', { date: new Date(course.completedAt) })}`
                            : t('common:enrolledOn', { date: new Date(course.enrolledAt) })}
                        </span>
                        {course.status === 'archived' && <StatusBadge status="archived" />}
                        <span className="flex items-center gap-3">
                          <Button asChild variant="link" size="sm" className="h-auto px-0">
                            <Link to={`/courses/${course.slug}`}>{t('myCourses.details')}</Link>
                          </Button>
                          {course.moduleCount > 0 && (
                            <Button asChild size="sm">
                              <Link to={`/courses/${course.slug}`}>
                                {t(
                                  `myCourses.${
                                    { notStarted: 'start', inProgress: 'continue', completed: 'review' }[statusOf(course)] as
                                      | 'start'
                                      | 'continue'
                                      | 'review'
                                  }`,
                                )}
                              </Link>
                            </Button>
                          )}
                        </span>
                      </div>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
