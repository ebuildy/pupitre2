import { useGoTo, useSession } from '@pupitre/auth-ui'
import { useTranslation } from '@pupitre/i18n'
import type { CourseModulesResponse } from '@pupitre/shared'
import { CategoryLabel, categoryIcon, DifficultyBadge, isNotFound, unwrap } from '@pupitre/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ModuleList } from '../components/ModuleList.tsx'
import { api } from '../lib/api.ts'
import { moduleHref, nextModule, useCourseModules } from '../lib/learning.ts'

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
  // Content is for enrolled learners and admins (spec 053).
  const canSeeContent = !!course?.enrollment || session?.user.role === 'admin'
  const { data: content } = useCourseModules(slug, canSeeContent)

  const onChanged = async () => {
    setConfirmUnenroll(false)
    await queryClient.invalidateQueries({ queryKey: ['course', slug] })
    await queryClient.invalidateQueries({ queryKey: ['courses'] })
    await queryClient.invalidateQueries({ queryKey: ['my-courses'] })
    await queryClient.invalidateQueries({ queryKey: ['modules', slug] })
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
  // Spec 049: the gate only matters before enrolling. Signed out, the button leads to login anyway.
  const missingXp =
    !course.enrollment && course.userXp !== null ? Math.max(0, course.xpRequired - course.userXp) : 0
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

        {course.completedAt && (
          <p className="rounded-lg bg-green-50 px-3 py-2 font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
            ✓ {t('course.completedOn', { date: new Date(course.completedAt) })}
          </p>
        )}

        {course.completionXp > 0 && (
          <Link
            to="/my-xp"
            className="flex flex-col rounded-lg border border-violet-200 px-3 py-2 dark:border-violet-900"
            data-testid="course-xp"
          >
            <span className="text-xs text-zinc-500">⚡ {t('course.xpTitle')}</span>
            <span className="font-semibold text-violet-700 dark:text-violet-300">
              {course.completedAt
                ? `${t('course.xpEarned', { amount: course.completionXp })} ✓`
                : t('course.xpToEarn', { amount: course.completionXp })}
            </span>
          </Link>
        )}

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
            <>
              {course.xpRequired > 0 && (
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  ⚡ {t('course.xpGate', { amount: course.xpRequired })}
                </p>
              )}
              {missingXp > 0 && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {t('course.xpMissing', { missing: missingXp, current: course.userXp })}
                </p>
              )}
              <button
                type="button"
                className={`${button} bg-blue-600 text-white`}
                disabled={enroll.isPending || missingXp > 0}
                onClick={() =>
                  session ? enroll.mutate() : goTo(`/login?redirect=${encodeURIComponent(`/courses/${slug}`)}`)
                }
              >
                {enroll.isPending ? t('course.enrolling') : t('course.enroll')}
              </button>
            </>
          )}
          {mutationError && (
            <p role="alert" className="text-sm text-red-600">
              {mutationError.message}
            </p>
          )}
        </div>
      </aside>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('course.contentTitle')}</h2>
          {content && (
            <span className="text-sm text-zinc-500">
              {t('course.modulesCount', { count: content.modules.filter((m) => !m.inline).length })}
            </span>
          )}
        </div>
        {!canSeeContent ? (
          <p className="text-zinc-600 dark:text-zinc-400">📭 {t('course.contentLocked')}</p>
        ) : content && content.modules.length > 0 ? (
          <>
            <ProgressBlock courseSlug={slug} content={content} />
            <ModuleList courseSlug={slug} modules={content.modules} />
          </>
        ) : content ? (
          <p className="text-zinc-600 dark:text-zinc-400">{t('course.contentEmpty')}</p>
        ) : null}
      </section>
    </div>
  )
}

/** Spec 045: "x/y complétés", progress bar, and the button to the next module. */
function ProgressBlock({ courseSlug, content }: { courseSlug: string; content: CourseModulesResponse }) {
  const { t } = useTranslation('app')
  const { done, total } = content.progress
  const target = nextModule(content.modules)
  const label = done === 0 ? t('course.start') : done === total ? t('course.review') : t('course.continue')
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <span className="text-sm text-zinc-600 dark:text-zinc-400" data-testid="course-progress">
          {t('course.progress', { done, total })}
        </span>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-green-600" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
      </div>
      {target && (
        <Link to={moduleHref(courseSlug, target)} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">
          {label}
        </Link>
      )}
    </div>
  )
}
