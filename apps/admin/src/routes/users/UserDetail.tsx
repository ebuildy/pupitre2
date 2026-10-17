import { useTranslation } from '@pupitre/i18n'
import type { XpAdjustmentInput } from '@pupitre/shared'
import { isNotFound, LevelBadge, LoadingState, unwrap } from '@pupitre/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Button } from '@pupitre/ui/components/ui/button'
import { UserDeleteDialog, UserEditDialog, useSelfId } from '../../components/UserDialogs.tsx'
import { adminApi } from '../../lib/api.ts'
import { Input } from '@pupitre/ui/components/ui/input'
import { buttonVariants } from '@pupitre/ui/components/ui/button'

/** A user's XP: total, level, history, completed courses, and the manual adjustment form (spec 191). */
export function UserDetail() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [invalid, setInvalid] = useState<'amountInvalid' | 'reasonRequired' | null>(null)
  const [newTotal, setNewTotal] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const selfId = useSelfId()
  const navigate = useNavigate()

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
  const field = 'w-full'

  return (
    <div className="flex flex-col gap-6">
      <Link to="/users" className="text-sm underline">
        {t('users.back')}
      </Link>
      {isPending ? (
        <LoadingState label={t('users.loading')} />
      ) : error ? (
        <p role="alert" className="text-destructive">
          {isNotFound(error) ? t('users.notFound') : error.message}
        </p>
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-3xl font-bold tracking-tight">{user.username ?? user.name}</h1>
              <p className="text-sm text-muted-foreground">
                {user.name} · {user.email} · {t(`common:roles.${user.role}`)}
                {!user.isActive && <span className="ml-2 text-destructive">{t('users.inactive')}</span>}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(true)}>
                {t('common:edit')}
              </Button>
              {user.id !== selfId && (
                <Button variant="outline" className="text-destructive" onClick={() => setDeleting(true)}>
                  {t('common:delete')}
                </Button>
              )}
            </div>
          </header>
          <UserEditDialog user={editing ? user : null} onClose={() => setEditing(false)} />
          <UserDeleteDialog
            user={deleting ? user : null}
            onClose={() => setDeleting(false)}
            onDeleted={() => navigate('/users', { replace: true })}
          />

          <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
            <section className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{t('users.groupsTitle')}</h2>
              {user.groups.length === 0 ? (
                <p className="text-muted-foreground">{t('users.groupsEmpty')}</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm" data-testid="user-groups">
                  {user.groups.map((g) => (
                    <li key={g.id} className="flex items-center gap-2">
                      <Link to={`/groups/${g.id}`} className="hover:underline">
                        {g.name}
                      </Link>
                      {g.isDefault && <span className="text-xs text-muted-foreground">({t('users.defaultGroup')})</span>}
                      {g.role === 'manager' && <Badge variant="info">{t('common:membershipRoles.manager')}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{t('users.coursesTitle')}</h2>
              {user.courses.length === 0 ? (
                <p className="text-muted-foreground">{t('users.coursesEmpty')}</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm" data-testid="user-courses">
                  {user.courses.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2">
                      <Link to={`/courses/${c.id}`} className="hover:underline">
                        {c.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {c.sources.map((s) => t(`courses.enrollments.sources.${s as 'self'}`)).join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="flex max-w-3xl flex-col gap-3">
            <h2 className="text-xl font-semibold tracking-tight">{t('users.xpTitle')}</h2>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold" data-testid="user-xp">
                {t('common:xpAmount', { amount: user.xp })}
              </span>
              <LevelBadge xp={user.xp} />
            </div>

            <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-sm font-medium">
                {t('users.amount')}
                <Input type="number" step={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} w-48`} />
              </label>
              <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm font-medium">
                {t('users.reason')}
                <Input value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
              </label>
              <button
                type="submit"
                disabled={adjust.isPending}
                className={buttonVariants({ className: 'h-10' })}
              >
                {t('users.adjust')}
              </button>
            </form>
            {(invalid || adjust.error) && (
              <p role="alert" className="text-sm text-destructive">
                {invalid ? t(`users.${invalid}`) : adjust.error?.message}
              </p>
            )}
            {newTotal !== null && (
              <p role="status" className="text-sm text-success-foreground">
                {t('users.adjusted', { total: newTotal })}
              </p>
            )}
          </section>

          <section className="flex max-w-3xl flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={resetAttempts.isPending}
              onClick={() => resetAttempts.mutate()}
              className={buttonVariants({ variant: 'outline' })}
            >
              {t('users.resetAttempts')}
            </button>
            {resetAttempts.data && (
              <span role="status" className="text-sm text-success-foreground">
                {t('users.resetAttemptsDone', { count: resetAttempts.data.count })}
              </span>
            )}
          </section>

          <section className="flex max-w-3xl flex-col gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{t('users.completionsTitle')}</h2>
            {user.completions.length === 0 ? (
              <p className="text-muted-foreground">{t('users.completionsEmpty')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {user.completions.map((c, i) => (
                  <li key={i} className="flex justify-between gap-2 py-2">
                    <span>
                      {c.course?.title ?? c.title}
                      {!c.course && <span className="ml-2 text-xs text-muted-foreground">({t('users.deletedCourse')})</span>}
                    </span>
                    <span className="text-muted-foreground">{date(c.completedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex max-w-3xl flex-col gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{t('users.historyTitle')}</h2>
            {user.history.length === 0 ? (
              <p className="text-muted-foreground">{t('users.historyEmpty')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm" data-testid="user-xp-history">
                {user.history.map((e, i) => (
                  <li key={i} className="flex items-center gap-3 py-2">
                    <span className="w-28 text-xs text-muted-foreground">{t(`common:xpSources.${e.source}`)}</span>
                    <span className="min-w-0 flex-1 truncate">{e.course?.title ?? e.label}</span>
                    <span className="text-muted-foreground">{date(e.earnedAt)}</span>
                    <span className={`w-20 text-right font-semibold ${e.amount < 0 ? 'text-destructive' : ''}`}>
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
