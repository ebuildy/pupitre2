import { useTranslation } from '@pupitre/i18n'
import { categoryIcon, ErrorState, LoadingState, unwrap } from '@pupitre/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { adminApi } from '../../lib/api.ts'
import { categoriesQueryKey, flattenTree, useCategories } from '../../lib/categories.ts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pupitre/ui/components/ui/table'
import { Card } from '@pupitre/ui/components/ui/card'
import { buttonVariants } from '@pupitre/ui/components/ui/button'
import { cn } from '@pupitre/ui'

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

  const button = buttonVariants({ variant: 'outline', size: 'sm' })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">
          {t('categories.title')}
          {data && (
            <span className="ml-2 text-base font-normal text-muted-foreground">{t('categories.count', { count: data.total })}</span>
          )}
        </h1>
        <Link to="/categories/new" className={buttonVariants()}>
          {t('categories.new')}
        </Link>
      </div>

      {deletedTitle && (
        <p role="status" className="rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success-foreground">
          {t('categories.deleted', { title: deletedTitle })}
        </p>
      )}
      {remove.error && (
        <p role="alert" className="text-sm text-destructive">
          {remove.error.message}
        </p>
      )}

      {isPending ? (
        <LoadingState label={t('categories.loading')} />
      ) : isError ? (
        <ErrorState message={error.message} />
      ) : data.categories.length === 0 ? (
        <p className="text-muted-foreground">{t('categories.empty')}</p>
      ) : (
        <Card className="py-0">
          <Table className="w-full max-w-4xl text-left text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>{t('categories.columns.title')}</TableHead>
                <TableHead>{t('categories.columns.slug')}</TableHead>
                <TableHead>{t('categories.columns.courses')}</TableHead>
                <TableHead>
                  <span className="sr-only">{t('categories.columns.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flattenTree(data.categories).map(({ category, depth }) => (
                <TableRow key={category.id}>
                  <TableCell style={{ paddingLeft: `${depth * 1.5}rem` }}>
                    {depth > 0 && (
                      <span className="mr-1 text-muted-foreground" aria-hidden="true">
                        └
                      </span>
                    )}
                    <span aria-hidden="true">{categoryIcon(category)} </span>
                    <Link to={`/categories/${category.id}`} className="font-medium hover:underline">
                      {category.title}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{category.slug}</TableCell>
                  <TableCell>{category.courseCount}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {confirmingId === category.id ? (
                        <>
                          <button
                            type="button"
                            className={buttonVariants({ variant: 'destructive', size: 'sm' })}
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
                            className={cn(button, 'text-destructive')}
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
