import { useTranslation } from '@pupitre/i18n'
import { CategoryLabel, DifficultyBadge, StatusBadge, unwrap, useDebouncedValue, VisibilityBadge } from '@pupitre/ui'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { adminApi } from '../../lib/api.ts'

/** Spec 165 (list), 168 (delete). */
export function CourseList() {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim(), 280)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletedTitle, setDeletedTitle] = useState<string | null>(null)

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin-courses', debouncedSearch],
    queryFn: () => unwrap(adminApi.courses.$get({ query: { search: debouncedSearch || undefined } })),
    placeholderData: keepPreviousData,
  })

  const remove = useMutation({
    mutationFn: (course: { id: string; title: string }) =>
      unwrap(adminApi.courses[':id'].$delete({ param: { id: course.id } })),
    onSuccess: async (_, course) => {
      setConfirmingId(null)
      setDeletedTitle(course.title)
      await queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
    },
  })

  const button = 'rounded border px-2 py-1 text-sm'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {t('courses.title')}
          {data && (
            <span className="ml-2 text-base font-normal text-zinc-500">{t('courses.count', { count: data.total })}</span>
          )}
        </h1>
        <Link to="/courses/new" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
          {t('courses.new')}
        </Link>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('courses.searchPlaceholder')}
        aria-label={t('courses.searchLabel')}
        className="h-10 max-w-sm rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700"
      />

      {deletedTitle && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          {t('courses.deleted', { title: deletedTitle })}
        </p>
      )}
      {remove.error && (
        <p role="alert" className="text-sm text-red-600">
          {remove.error.message}
        </p>
      )}

      {isPending ? (
        <p>{t('courses.loading')}</p>
      ) : isError ? (
        <p role="alert" className="text-red-600">
          {error.message}
        </p>
      ) : data.courses.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">{t('courses.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="py-2 pr-4 font-medium">{t('courses.columns.title')}</th>
                <th className="py-2 pr-4 font-medium">{t('courses.columns.category')}</th>
                <th className="py-2 pr-4 font-medium">{t('courses.columns.difficulty')}</th>
                <th className="py-2 pr-4 font-medium">{t('courses.columns.visibility')}</th>
                <th className="py-2 pr-4 font-medium">{t('courses.columns.status')}</th>
                <th className="py-2 pr-4 font-medium">{t('courses.columns.enrollments')}</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">{t('courses.columns.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.courses.map((course) => (
                <tr key={course.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-4">
                    <Link to={`/courses/${course.id}`} className="font-medium hover:underline">
                      {course.title}
                    </Link>
                    <div className="font-mono text-xs text-zinc-500">{course.slug}</div>
                  </td>
                  <td className="py-2 pr-4">{course.category && <CategoryLabel category={course.category} />}</td>
                  <td className="py-2 pr-4">{course.difficulty && <DifficultyBadge difficulty={course.difficulty} />}</td>
                  <td className="py-2 pr-4">
                    <VisibilityBadge visibility={course.visibility} />
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={course.status} />
                  </td>
                  <td className="py-2 pr-4">{course.enrollmentCount}</td>
                  <td className="py-2">
                    <div className="flex justify-end gap-2">
                      {confirmingId === course.id ? (
                        <>
                          <button
                            type="button"
                            className={`${button} border-red-600 bg-red-600 text-white`}
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(course)}
                          >
                            {t('courses.confirmDelete')}
                          </button>
                          <button type="button" className={button} onClick={() => setConfirmingId(null)}>
                            {t('common:cancel')}
                          </button>
                        </>
                      ) : (
                        <>
                          <Link to={`/courses/${course.id}`} className={button}>
                            {t('courses.edit')}
                          </Link>
                          <button
                            type="button"
                            className={`${button} text-red-600`}
                            onClick={() => setConfirmingId(course.id)}
                          >
                            {t('courses.delete')}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
