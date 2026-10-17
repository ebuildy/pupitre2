import { useTranslation } from '@pupitre/i18n'
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
import { type FormEvent, useId } from 'react'

/** A dialog asking for one name (new group, new subgroup…). */
export function NameDialog({
  open,
  title,
  label,
  placeholder,
  submitLabel,
  pending,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  title: string
  label: string
  placeholder: string
  submitLabel: string
  pending: boolean
  error?: string
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => void
}) {
  const { t } = useTranslation('common')
  const id = useId()
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim()
    if (name) onSubmit(name)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{label}</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input id={id} name="name" placeholder={placeholder} required autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
