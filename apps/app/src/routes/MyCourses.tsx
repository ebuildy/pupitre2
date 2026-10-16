import { useTranslation } from '@pupitre/i18n'
import { EmptyState, ErrorState, LoadingState, PageHeader, sortByTitle, StatusBadge, unwrap } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { Input } from '@pupitre/ui/components/ui/input'
import { SearchIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { CourseCard } from '../components/CourseCard.tsx'
import { api } from '../lib/api.ts'

/** Spec 052 (without progress stats yet). */
export function MyCourses() {
  const { t } = useTranslation(['app', 'common'])
  const [filter, setFilter] = useState('')

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['my-courses'],
    queryFn: () => unwrap(api.api.my.courses.$get()),
  })

  const term = filter.trim().toLocaleLowerCase()
  const courses = sortByTitle(data?.courses ?? []).filter(
    (c) => !term || `${c.title} ${c.description ?? ''}`.toLocaleLowerCase().includes(term),
  )

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
                        <Button asChild variant="link" size="sm" className="h-auto px-0">
                          <Link to={`/courses/${course.slug}`}>{t('myCourses.details')}</Link>
                        </Button>
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
