import { Alert, AlertDescription } from '@pupitre/ui/components/ui/alert'
import { Skeleton } from '@pupitre/ui/components/ui/skeleton'
import { cn } from '@pupitre/ui/lib/utils'
import { CircleAlertIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Page title, optional subtitle and actions (right-aligned on wide screens). */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Centered message for an empty list, with an optional icon (emoji) and action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      {icon && (
        <span className="text-4xl" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="font-semibold">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** Loading placeholder; `label` is announced to screen readers and shown under the skeletons. */
export function LoadingState({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

/** An error message (`role="alert"`). */
export function ErrorState({ message, className }: { message: ReactNode; className?: string }) {
  return (
    <Alert variant="destructive" className={className}>
      <CircleAlertIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
