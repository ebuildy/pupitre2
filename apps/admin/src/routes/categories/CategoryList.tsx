import { useTranslation } from '@pupitre/i18n'
import { categoryIcon, unwrap } from '@pupitre/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { adminApi } from '../../lib/api.ts'
import { categoriesQueryKey, flattenTree, useCategories } from '../../lib/categories.ts'

/** Categories as an indented tree, with edit and delete. */
export function CategoryList() {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletedTitle, setDeletedTitle] = useState<string | null>(null)
  const { data, isPending, isError, error } = useCategories()

  const remove = useMutation({
    mutationFn: (category: { id: string; title: string }) =>
      unwrap(adminApi.categories[':id'].$delete({ param: { id: category.id } })),
    onMutate: () => setDeletedTitle(null),
    onSuccess: async (_, category) => {
      setConfirmingId(null)
      setDeletedTitle(category.title)
      await queryClient.invalidateQueries({ queryKey: categoriesQueryKey })
    },
  })

  const button = 'rounded border px-2 py-1 text-sm'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {t('categories.title')}
          {data && (
            <span className="ml-2 text-base font-normal text-zinc-500">{t('categories.count', { count: data.total })}</span>
          )}
        </h1>
        <Link to="/categories/new" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
          {t('categories.new')}
        </Link>
      </div>

      {deletedTitle && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          {t('categories.deleted', { title: deletedTitle })}
        </p>
      )}
      {remove.error && (
        <p role="alert" className="text-sm text-red-600">
          {remove.error.message}
        </p>
      )}

      {isPending ? (
        <p>{t('categories.loading')}</p>
      ) : isError ? (
        <p role="alert" className="text-red-600">
          {error.message}
        </p>
      ) : data.categories.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">{t('categories.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full max-w-4xl text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="py-2 pr-4 font-medium">{t('categories.columns.title')}</th>
                <th className="py-2 pr-4 font-medium">{t('categories.columns.slug')}</th>
                <th className="py-2 pr-4 font-medium">{t('categories.columns.courses')}</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">{t('categories.columns.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {flattenTree(data.categories).map(({ category, depth }) => (
                <tr key={category.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-4" style={{ paddingLeft: `${depth * 1.5}rem` }}>
                    {depth > 0 && (
                      <span className="mr-1 text-zinc-400" aria-hidden="true">
                        └
                      </span>
                    )}
                    <span aria-hidden="true">{categoryIcon(category)} </span>
                    <Link to={`/categories/${category.id}`} className="font-medium hover:underline">
                      {category.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-zinc-500">{category.slug}</td>
                  <td className="py-2 pr-4">{category.courseCount}</td>
                  <td className="py-2">
                    <div className="flex justify-end gap-2">
                      {confirmingId === category.id ? (
                        <>
                          <button
                            type="button"
                            className={`${button} border-red-600 bg-red-600 text-white`}
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(category)}
                          >
                            {t('categories.confirmDelete')}
                          </button>
                          <button type="button" className={button} onClick={() => setConfirmingId(null)}>
                            {t('common:cancel')}
                          </button>
                        </>
                      ) : (
                        <>
                          <Link to={`/categories/${category.id}`} className={button}>
                            {t('categories.edit')}
                          </Link>
                          <button
                            type="button"
                            className={`${button} text-red-600`}
                            onClick={() => {
                              remove.reset()
                              setConfirmingId(category.id)
                            }}
                          >
                            {t('categories.delete')}
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
