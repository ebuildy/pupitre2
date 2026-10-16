import { useTranslation } from '@pupitre/i18n'
import type { CategoryCreateInput } from '@pupitre/shared'
import { unwrap } from '@pupitre/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { adminApi } from '../../lib/api.ts'
import { categoriesQueryKey, useCategories } from '../../lib/categories.ts'
import { CategoryForm } from './CategoryForm.tsx'

export function CategoryEdit() {
  const { id = '' } = useParams()
  const { t } = useTranslation('admin')
  const location = useLocation()
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState<string | null>(null)
  const created = (location.state as { created?: string } | null)?.created

  // The list is small and already cached by the other admin pages.
  const { data, isPending, error } = useCategories()
  const category = data?.categories.find((c) => c.id === id)

  const update = useMutation({
    mutationFn: (input: CategoryCreateInput) => unwrap(adminApi.categories[':id'].$patch({ param: { id }, json: input })),
    onSuccess: async (updated) => {
      setSaved(updated.slug)
      await queryClient.invalidateQueries({ queryKey: categoriesQueryKey })
      // Course labels show category titles and paths.
      await queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
    },
  })

  const notice = saved
    ? t('categories.form.saved', { slug: saved })
    : created
      ? t('categories.form.created', { slug: created })
      : null

  return (
    <div className="flex flex-col gap-6">
      <Link to="/categories" className="text-sm underline">
        {t('categories.back')}
      </Link>
      {isPending ? (
        <p>{t('categories.loading')}</p>
      ) : error ? (
        <p role="alert" className="text-red-600">
          {error.message}
        </p>
      ) : !category ? (
        <p role="alert" className="text-red-600">
          {t('categories.notFound')}
        </p>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">{t('categories.form.editTitle')}</h1>
          {notice && (
            <p role="status" className="max-w-2xl rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
              {notice}
            </p>
          )}
          <CategoryForm
            key={category.id}
            category={category}
            pending={update.isPending}
            error={update.error?.message}
            onSubmit={(input) => {
              setSaved(null)
              update.mutate(input)
            }}
          />
        </>
      )}
    </div>
  )
}
