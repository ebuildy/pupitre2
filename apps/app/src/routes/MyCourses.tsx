import { useTranslation } from '@pupitre/i18n'
import { sortByTitle, StatusBadge, unwrap } from '@pupitre/ui'
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('myCourses.title')}</h1>
        <Link to="/courses" className="text-sm underline">
          {t('myCourses.browse')}
        </Link>
      </div>

      {isPending ? (
        <p className="text-zinc-600 dark:text-zinc-400">{t('myCourses.loading')}</p>
      ) : isError ? (
        <p role="alert" className="text-red-600">
          {error.message}
        </p>
      ) : data.courses.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="font-semibold">{t('myCourses.emptyTitle')}</p>
          <Link to="/courses" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">
            {t('myCourses.emptyCta')}
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('myCourses.filterPlaceholder')}
              aria-label={t('myCourses.filterLabel')}
              className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 sm:max-w-sm dark:border-zinc-700"
            />
            <span className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
              {t('myCourses.count', { count: courses.length })}
            </span>
          </div>
          {courses.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">{t('myCourses.filteredEmpty')}</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <li key={course.slug}>
                  <CourseCard
                    course={course}
                    footer={
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {course.completedAt
                            ? `✓ ${t('myCourses.completedOn', { date: new Date(course.completedAt) })}`
                            : t('common:enrolledOn', { date: new Date(course.enrolledAt) })}
                        </span>
                        {course.status === 'archived' && <StatusBadge status="archived" />}
                        <Link to={`/courses/${course.slug}`} className="underline">
                          {t('myCourses.details')}
                        </Link>
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
