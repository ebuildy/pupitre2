import { useTranslation } from '@pupitre/i18n'
import type { XpAdjustmentInput } from '@pupitre/shared'
import { isNotFound, LevelBadge, unwrap } from '@pupitre/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link, useParams } from 'react-router'
import { adminApi } from '../../lib/api.ts'

/** A user's XP: total, level, history, completed courses, and the manual adjustment form (spec 191). */
export function UserDetail() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [invalid, setInvalid] = useState<'amountInvalid' | 'reasonRequired' | null>(null)
  const [newTotal, setNewTotal] = useState<number | null>(null)

  const { data: user, isPending, error } = useQuery({
    queryKey: ['admin-user', id],
    queryFn: () => unwrap(adminApi.users[':id'].$get({ param: { id } })),
  })

  const adjust = useMutation({
    mutationFn: (input: XpAdjustmentInput) => unwrap(adminApi.users[':id'].xp.$post({ param: { id }, json: input })),
    onSuccess: async ({ total }) => {
      setNewTotal(total)
      setAmount('')
      setReason('')
      await queryClient.invalidateQueries({ queryKey: ['admin-user', id] })
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  // Spec 191 "QuestionAttemptState": clears the learner's cooldowns and locked questions.
  const resetAttempts = useMutation({
    mutationFn: () => unwrap(adminApi.users[':id']['quiz-attempts'].$delete({ param: { id } })),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const n = Number(amount)
    if (!amount.trim() || !Number.isInteger(n) || n === 0) return setInvalid('amountInvalid')
    if (!reason.trim()) return setInvalid('reasonRequired')
    setInvalid(null)
    setNewTotal(null)
    adjust.mutate({ amount: n, reason: reason.trim() })
  }

  const date = (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso))
  const field = 'rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700'

  return (
    <div className="flex flex-col gap-6">
      <Link to="/users" className="text-sm underline">
        {t('users.back')}
      </Link>
      {isPending ? (
        <p>{t('users.loading')}</p>
      ) : error ? (
        <p role="alert" className="text-red-600">
          {isNotFound(error) ? t('users.notFound') : error.message}
        </p>
      ) : (
        <>
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">{user.username ?? user.name}</h1>
            <p className="text-sm text-zinc-500">
              {user.name} · {user.email} · {t(`common:roles.${user.role}`)}
              {!user.isActive && <span className="ml-2 text-red-600">{t('users.inactive')}</span>}
            </p>
          </header>

          <section className="flex max-w-3xl flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('users.xpTitle')}</h2>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold" data-testid="user-xp">
                {t('common:xpAmount', { amount: user.xp })}
              </span>
              <LevelBadge xp={user.xp} />
            </div>

            <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-sm font-medium">
                {t('users.amount')}
                <input type="number" step={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} w-48`} />
              </label>
              <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm font-medium">
                {t('users.reason')}
                <input value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
              </label>
              <button
                type="submit"
                disabled={adjust.isPending}
                className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t('users.adjust')}
              </button>
            </form>
            {(invalid || adjust.error) && (
              <p role="alert" className="text-sm text-red-600">
                {invalid ? t(`users.${invalid}`) : adjust.error?.message}
              </p>
            )}
            {newTotal !== null && (
              <p role="status" className="text-sm text-green-700 dark:text-green-400">
                {t('users.adjusted', { total: newTotal })}
              </p>
            )}
          </section>

          <section className="flex max-w-3xl flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={resetAttempts.isPending}
              onClick={() => resetAttempts.mutate()}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
            >
              {t('users.resetAttempts')}
            </button>
            {resetAttempts.data && (
              <span role="status" className="text-sm text-green-700 dark:text-green-400">
                {t('users.resetAttemptsDone', { count: resetAttempts.data.count })}
              </span>
            )}
          </section>

          <section className="flex max-w-3xl flex-col gap-2">
            <h2 className="text-lg font-semibold">{t('users.completionsTitle')}</h2>
            {user.completions.length === 0 ? (
              <p className="text-zinc-600 dark:text-zinc-400">{t('users.completionsEmpty')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-zinc-100 text-sm dark:divide-zinc-900">
                {user.completions.map((c, i) => (
                  <li key={i} className="flex justify-between gap-2 py-2">
                    <span>
                      {c.course?.title ?? c.title}
                      {!c.course && <span className="ml-2 text-xs text-zinc-500">({t('users.deletedCourse')})</span>}
                    </span>
                    <span className="text-zinc-500">{date(c.completedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex max-w-3xl flex-col gap-2">
            <h2 className="text-lg font-semibold">{t('users.historyTitle')}</h2>
            {user.history.length === 0 ? (
              <p className="text-zinc-600 dark:text-zinc-400">{t('users.historyEmpty')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-zinc-100 text-sm dark:divide-zinc-900" data-testid="user-xp-history">
                {user.history.map((e, i) => (
                  <li key={i} className="flex items-center gap-3 py-2">
                    <span className="w-28 text-xs text-zinc-500">{t(`common:xpSources.${e.source}`)}</span>
                    <span className="min-w-0 flex-1 truncate">{e.course?.title ?? e.label}</span>
                    <span className="text-zinc-500">{date(e.earnedAt)}</span>
                    <span className={`w-20 text-right font-semibold ${e.amount < 0 ? 'text-red-600' : ''}`}>
                      {e.amount > 0 ? '+' : ''}
                      {t('common:xpAmount', { amount: e.amount })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
