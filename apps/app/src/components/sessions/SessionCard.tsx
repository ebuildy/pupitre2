import { useSession } from '@pupitre/auth-ui'
import { useTranslation } from '@pupitre/i18n'
import type { SessionView } from '@pupitre/shared'
import { cn, toast, unwrap } from '@pupitre/ui'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Button } from '@pupitre/ui/components/ui/button'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../../lib/api.ts'

/** Spec 152: one session, with booking for learners and, for trainers, edit / delete / attendance actions. */
export function SessionCard({
  session,
  showCourse,
  trainerActions,
}: {
  session: SessionView
  showCourse?: boolean
  trainerActions?: React.ReactNode
}) {
  const { t } = useTranslation('app')
  const { data: auth } = useSession()
  const queryClient = useQueryClient()
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['sessions'] })
    await queryClient.invalidateQueries({ queryKey: ['course', session.course.slug] })
    await queryClient.invalidateQueries({ queryKey: ['my-courses'] })
  }
  const book = useMutation({
    mutationFn: () => unwrap(api.api.sessions[':id'].booking.$post({ param: { id: session.id } })),
    onSuccess: async () => {
      toast.success(t('sessions.bookedToast'))
      await refresh()
    },
    onError: (err) => toast.error(err.message || t('sessions.error')),
  })
  const cancel = useMutation({
    mutationFn: () => unwrap(api.api.sessions[':id'].booking.$delete({ param: { id: session.id } })),
    onSuccess: async () => {
      toast.success(t('sessions.cancelledToast'))
      await refresh()
    },
    onError: (err) => toast.error(err.message || t('sessions.error')),
  })
  const date = new Date(session.startsAt)
  const full = session.capacity !== null && session.bookedCount >= session.capacity && !session.booked

  return (
    <article
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs',
        session.booked && 'border-primary bg-secondary',
        session.past && 'opacity-60',
      )}
      data-testid={`session-${session.title}`}
    >
      {showCourse && (
        <Link to={`/courses/${session.course.slug}`} className="text-xs font-medium text-primary hover:underline">
          {session.course.title}
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{session.title}</h3>
        {session.booked && <Badge variant="info">{t('sessions.bookedBadge')}</Badge>}
        {session.past && <Badge variant="muted">{t('sessions.past')}</Badge>}
      </div>
      <p className="text-sm">{t('sessions.when', { date })}</p>
      {session.location && <p className="text-sm text-muted-foreground">{t('sessions.where', { location: session.location })}</p>}
      <p className="text-sm text-muted-foreground">
        {session.capacity === null
          ? `${t('sessions.unlimited')} · ${t('sessions.booked', { count: session.bookedCount })}`
          : t('sessions.seatsLeft', { booked: session.bookedCount, capacity: session.capacity })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {auth && !session.past &&
          (session.booked ? (
            <Button variant="outline" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              {t('sessions.cancel')}
            </Button>
          ) : full ? (
            <Badge variant="warning">{t('sessions.full')}</Badge>
          ) : (
            <Button size="sm" disabled={book.isPending} onClick={() => book.mutate()}>
              {t('sessions.book')}
            </Button>
          ))}
        {trainerActions}
      </div>
    </article>
  )
}
