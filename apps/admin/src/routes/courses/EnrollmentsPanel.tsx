import { useTranslation } from '@pupitre/i18n'
import type { AdminUserSearchResult } from '@pupitre/shared'
import { unwrap, useDebouncedValue } from '@pupitre/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { adminApi } from '../../lib/api.ts'

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
    <section className="flex max-w-3xl flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h2 className="text-lg font-semibold">{t('courses.enrollments.title', { count })}</h2>

      <form
        className="relative flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!selected) return setMustSelect(true)
          enroll.mutate(selected.id)
        }}
      >
        <div className="relative min-w-64 flex-1">
          <input
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
            className="h-10 w-full rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700"
          />
          {!selected && q && suggestions.data && suggestions.data.users.length > 0 && (
            <ul
              id="user-suggestions"
              role="listbox"
              className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              {suggestions.data.users.map((u) => (
                <li key={u.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={() => setSelected(u)}
                  >
                    <span className="font-medium">{userLabel(u)}</span>{' '}
                    <span className="text-zinc-500">{u.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="submit"
          disabled={enroll.isPending}
          className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {t('courses.enrollments.enroll')}
        </button>
      </form>

      {(mustSelect || mutationError) && (
        <p role="alert" className="text-sm text-red-600">
          {mustSelect ? t('courses.enrollments.selectUser') : mutationError?.message}
        </p>
      )}

      {enrollments.isPending ? (
        <p>{t('courses.loading')}</p>
      ) : enrollments.isError ? (
        <p role="alert" className="text-red-600">
          {enrollments.error.message}
        </p>
      ) : enrollments.data.enrollments.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">{t('courses.enrollments.empty')}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="py-2 pr-4 font-medium">{t('courses.enrollments.user')}</th>
              <th className="py-2 pr-4 font-medium">{t('courses.enrollments.enrolledAt')}</th>
              <th className="py-2 pr-4 font-medium">{t('courses.enrollments.source')}</th>
              <th className="py-2 pr-4 font-medium">{t('courses.enrollments.completion')}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {enrollments.data.enrollments.map((e) => (
              <tr key={e.userId} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-2 pr-4">
                  <div className="font-medium">{userLabel(e)}</div>
                  <div className="text-xs text-zinc-500">{e.email}</div>
                </td>
                <td className="py-2 pr-4">
                  {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
                    new Date(e.enrolledAt),
                  )}
                </td>
                <td className="py-2 pr-4">
                  {e.sources.map((s) => t(`courses.enrollments.sources.${s}`)).join(', ')}
                </td>
                <td className="py-2 pr-4">
                  {e.completedAt ? (
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-green-700 dark:text-green-400">
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
                      className="rounded border px-2 py-1 text-xs"
                      disabled={complete.isPending}
                      onClick={() => complete.mutate(e.userId)}
                    >
                      {t('courses.enrollments.markCompleted')}
                    </button>
                  )}
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-sm text-red-600"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(e.userId)}
                    aria-label={`${t('courses.enrollments.remove')} ${userLabel(e)}`}
                  >
                    {t('courses.enrollments.remove')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
