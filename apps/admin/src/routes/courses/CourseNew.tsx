import { useTranslation } from '@pupitre/i18n'
import type { CourseCreateInput } from '@pupitre/shared'
import { unwrap } from '@pupitre/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { adminApi } from '../../lib/api.ts'
import { CourseForm } from './CourseForm.tsx'

/** Spec 166. */
export function CourseNew() {
  const { t } = useTranslation('admin')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: (input: CourseCreateInput) => unwrap(adminApi.courses.$post({ json: input })),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
      navigate(`/courses/${created.id}`, { state: { created: created.slug } })
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <Link to="/courses" className="text-sm underline">
        {t('courses.back')}
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">{t('courses.form.newTitle')}</h1>
      <CourseForm pending={create.isPending} error={create.error?.message} onSubmit={(input) => create.mutate(input)} />
    </div>
  )
}
