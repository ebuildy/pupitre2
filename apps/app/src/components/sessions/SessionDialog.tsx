import { useTranslation } from '@pupitre/i18n'
import type { SessionView } from '@pupitre/shared'
import { toast, unwrap } from '@pupitre/ui'
import { Alert, AlertDescription } from '@pupitre/ui/components/ui/alert'
import { Button } from '@pupitre/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pupitre/ui/components/ui/dialog'
import { Input } from '@pupitre/ui/components/ui/input'
import { Label } from '@pupitre/ui/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { api } from '../../lib/api.ts'

/** `datetime-local` value (local time) of an ISO date. */
function toLocalInput(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Spec 151: "Nouvelle session" / "Modifier la session". `editing` null = closed, 'new' = create. */
export function SessionDialog({
  editing,
  defaultDate,
  onClose,
}: {
  editing: SessionView | 'new' | null
  defaultDate?: Date
  onClose: () => void
}) {
  const { t } = useTranslation(['app', 'common'])
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const courses = useQuery({
    queryKey: ['session-courses'],
    queryFn: () => unwrap(api.api.sessions.courses.$get()),
    enabled: editing === 'new',
  })
  const save = useMutation({
    mutationFn: async (input: {
      courseId: string
      title: string
      startsAt: string
      location: string | null
      capacity: number
    }) => {
      if (editing && editing !== 'new') {
        const { courseId: _, ...rest } = input
        return unwrap(api.api.sessions[':id'].$patch({ param: { id: editing.id }, json: rest }))
      }
      return unwrap(api.api.sessions.$post({ json: input }))
    },
    onSuccess: async () => {
      toast.success(t('agenda.saved'))
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
      onClose()
    },
    onError: (err) => setError(err.message),
  })

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const courseId = editing && editing !== 'new' ? editing.course.id : String(form.get('courseId') ?? '')
    const title = String(form.get('title') ?? '').trim()
    const startsAt = String(form.get('startsAt') ?? '')
    if (!courseId || !title || !startsAt) return setError(t('agenda.form.required'))
    setError(null)
    save.mutate({
      courseId,
      title,
      startsAt: new Date(startsAt).toISOString(),
      location: String(form.get('location') ?? '').trim() || null,
      capacity: Number(form.get('capacity') || 0),
    })
  }

  const existing = editing && editing !== 'new' ? editing : null
  const initialDate = existing
    ? toLocalInput(existing.startsAt)
    : defaultDate
      ? toLocalInput(new Date(defaultDate.getFullYear(), defaultDate.getMonth(), defaultDate.getDate(), 9).toISOString())
      : ''

  return (
    <Dialog
      open={!!editing}
      onOpenChange={(open) => {
        if (!open) {
          setError(null)
          onClose()
        }
      }}
    >
      <DialogContent>
        <form key={existing?.id ?? 'new'} onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{existing ? t('agenda.form.editTitle') : t('agenda.form.newTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('agenda.form.newTitle')}</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!existing && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="session-course">{t('agenda.form.course')}</Label>
              {courses.data && courses.data.courses.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('agenda.form.noCourse')}</p>
              ) : (
                <NativeSelect id="session-course" name="courseId" defaultValue="">
                  <NativeSelectOption value="">{t('agenda.form.chooseCourse')}</NativeSelectOption>
                  {courses.data?.courses.map((c) => (
                    <NativeSelectOption key={c.id} value={c.id}>
                      {c.title}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-title">{t('agenda.form.title')}</Label>
            <Input id="session-title" name="title" defaultValue={existing?.title} placeholder={t('agenda.form.titlePlaceholder')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-starts">{t('agenda.form.startsAt')}</Label>
            <Input id="session-starts" name="startsAt" type="datetime-local" defaultValue={initialDate} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-location">{t('agenda.form.location')}</Label>
            <Input
              id="session-location"
              name="location"
              defaultValue={existing?.location ?? ''}
              placeholder={t('agenda.form.locationPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-capacity">{t('agenda.form.capacity')}</Label>
            <Input id="session-capacity" name="capacity" type="number" min={0} defaultValue={existing?.capacity ?? 1} className="w-32" />
            <p className="text-xs text-muted-foreground">{t('agenda.form.capacityHelp')}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common:cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {existing ? t('common:save') : t('agenda.form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
