import { useGoTo, useSession } from '@pupitre/auth-ui'
import { useTranslation } from '@pupitre/i18n'
import type { CourseModulesResponse } from '@pupitre/shared'
import { CategoryLabel, categoryIcon, DifficultyBadge, EmptyState, ErrorState, isNotFound, LoadingState, unwrap } from '@pupitre/ui'
import { Alert, AlertDescription } from '@pupitre/ui/components/ui/alert'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card, CardContent } from '@pupitre/ui/components/ui/card'
import { Progress } from '@pupitre/ui/components/ui/progress'
import { ArchiveIcon, ZapIcon } from 'lucide-react'
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
    // The answer depends on the viewer (enrollment, XP): signing in loads it again.
    queryKey: ['course', slug, session?.user.id ?? null],
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

  if (isPending) return <LoadingState label={t('course.loading')} />

  if (error) {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 text-center">
        <span className="text-5xl" aria-hidden="true">
          😕
        </span>
        <h1 className="text-2xl font-semibold">{isNotFound(error) ? t('course.notFound') : error.message}</h1>
        <Button asChild>
          <Link to="/courses">{t('common:backToCatalogue')}</Link>
        </Button>
      </div>
    )
  }

  const mutationError = enroll.error ?? unenroll.error
  // Spec 049: the gate only matters before enrolling. Signed out, the button leads to login anyway.
  const missingXp =
    !course.enrollment && course.userXp !== null ? Math.max(0, course.xpRequired - course.userXp) : 0

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,22rem)_1fr]">
      <aside className="flex flex-col gap-4 md:sticky md:top-24 md:self-start">
        <Card className="gap-0 overflow-hidden py-0">
          <div
            className="flex h-36 items-center justify-center bg-gradient-to-br from-secondary to-muted text-6xl"
            aria-hidden="true"
          >
            {categoryIcon(course.category)}
          </div>
          <CardContent className="flex flex-col gap-4 p-5">
            <h1 className="text-2xl font-bold tracking-tight">{course.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {course.difficulty && <DifficultyBadge difficulty={course.difficulty} />}
              {course.category && <CategoryLabel category={course.category} />}
            </div>
            {course.description && <p className="whitespace-pre-line text-muted-foreground">{course.description}</p>}

            {course.completedAt && (
              <Alert variant="success">
                <AlertDescription className="font-medium text-current">
                  ✓ {t('course.completedOn', { date: new Date(course.completedAt) })}
                </AlertDescription>
              </Alert>
            )}

            {course.completionXp > 0 && (
              <Link
                to="/my-xp"
                className="flex items-center gap-3 rounded-lg border border-xp/30 bg-xp-soft px-3 py-2 transition-colors hover:border-xp/60"
                data-testid="course-xp"
              >
                <ZapIcon className="size-5 text-xp" aria-hidden="true" />
                <span className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{t('course.xpTitle')}</span>
                  <span className="font-semibold text-xp">
                    {course.completedAt
                      ? `${t('course.xpEarned', { amount: course.completionXp })} ✓`
                      : t('course.xpToEarn', { amount: course.completionXp })}
                  </span>
                </span>
              </Link>
            )}

            {course.status === 'archived' && (
              <Alert>
                <ArchiveIcon />
                <AlertDescription>{t('course.archived')}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2" data-testid="enrollment">
              {course.enrollment ? (
                <>
                  <p className="font-medium text-success-foreground">
                    ✓ {t('common:enrolledOn', { date: new Date(course.enrollment.enrolledAt) })}
                  </p>
                  {!course.enrollment.canUnenroll ? (
                    <p className="text-sm text-muted-foreground">{t('course.managedByAdmin')}</p>
                  ) : confirmUnenroll ? (
                    <div className="flex gap-2">
                      <Button variant="destructive" disabled={unenroll.isPending} onClick={() => unenroll.mutate()}>
                        {t('course.unenrollConfirm')}
                      </Button>
                      <Button variant="outline" onClick={() => setConfirmUnenroll(false)}>
                        {t('common:cancel')}
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" className="self-start" onClick={() => setConfirmUnenroll(true)}>
                      {t('course.unenroll')}
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {course.xpRequired > 0 && (
                    <p className="text-sm font-medium text-warning-foreground">⚡ {t('course.xpGate', { amount: course.xpRequired })}</p>
                  )}
                  {missingXp > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t('course.xpMissing', { missing: missingXp, current: course.userXp })}
                    </p>
                  )}
                  <Button
                    size="lg"
                    disabled={enroll.isPending || missingXp > 0}
                    onClick={() =>
                      session ? enroll.mutate() : goTo(`/login?redirect=${encodeURIComponent(`/courses/${slug}`)}`)
                    }
                  >
                    {enroll.isPending ? t('course.enrolling') : t('course.enroll')}
                  </Button>
                </>
              )}
              {mutationError && <ErrorState message={mutationError.message} />}
            </div>
          </CardContent>
        </Card>
      </aside>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{t('course.contentTitle')}</h2>
          {content && (
            <span className="text-sm text-muted-foreground">
              {t('course.modulesCount', { count: content.modules.filter((m) => !m.inline).length })}
            </span>
          )}
        </div>
        {!canSeeContent ? (
          <EmptyState title={`📭 ${t('course.contentLocked')}`} />
        ) : content && content.modules.length > 0 ? (
          <>
            <ProgressBlock courseSlug={slug} content={content} />
            <ModuleList courseSlug={slug} modules={content.modules} />
          </>
        ) : content ? (
          <EmptyState title={t('course.contentEmpty')} />
        ) : (
          <LoadingState label={t('course.loading')} />
        )}
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
    <Card className="flex-row flex-wrap items-center gap-4 p-4">
      <div className="flex min-w-48 flex-1 flex-col gap-2">
        <span className="text-sm font-medium" data-testid="course-progress">
          {t('course.progress', { done, total })}
        </span>
        <Progress value={total ? (done / total) * 100 : 0} className="[&>[data-slot=progress-indicator]]:bg-success" />
      </div>
      {target && (
        <Button asChild>
          <Link to={moduleHref(courseSlug, target)}>{label}</Link>
        </Button>
      )}
    </Card>
  )
}
