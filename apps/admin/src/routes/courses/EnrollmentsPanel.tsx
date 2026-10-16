import { useTranslation } from '@pupitre/i18n'
import type { AdminUserSearchResult } from '@pupitre/shared'
import { ErrorState, LoadingState, unwrap, useDebouncedValue } from '@pupitre/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { adminApi } from '../../lib/api.ts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pupitre/ui/components/ui/table'
import { Input } from '@pupitre/ui/components/ui/input'
import { buttonVariants } from '@pupitre/ui/components/ui/button'
import { cn } from '@pupitre/ui'

function userLabel(u: { username: string | null; name: string }) {
  return u.username ?? u.name
}

/** Spec 145: enrolled users of a course; enroll by search, remove. */
export function EnrollmentsPanel({ courseId }: { courseId: string }) {
  const { t, i18n } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AdminUserSearchResult | null>(null)
  const [mustSelect, setMustSelect] = useState(false)
  const q = useDebouncedValue(search.trim(), 250)

  const enrollments = useQuery({
    queryKey: ['admin-enrollments', courseId],
    queryFn: () => unwrap(adminApi.courses[':id'].enrollments.$get({ param: { id: courseId } })),
  })

  const suggestions = useQuery({
    queryKey: ['admin-user-search', q],
    queryFn: () => unwrap(adminApi.users.search.$get({ query: { q } })),
    enabled: q.length > 0 && !selected,
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-enrollments', courseId] })
    await queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
    await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
  }

  const enroll = useMutation({
    mutationFn: (userId: string) =>
      unwrap(adminApi.courses[':id'].enrollments.$post({ param: { id: courseId }, json: { userId } })),
    onSuccess: async () => {
      setSelected(null)
      setSearch('')
      await refresh()
    },
  })

  const remove = useMutation({
    mutationFn: (userId: string) =>
      unwrap(adminApi.courses[':id'].enrollments[':userId'].$delete({ param: { id: courseId, userId } })),
    onSuccess: refresh,
  })

  // Course completion, marked by hand until modules exist; grants the course's completion XP.
  const complete = useMutation({
    mutationFn: (userId: string) =>
      unwrap(adminApi.courses[':id'].completions.$post({ param: { id: courseId }, json: { userId } })),
    onSuccess: refresh,
  })
  const uncomplete = useMutation({
    mutationFn: (userId: string) =>
      unwrap(adminApi.courses[':id'].completions[':userId'].$delete({ param: { id: courseId, userId } })),
    onSuccess: refresh,
  })

  const count = enrollments.data?.total ?? 0
  const mutationError = enroll.error ?? remove.error ?? complete.error ?? uncomplete.error

  return (
    <section className="flex max-w-3xl flex-col gap-3 border-t pt-6">
      <h2 className="text-xl font-semibold tracking-tight">{t('courses.enrollments.title', { count })}</h2>

      <form
        className="relative flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!selected) return setMustSelect(true)
          enroll.mutate(selected.id)
        }}
      >
        <div className="relative min-w-64 flex-1">
          <Input
            type="search"
            role="combobox"
            aria-expanded={!!suggestions.data?.users.length}
            aria-controls="user-suggestions"
            aria-label={t('courses.enrollments.searchLabel')}
            placeholder={t('courses.enrollments.searchPlaceholder')}
            value={selected ? `${userLabel(selected)} <${selected.email}>` : search}
            onChange={(e) => {
              setSelected(null)
              setMustSelect(false)
              setSearch(e.target.value)
            }}
            className="h-10 max-w-sm"
          />
          {!selected && q && suggestions.data && suggestions.data.users.length > 0 && (
            <ul
              id="user-suggestions"
              role="listbox"
              className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
            >
              {suggestions.data.users.map((u) => (
                <li key={u.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => setSelected(u)}
                  >
                    <span className="font-medium">{userLabel(u)}</span>{' '}
                    <span className="text-muted-foreground">{u.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="submit"
          disabled={enroll.isPending}
          className={buttonVariants({ className: 'h-10' })}
        >
          {t('courses.enrollments.enroll')}
        </button>
      </form>

      {(mustSelect || mutationError) && (
        <p role="alert" className="text-sm text-destructive">
          {mustSelect ? t('courses.enrollments.selectUser') : mutationError?.message}
        </p>
      )}

      {enrollments.isPending ? (
        <LoadingState label={t('courses.loading')} />
      ) : enrollments.isError ? (
        <ErrorState message={enrollments.error.message} />
      ) : enrollments.data.enrollments.length === 0 ? (
        <p className="text-muted-foreground">{t('courses.enrollments.empty')}</p>
      ) : (
        <Table className="w-full text-left text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>{t('courses.enrollments.user')}</TableHead>
              <TableHead>{t('courses.enrollments.enrolledAt')}</TableHead>
              <TableHead>{t('courses.enrollments.source')}</TableHead>
              <TableHead>{t('courses.enrollments.completion')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrollments.data.enrollments.map((e) => (
              <TableRow key={e.userId}>
                <TableCell>
                  <div className="font-medium">{userLabel(e)}</div>
                  <div className="text-xs text-muted-foreground">{e.email}</div>
                </TableCell>
                <TableCell>
                  {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
                    new Date(e.enrolledAt),
                  )}
                </TableCell>
                <TableCell>
                  {e.sources.map((s) => t(`courses.enrollments.sources.${s}`)).join(', ')}
                </TableCell>
                <TableCell>
                  {e.completedAt ? (
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-success-foreground">
                        ✓ {t('courses.enrollments.completedOn', { date: new Date(e.completedAt) })}
                      </span>
                      <button
                        type="button"
                        className="text-xs underline"
                        disabled={uncomplete.isPending}
                        onClick={() => uncomplete.mutate(e.userId)}
                      >
                        {t('courses.enrollments.undoCompleted')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      disabled={complete.isPending}
                      onClick={() => complete.mutate(e.userId)}
                    >
                      {t('courses.enrollments.markCompleted')}
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-destructive')}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(e.userId)}
                    aria-label={`${t('courses.enrollments.remove')} ${userLabel(e)}`}
                  >
                    {t('courses.enrollments.remove')}
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
