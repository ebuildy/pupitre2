import { useTranslation } from '@pupitre/i18n'
import type { CategoryCreateInput } from '@pupitre/shared'
import { unwrap } from '@pupitre/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { adminApi } from '../../lib/api.ts'
import { categoriesQueryKey } from '../../lib/categories.ts'
import { CategoryForm } from './CategoryForm.tsx'

export function CategoryNew() {
  const { t } = useTranslation('admin')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: (input: CategoryCreateInput) => unwrap(adminApi.categories.$post({ json: input })),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: categoriesQueryKey })
      navigate(`/categories/${created.id}`, { state: { created: created.slug } })
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <Link to="/categories" className="text-sm underline">
        {t('categories.back')}
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">{t('categories.form.newTitle')}</h1>
      <CategoryForm pending={create.isPending} error={create.error?.message} onSubmit={(input) => create.mutate(input)} />
    </div>
  )
}
