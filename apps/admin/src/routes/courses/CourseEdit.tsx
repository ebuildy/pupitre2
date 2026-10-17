import { useTranslation } from '@pupitre/i18n'
import type { CourseCreateInput } from '@pupitre/shared'
import { isNotFound, LoadingState, unwrap } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { adminApi } from '../../lib/api.ts'
import { CourseForm } from './CourseForm.tsx'
import { EnrollmentsPanel } from './EnrollmentsPanel.tsx'
import { DefinitionDialog } from './DefinitionDialog.tsx'
import { GroupEnrollmentsPanel } from './GroupEnrollmentsPanel.tsx'
import { ModulesPanel } from './ModulesPanel.tsx'
import { PrerequisitesPanel } from './PrerequisitesPanel.tsx'

/** Spec 167 (edit) and 145 (enrollments). */
export function CourseEdit() {
  const { id = '' } = useParams()
  const { t } = useTranslation('admin')
  const location = useLocation()
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState<string | null>(null)
  const [definitionOpen, setDefinitionOpen] = useState(false)
  const created = (location.state as { created?: string } | null)?.created

  const { data: course, isPending, error } = useQuery({
    queryKey: ['admin-course', id],
    queryFn: () => unwrap(adminApi.courses[':id'].$get({ param: { id } })),
  })

  const update = useMutation({
    mutationFn: (input: CourseCreateInput) => unwrap(adminApi.courses[':id'].$patch({ param: { id }, json: input })),
    onSuccess: async (updated) => {
      setSaved(updated.slug)
      queryClient.setQueryData(['admin-course', id], updated)
      await queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
    },
  })

  const notice = saved
    ? t('courses.form.saved', { slug: saved })
    : created
      ? t('courses.form.created', { slug: created })
      : null

  return (
    <div className="flex flex-col gap-6">
      <Link to="/courses" className="text-sm underline">
        {t('courses.back')}
      </Link>
      {isPending ? (
        <LoadingState label={t('courses.loading')} />
      ) : error ? (
        <p role="alert" className="text-destructive">
          {isNotFound(error) ? t('courses.notFound') : error.message}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{t('courses.form.editTitle')}</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDefinitionOpen(true)}>
                {t('authoring.definition')}
              </Button>
              <Button asChild variant="outline" size="sm">
                {/* Download from the API (attachment): plain link. */}
                <a href={`/api/admin/courses/${course.id}/export/markdown`} download aria-label={t('authoring.exportMdLabel')}>
                  {t('authoring.exportMd')}
                </a>
              </Button>
            </div>
          </div>
          <DefinitionDialog courseId={course.id} slug={course.slug} open={definitionOpen} onOpenChange={setDefinitionOpen} />
          {notice && (
            <p role="status" className="max-w-2xl rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success-foreground">
              {notice}
            </p>
          )}
          {/* `key`: reset the form when another course is loaded. */}
          <CourseForm
            key={course.id}
            course={course}
            pending={update.isPending}
            error={update.error?.message}
            onSubmit={(input) => {
              setSaved(null)
              update.mutate(input)
            }}
          />
          <ModulesPanel courseId={course.id} />
          <PrerequisitesPanel key={`prereq-${course.updatedAt}`} course={course} />
          <EnrollmentsPanel courseId={course.id} />
          <GroupEnrollmentsPanel courseId={course.id} />
        </>
      )}
    </div>
  )
}
