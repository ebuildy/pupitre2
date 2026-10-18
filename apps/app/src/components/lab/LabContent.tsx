import { useTranslation } from '@pupitre/i18n'
import type { LabCheckResult, LabStepCheckResponse, LabView } from '@pupitre/shared'
import { cn, unwrap } from '@pupitre/ui'
import { Alert, AlertDescription } from '@pupitre/ui/components/ui/alert'
import { Button } from '@pupitre/ui/components/ui/button'
import { useMutation } from '@tanstack/react-query'
import { ExternalLinkIcon } from 'lucide-react'
import { Fragment, type RefObject } from 'react'
import { api } from '../../lib/api.ts'

type TauriInvoke = (command: string, args: Record<string, unknown>) => Promise<LabCheckResult>

/** Spec 093: inside the desktop app (Tauri), local checks run on the learner's machine. */
function tauriInvoke(): TauriInvoke | null {
  const tauri = (window as unknown as { __TAURI__?: { core?: { invoke?: TauriInvoke }; invoke?: TauriInvoke } }).__TAURI__
  return tauri?.core?.invoke ?? tauri?.invoke ?? null
}

const STEP_SLOT = /<div data-lab-step="(\d+)"><\/div>/

/** Spec 090: the instructions with each step's check block where its `<!-- check:N -->` marker was. */
export function LabContent({
  html,
  lab,
  courseSlug,
  moduleSlug,
  contentRef,
  onChecked,
}: {
  html: string
  lab: LabView
  courseSlug: string
  moduleSlug: string
  contentRef: RefObject<HTMLDivElement | null>
  onChecked: (result: LabStepCheckResponse) => void
}) {
  const { t } = useTranslation('app')
  const parts = html.split(STEP_SLOT)
  const done = lab.steps.filter((s) => s.passed).length

  return (
    <div className="flex flex-col gap-4" ref={contentRef}>
      {lab.labUrl && (
        <Button asChild variant="outline" className="self-start">
          <a href={lab.labUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon />
            {t('lab.open')}
          </a>
        </Button>
      )}
      {lab.steps.length > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="lab-progress">
          {t('lab.progress', { done, total: lab.steps.length })}
        </p>
      )}
      <div className="content prose prose-neutral max-w-none dark:prose-invert prose-a:text-primary" data-testid="lesson-content">
        {parts.map((part, i) =>
          i % 2 === 0 ? (
            <div key={i} dangerouslySetInnerHTML={{ __html: part }} />
          ) : (
            <Fragment key={i}>
              <StepBlock lab={lab} index={Number(part)} courseSlug={courseSlug} moduleSlug={moduleSlug} onChecked={onChecked} />
            </Fragment>
          ),
        )}
      </div>
      {lab.steps.length > 0 && done === lab.steps.length && (
        <Alert variant="success">
          <AlertDescription className="text-current">{t('lab.allPassed')}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function StepBlock({
  lab,
  index,
  courseSlug,
  moduleSlug,
  onChecked,
}: {
  lab: LabView
  index: number
  courseSlug: string
  moduleSlug: string
  onChecked: (result: LabStepCheckResponse) => void
}) {
  const { t } = useTranslation('app')
  const step = lab.steps[index]
  const invoke = lab.provider === 'local' ? tauriInvoke() : null
  const check = useMutation({
    mutationFn: async () => {
      const param = { slug: courseSlug, moduleSlug, index: String(index) }
      if (lab.provider === 'gitlab') return unwrap(api.api.courses[':slug'].modules[':moduleSlug'].steps[':index'].check.$post({ param }))
      const result = await invoke!('local_check', { checkType: step!.checkType, params: step!.checkParams })
      return unwrap(
        api.api.courses[':slug'].modules[':moduleSlug'].steps[':index'].record.$post({
          param,
          json: { allow: result.allow, violations: result.violations ?? [] },
        }),
      )
    },
    onSuccess: onChecked,
  })
  if (!step) return null
  const result = check.data ?? step.lastCheck

  return (
    <section
      className={cn(
        'not-prose my-4 flex flex-col gap-2 rounded-xl border p-4',
        step.passed ? 'border-success/40 bg-success-soft' : 'bg-card',
      )}
      data-testid={`lab-step-${index}`}
    >
      <h3 className="font-semibold">{t('lab.step', { title: step.title })}</h3>
      {lab.provider === 'local' && !invoke ? (
        <p className="text-sm">
          {t('lab.localOnly')}{' '}
          <a href={`pupitre://courses/${courseSlug}/modules/${moduleSlug}`} className="font-medium text-primary hover:underline">
            {t('lab.openInApp')}
          </a>
        </p>
      ) : (
        <Button size="sm" variant={step.passed ? 'outline' : 'default'} className="self-start" disabled={check.isPending} onClick={() => check.mutate()}>
          {check.isPending ? t('lab.checking') : t('lab.check')}
        </Button>
      )}
      {check.isError ? (
        <p className="text-sm text-destructive">{check.error.message || t('lab.error')}</p>
      ) : (
        result && (
          <div className="text-sm" role="status">
            {result.allow ? (
              <span className="font-medium text-success">{t('lab.passed')}</span>
            ) : (
              <>
                <span className="font-medium text-destructive">{t('lab.failed')}</span>
                <ul className="mt-1 list-disc pl-5">
                  {result.violations.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )
      )}
    </section>
  )
}
