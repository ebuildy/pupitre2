import { useTranslation } from '@pupitre/i18n'
import type { SessionView } from '@pupitre/shared'
import { cn, ErrorState, LoadingState, PageHeader, toast, unwrap } from '@pupitre/ui'
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
import { Button } from '@pupitre/ui/components/ui/button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { SessionCard } from '../components/sessions/SessionCard.tsx'
import { SessionDialog } from '../components/sessions/SessionDialog.tsx'
import { api } from '../lib/api.ts'

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/** The 6×7 grid of a month, Monday first, with the days of the adjacent months. */
function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - offset + i))
}

/** Spec 154: month calendar of in-person sessions; trainers create, edit and delete them. */
export function Agenda() {
  const { t, i18n } = useTranslation(['app', 'common'])
  const queryClient = useQueryClient()
  const today = new Date()
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [picker, setPicker] = useState(false)
  const [selected, setSelected] = useState<Date | null>(null)
  const [editing, setEditing] = useState<SessionView | 'new' | null>(null)
  const [deleting, setDeleting] = useState<SessionView | null>(null)

  const days = monthGrid(cursor.year, cursor.month)
  const from = days[0]!.toISOString()
  const to = new Date(days[41]!.getFullYear(), days[41]!.getMonth(), days[41]!.getDate() + 1).toISOString()
  const month = useQuery({
    queryKey: ['sessions', { from, to }],
    queryFn: () => unwrap(api.api.sessions.$get({ query: { from, to } })),
  })
  const upcoming = useQuery({
    queryKey: ['sessions', { upcoming: true }],
    queryFn: () => unwrap(api.api.sessions.$get({ query: { from: new Date().toISOString() } })),
  })
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.api.sessions[':id'].$delete({ param: { id } })),
    onSuccess: async () => {
      toast.success(t('agenda.deleted'))
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setDeleting(null),
  })

  const byDay = new Map<string, SessionView[]>()
  for (const s of month.data?.sessions ?? []) {
    const key = dayKey(new Date(s.startsAt))
    byDay.set(key, [...(byDay.get(key) ?? []), s])
  }
  const canManage = !!month.data?.canManage
  const monthLabel = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(
    new Date(cursor.year, cursor.month, 1),
  )
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(new Date(2024, 0, 1 + i)),
  )
  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  const panel = selected ? (byDay.get(dayKey(selected)) ?? []) : (upcoming.data?.sessions ?? [])

  const trainerActions = (s: SessionView) =>
    canManage && (
      <>
        <Button variant="ghost" size="sm" onClick={() => setEditing(s)} aria-label={`${t('agenda.edit')} ${s.title}`}>
          {t('agenda.edit')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => setDeleting(s)}
          aria-label={`${t('agenda.delete')} ${s.title}`}
        >
          {t('agenda.delete')}
        </Button>
        <Button asChild variant="link" size="sm">
          <Link to={`/sessions/${s.id}/attendance`}>{t('sessions.attendance')}</Link>
        </Button>
      </>
    )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('agenda.title')}
        actions={canManage && <Button onClick={() => setEditing('new')}>{t('agenda.newSession')}</Button>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}>
              {t('agenda.today')}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label={t('agenda.previous')}>
              <ChevronLeftIcon />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label={t('agenda.next')}>
              <ChevronRightIcon />
            </Button>
            <div className="relative">
              <Button variant="ghost" className="text-lg font-semibold capitalize" onClick={() => setPicker((p) => !p)} aria-expanded={picker}>
                <span data-testid="agenda-month">{monthLabel}</span>
              </Button>
              {picker && (
                <div className="absolute z-20 mt-1 w-72 rounded-xl border bg-popover p-3 shadow-lg" role="dialog" aria-label={t('agenda.pickMonth')}>
                  <div className="mb-2 flex items-center justify-between">
                    <Button variant="ghost" size="icon" onClick={() => setCursor((c) => ({ ...c, year: c.year - 1 }))} aria-label={t('agenda.previousYear')}>
                      <ChevronLeftIcon />
                    </Button>
                    <span className="font-semibold">{cursor.year}</span>
                    <Button variant="ghost" size="icon" onClick={() => setCursor((c) => ({ ...c, year: c.year + 1 }))} aria-label={t('agenda.nextYear')}>
                      <ChevronRightIcon />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {Array.from({ length: 12 }, (_, m) => (
                      <Button
                        key={m}
                        variant={m === cursor.month ? 'default' : 'ghost'}
                        size="sm"
                        className="capitalize"
                        onClick={() => {
                          setCursor((c) => ({ ...c, month: m }))
                          setPicker(false)
                        }}
                      >
                        {new Intl.DateTimeFormat(i18n.language, { month: 'short' }).format(new Date(2024, m, 1))}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          {month.isError ? (
            <ErrorState message={month.error.message} />
          ) : (
            <div className="grid grid-cols-7 overflow-hidden rounded-xl border bg-card text-sm" role="grid" aria-label={monthLabel}>
              {weekdays.map((d) => (
                <div key={d} className="border-b bg-muted/50 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground capitalize" role="columnheader">
                  {d}
                </div>
              ))}
              {days.map((d) => {
                const sessions = byDay.get(dayKey(d)) ?? []
                const outside = d.getMonth() !== cursor.month
                const isToday = dayKey(d) === dayKey(today)
                const isSelected = selected && dayKey(d) === dayKey(selected)
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    role="gridcell"
                    aria-selected={!!isSelected}
                    aria-label={new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' }).format(d)}
                    onClick={() => setSelected(isSelected ? null : d)}
                    className={cn(
                      'flex min-h-20 flex-col items-stretch gap-1 border-r border-b p-1 text-left last:border-r-0 hover:bg-muted/60 sm:min-h-24',
                      outside && 'bg-muted/30 text-muted-foreground',
                      isSelected && 'bg-secondary',
                    )}
                  >
                    <span className={cn('self-end rounded-full px-1.5 text-xs', isToday && 'bg-primary text-primary-foreground')}>{d.getDate()}</span>
                    {sessions.slice(0, 3).map((s) => (
                      <span key={s.id} className={cn('truncate rounded px-1 text-xs', s.booked ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary')}>
                        {s.title}
                      </span>
                    ))}
                    {sessions.length > 3 && <span className="text-xs text-muted-foreground">{t('agenda.more', { count: sessions.length - 3 })}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </section>
        <aside className="flex flex-col gap-3" aria-label={selected ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' }).format(selected) : t('agenda.upcoming')}>
          <h2 className="text-lg font-semibold first-letter:uppercase">
            {selected ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' }).format(selected) : t('agenda.upcoming')}
          </h2>
          {selected && canManage && (
            <Button variant="outline" size="sm" className="self-start" onClick={() => setEditing('new')}>
              {t('agenda.newSession')}
            </Button>
          )}
          {(selected ? month.isPending : upcoming.isPending) ? (
            <LoadingState label={t('agenda.loading')} rows={2} />
          ) : panel.length === 0 ? (
            <p className="text-muted-foreground">{selected ? t('agenda.noSession') : t('agenda.noUpcoming')}</p>
          ) : (
            panel.map((s) => <SessionCard key={s.id} session={s} showCourse trainerActions={trainerActions(s)} />)
          )}
        </aside>
      </div>
      <SessionDialog editing={editing} defaultDate={selected ?? undefined} onClose={() => setEditing(null)} />
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('agenda.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('agenda.confirmDeleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault()
                if (deleting) remove.mutate(deleting.id)
              }}
            >
              {t('agenda.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
