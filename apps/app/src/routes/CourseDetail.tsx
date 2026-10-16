import { useGoTo, useSession } from '@pupitre/auth-ui'
import { useTranslation } from '@pupitre/i18n'
import { CategoryLabel, categoryIcon, DifficultyBadge, isNotFound, unwrap } from '@pupitre/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../lib/api.ts'

/** Spec 045 (enrollment area; modules come with their feature). */
export function CourseDetail() {
  const { slug = '' } = useParams()
  const { t } = useTranslation(['app', 'common'])
  const { data: session } = useSession()
  const goTo = useGoTo()
  const queryClient = useQueryClient()
  const [confirmUnenroll, setConfirmUnenroll] = useState(false)

  const { data: course, isPending, error } = useQuery({
    queryKey: ['course', slug],
    queryFn: () => unwrap(api.api.courses[':slug'].$get({ param: { slug } })),
  })

  const onChanged = async () => {
    setConfirmUnenroll(false)
    await queryClient.invalidateQueries({ queryKey: ['course', slug] })
    await queryClient.invalidateQueries({ queryKey: ['courses'] })
    await queryClient.invalidateQueries({ queryKey: ['my-courses'] })
  }
  const enroll = useMutation({
    mutationFn: () => unwrap(api.api.enrollments[':slug'].$post({ param: { slug } })),
    onSuccess: onChanged,
  })
  const unenroll = useMutation({
    mutationFn: () => unwrap(api.api.enrollments[':slug'].$delete({ param: { slug } })),
    onSuccess: onChanged,
  })

  if (isPending) return <p className="text-zinc-600 dark:text-zinc-400">{t('course.loading')}</p>

  if (error) {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 text-center">
        <span className="text-4xl" aria-hidden="true">
          😕
        </span>
        <h1 className="text-2xl font-semibold">{isNotFound(error) ? t('course.notFound') : error.message}</h1>
        <Link to="/courses" className="rounded bg-zinc-900 px-3 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">
          {t('common:backToCatalogue')}
        </Link>
      </div>
    )
  }

  const mutationError = enroll.error ?? unenroll.error
  const button = 'rounded-lg px-4 py-2 font-semibold disabled:opacity-60'

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,22rem)_1fr]">
      <aside className="flex flex-col gap-4 md:sticky md:top-4 md:self-start">
        <div className="flex h-32 items-center justify-center rounded-xl bg-zinc-100 text-5xl dark:bg-zinc-900" aria-hidden="true">
          {categoryIcon(course.category)}
        </div>
        <h1 className="text-2xl font-semibold">{course.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {course.difficulty && <DifficultyBadge difficulty={course.difficulty} />}
          {course.category && <CategoryLabel category={course.category} />}
        </div>
        {course.description && <p className="whitespace-pre-line text-zinc-700 dark:text-zinc-300">{course.description}</p>}

        {course.status === 'archived' && (
          <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">{t('course.archived')}</p>
        )}

        <div className="flex flex-col gap-2" data-testid="enrollment">
          {course.enrollment ? (
            <>
              <p className="font-medium text-green-700 dark:text-green-400">
                ✓ {t('common:enrolledOn', { date: new Date(course.enrollment.enrolledAt) })}
              </p>
              {!course.enrollment.canUnenroll ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('course.managedByAdmin')}</p>
              ) : confirmUnenroll ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`${button} bg-red-600 text-white`}
                    disabled={unenroll.isPending}
                    onClick={() => unenroll.mutate()}
                  >
                    {t('course.unenrollConfirm')}
                  </button>
                  <button type="button" className={`${button} border`} onClick={() => setConfirmUnenroll(false)}>
                    {t('common:cancel')}
                  </button>
                </div>
              ) : (
                <button type="button" className={`${button} self-start border`} onClick={() => setConfirmUnenroll(true)}>
                  {t('course.unenroll')}
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className={`${button} bg-blue-600 text-white`}
              disabled={enroll.isPending}
              onClick={() =>
                session ? enroll.mutate() : goTo(`/login?redirect=${encodeURIComponent(`/courses/${slug}`)}`)
              }
            >
              {enroll.isPending ? t('course.enrolling') : t('course.enroll')}
            </button>
          )}
          {mutationError && (
            <p role="alert" className="text-sm text-red-600">
              {mutationError.message}
            </p>
          )}
        </div>
      </aside>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('course.contentTitle')}</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          {course.enrollment ? t('course.contentEmpty') : `📭 ${t('course.contentLocked')}`}
        </p>
      </section>
    </div>
  )
}
