import { useTranslation } from '@pupitre/i18n'
import { passwordChecks, type PublicSettings } from '@pupitre/shared'
import { cn } from '@pupitre/ui'
import { CheckIcon, CircleIcon } from 'lucide-react'

/** Spec 022: the policy as a live checklist, for guidance (the server checks it too). */
export function PasswordChecklist({ password, policy }: { password: string; policy: PublicSettings }) {
  const { t } = useTranslation('auth')
  return (
    <ul className="flex flex-col gap-1 text-sm" aria-live="polite" data-testid="password-rules">
      {passwordChecks(password, policy).map(({ rule, ok, min }) => (
        <li key={rule} className={cn('flex items-center gap-2', ok ? 'text-success' : 'text-muted-foreground')}>
          {ok ? <CheckIcon className="size-3.5" aria-hidden="true" /> : <CircleIcon className="size-3.5" aria-hidden="true" />}
          <span>{t(`passwordRules.${rule}`, { count: min ?? 0 })}</span>
          {ok && <span className="sr-only">✓</span>}
        </li>
      ))}
    </ul>
  )
}
