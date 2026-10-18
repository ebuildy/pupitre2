import { useTranslation } from '@pupitre/i18n'
import { CategoryLabel, DifficultyBadge, ErrorState, LoadingState, StatusBadge, unwrap, useDebouncedValue, VisibilityBadge } from '@pupitre/ui'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { adminApi } from '../../lib/api.ts'
import { ImportDialog } from './ImportDialog.tsx'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pupitre/ui/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pupitre/ui/components/ui/table'
import { Card } from '@pupitre/ui/components/ui/card'
import { Input } from '@pupitre/ui/components/ui/input'
import { buttonVariants } from '@pupitre/ui/components/ui/button'
import { cn, toast } from '@pupitre/ui'

/** Spec 165 (list), 168 (delete). */
export function CourseList() {
  const { t } = useTranslation(['admin', 'common'])
  const [importing, setImporting] = useState(false)
  const [clearing, setClearing] = useState(false)
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

  const button = buttonVariants({ variant: 'outline', size: 'sm' })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">
          {t('courses.title')}
          {data && (
            <span className="ml-2 text-base font-normal text-muted-foreground">{t('courses.count', { count: data.total })}</span>
          )}
        </h1>
        <div className="flex gap-2">
          <button type="button" className={buttonVariants({ variant: 'outline' })} onClick={() => setClearing(true)}>
            {t('authoring.cache.all')}
          </button>
          <button type="button" className={buttonVariants({ variant: 'outline' })} onClick={() => setImporting(true)}>
            {t('authoring.import.button')}
          </button>
          <Link to="/courses/new" className={buttonVariants()}>
            {t('courses.new')}
          </Link>
        </div>
      </div>
      <ImportDialog open={importing} onOpenChange={setImporting} />
      <AlertDialog open={clearing} onOpenChange={setClearing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('authoring.cache.confirmAll')}</AlertDialogTitle>
            <AlertDialogDescription>{t('authoring.cache.confirmAllBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await unwrap(adminApi.cache.clear.$post())
                  toast.success(t('authoring.cache.allDone'))
                } catch (err) {
                  toast.error((err as Error).message)
                }
              }}
            >
              {t('authoring.cache.all')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('courses.searchPlaceholder')}
        aria-label={t('courses.searchLabel')}
        className="h-10 max-w-sm"
      />

      {deletedTitle && (
        <p role="status" className="rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success-foreground">
          {t('courses.deleted', { title: deletedTitle })}
        </p>
      )}
      {remove.error && (
        <p role="alert" className="text-sm text-destructive">
          {remove.error.message}
        </p>
      )}

      {isPending ? (
        <LoadingState label={t('courses.loading')} />
      ) : isError ? (
        <ErrorState message={error.message} />
      ) : data.courses.length === 0 ? (
        <p className="text-muted-foreground">{t('courses.empty')}</p>
      ) : (
        <Card className="py-0">
          <Table className="w-full text-left text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>{t('courses.columns.title')}</TableHead>
                <TableHead>{t('courses.columns.category')}</TableHead>
                <TableHead>{t('courses.columns.difficulty')}</TableHead>
                <TableHead>{t('courses.columns.visibility')}</TableHead>
                <TableHead>{t('courses.columns.status')}</TableHead>
                <TableHead>{t('courses.columns.enrollments')}</TableHead>
                <TableHead>
                  <span className="sr-only">{t('courses.columns.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.courses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell>
                    <Link to={`/courses/${course.id}`} className="font-medium hover:underline">
                      {course.title}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{course.slug}</div>
                  </TableCell>
                  <TableCell>{course.category && <CategoryLabel category={course.category} />}</TableCell>
                  <TableCell>{course.difficulty && <DifficultyBadge difficulty={course.difficulty} />}</TableCell>
                  <TableCell>
                    <VisibilityBadge visibility={course.visibility} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={course.status} />
                  </TableCell>
                  <TableCell>{course.enrollmentCount}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {confirmingId === course.id ? (
                        <>
                          <button
                            type="button"
                            className={buttonVariants({ variant: 'destructive', size: 'sm' })}
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
                            className={cn(button, 'text-destructive')}
                            onClick={() => setConfirmingId(course.id)}
                          >
                            {t('courses.delete')}
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
