import { useTranslation } from '@pupitre/i18n'
import type { QuestionCooldown, QuizAnswer, QuizQuestionView, QuizResult, QuizView } from '@pupitre/shared'
import { cn, ErrorState } from '@pupitre/ui'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Button } from '@pupitre/ui/components/ui/button'
import { Progress } from '@pupitre/ui/components/ui/progress'
import { useMutation } from '@tanstack/react-query'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, GripVerticalIcon, PuzzleIcon } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { CooldownActiveError, submitQuiz } from '../../lib/learning.ts'
import { QuizResultPanel } from './QuizResultPanel.tsx'

type Cooldowns = Record<string, { until: number; attempts: number; locked: boolean }>

function toCooldowns(raw: Record<string, QuestionCooldown>): Cooldowns {
  const now = Date.now()
  return Object.fromEntries(
    Object.entries(raw).map(([key, c]) => [key, { until: now + c.remainingSeconds * 1000, attempts: c.attempts, locked: c.locked }]),
  )
}

function initialAnswers(quiz: QuizView): Record<string, QuizAnswer> {
  // Order questions start in the authored order (spec 076).
  return Object.fromEntries(
    quiz.questions.filter((q) => q.type === 'order').map((q) => [q.key, { order: q.items!.map((it) => it.id) }]),
  )
}

/** Blocks copy, cut and the context menu on quiz content (spec 084), except in form fields. */
function preventCopy(e: { target: EventTarget; preventDefault(): void }) {
  if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault()
}

/**
 * Specs 076–084: answers a quiz, shows cooldowns and locks, submits, then shows the result. Used by the full quiz page
 * and by the mini-quiz at the bottom of a lesson.
 */
export function QuizForm({
  courseSlug,
  moduleSlug,
  quiz,
  variant,
  onSubmitted,
  resultActions,
}: {
  courseSlug: string
  moduleSlug: string
  quiz: QuizView
  variant: 'full' | 'inline'
  onSubmitted?: (result: QuizResult) => void
  /** Extra buttons on the result screen (next module, back to the course…). */
  resultActions?: (result: QuizResult) => ReactNode
}) {
  const { t } = useTranslation(['app', 'common'])
  const [answers, setAnswers] = useState(() => initialAnswers(quiz))
  const [result, setResult] = useState<QuizResult | null>(null)
  const [cooldowns, setCooldowns] = useState(() => toCooldowns(quiz.cooldowns))
  const [now, setNow] = useState(() => Date.now())

  // Live countdown while a question is cooling down.
  const cooling = Object.values(cooldowns).some((c) => c.until > now)
  useEffect(() => {
    if (!cooling) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [cooling])

  const submit = useMutation({
    mutationFn: () => submitQuiz(courseSlug, moduleSlug, answers),
    onSuccess: (r) => {
      setResult(r)
      setCooldowns(toCooldowns(r.cooldowns))
      setNow(Date.now())
      onSubmitted?.(r)
    },
    onError: (err) => {
      if (err instanceof CooldownActiveError) {
        setCooldowns(toCooldowns(err.body.cooldowns))
        setNow(Date.now())
      }
    },
  })

  const blocked = (key: string) => {
    const c = cooldowns[key]
    return !!c && (c.locked || c.until > now)
  }
  const answeredCount = quiz.questions.filter((q) => answers[q.key] !== undefined).length

  if (result) {
    return (
      <QuizResultPanel
        quiz={quiz}
        result={result}
        variant={variant}
        retryDisabled={cooling}
        onRetry={() => {
          setResult(null)
          setAnswers(initialAnswers(quiz))
          submit.reset()
        }}
        actions={resultActions?.(result)}
      />
    )
  }

  const submitButton = (
    <Button type="button" disabled={submit.isPending || cooling} onClick={() => submit.mutate()} className="w-full sm:w-auto">
      {submit.isPending ? t('quiz.submitting') : variant === 'full' ? t('quiz.submit') : t('quiz.submitInline')}
    </Button>
  )

  const questions = (
    <ol className="flex flex-col gap-4">
      {quiz.questions.map((q, i) => (
        <li
          key={q.key}
          id={`question-${i + 1}`}
          className={cn(
            'scroll-mt-32 rounded-xl border bg-card p-5 shadow-xs transition-colors',
            answers[q.key] !== undefined && 'border-primary/40',
          )}
        >
          <QuestionCard
            number={i + 1}
            question={q}
            answer={answers[q.key]}
            disabled={blocked(q.key) || submit.isPending}
            cooldown={cooldowns[q.key]}
            now={now}
            onChange={(a) => setAnswers((prev) => ({ ...prev, [q.key]: a }))}
          />
        </li>
      ))}
    </ol>
  )

  const error = submit.error && !(submit.error instanceof CooldownActiveError) && <ErrorState message={submit.error.message} />

  if (variant === 'inline') {
    return (
      <section
        className="flex flex-col gap-4 rounded-2xl border border-xp/30 bg-xp-soft/50 p-5"
        onCopy={preventCopy}
        onCut={preventCopy}
        onContextMenu={preventCopy}
        data-testid="inline-quiz"
      >
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <PuzzleIcon className="size-5 text-xp" aria-hidden="true" />
          {t('quiz.miniQuiz')}
          {quiz.title && <span className="font-normal text-muted-foreground">— {quiz.title}</span>}
        </h2>
        {questions}
        {error}
        <div>{submitButton}</div>
      </section>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_16rem]" onCopy={preventCopy} onCut={preventCopy} onContextMenu={preventCopy}>
      <div className="flex flex-col gap-4">
        {questions}
        {error}
        <div className="lg:hidden">{submitButton}</div>
      </div>
      <aside className="hidden flex-col gap-3 self-start rounded-xl border bg-card p-4 shadow-xs lg:sticky lg:top-32 lg:flex">
        <h2 className="font-semibold">{t('quiz.navigation')}</h2>
        <div className="flex flex-wrap gap-2">
          {quiz.questions.map((q, i) => (
            <a
              key={q.key}
              href={`#question-${i + 1}`}
              className={cn(
                'flex size-8 items-center justify-center rounded-full text-sm font-medium transition-colors',
                answers[q.key] !== undefined ? 'bg-primary text-primary-foreground' : 'border hover:bg-muted',
              )}
            >
              {i + 1}
            </a>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {t('quiz.answered', { answered: answeredCount, total: quiz.questions.length })}
        </p>
        <Progress value={(answeredCount / quiz.questions.length) * 100} className="h-1.5" />
        {submitButton}
        <p className="text-xs text-muted-foreground">{t('quiz.paletteHint')}</p>
      </aside>
    </div>
  )
}

function QuestionCard({
  number,
  question: q,
  answer,
  disabled,
  cooldown,
  now,
  onChange,
}: {
  number: number
  question: QuizQuestionView
  answer: QuizAnswer | undefined
  disabled: boolean
  cooldown: Cooldowns[string] | undefined
  now: number
  onChange: (answer: QuizAnswer) => void
}) {
  const { t } = useTranslation('app')
  const option = (selected: boolean) =>
    cn(
      'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60',
      selected ? 'border-primary bg-secondary text-secondary-foreground' : 'hover:bg-muted',
    )
  const mark = (selected: boolean, shape: 'circle' | 'square') =>
    cn(
      'flex size-4 shrink-0 items-center justify-center border',
      shape === 'circle' ? 'rounded-full' : 'rounded-sm',
      selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
    )

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="sr-only">{t('quiz.question', { number })}</legend>
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-2">
          <span className="font-semibold text-primary">{number}.</span>
          <div className="content prose prose-neutral max-w-none dark:prose-invert prose-p:my-0" dangerouslySetInnerHTML={{ __html: q.prompt }} />
        </div>
        <Badge variant="outline" className="shrink-0">
          {t('quiz.points', { count: q.points })}
        </Badge>
      </div>

      {cooldown?.locked ? (
        <p className="text-sm font-medium text-destructive" role="status">
          {t('quiz.lockedQuestion')}
        </p>
      ) : cooldown && cooldown.until > now ? (
        <p className="text-sm font-medium text-warning-foreground" role="status">
          {t('quiz.cooldown', { seconds: Math.ceil((cooldown.until - now) / 1000) })}
        </p>
      ) : null}

      {q.type === 'single' &&
        q.answers!.map((a) => {
          const selected = !!answer && 'single' in answer && answer.single === a.id
          return (
            <button key={a.id} type="button" role="radio" aria-checked={selected} className={option(selected)} onClick={() => onChange({ single: a.id })}>
              <span className={mark(selected, 'circle')} aria-hidden="true">
                {selected && <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <span dangerouslySetInnerHTML={{ __html: a.html }} />
            </button>
          )
        })}

      {q.type === 'multiple' &&
        q.answers!.map((a) => {
          const chosen = answer && 'multiple' in answer ? answer.multiple : []
          const selected = chosen.includes(a.id)
          return (
            <button
              key={a.id}
              type="button"
              role="checkbox"
              aria-checked={selected}
              className={option(selected)}
              onClick={() => onChange({ multiple: selected ? chosen.filter((id) => id !== a.id) : [...chosen, a.id] })}
            >
              <span className={mark(selected, 'square')} aria-hidden="true">
                {selected && <CheckIcon className="size-3" />}
              </span>
              <span dangerouslySetInnerHTML={{ __html: a.html }} />
            </button>
          )
        })}

      {q.type === 'boolean' && (
        <div className="flex gap-2">
          {[true, false].map((value) => {
            const selected = !!answer && 'boolean' in answer && answer.boolean === value
            return (
              <button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={selected}
                className={cn(option(selected), 'w-auto justify-center px-8')}
                onClick={() => onChange({ boolean: value })}
              >
                {value ? t('quiz.true') : t('quiz.false')}
              </button>
            )
          })}
        </div>
      )}

      {q.type === 'order' && answer && 'order' in answer && (
        <ol className="flex flex-col gap-2">
          {answer.order.map((id, i) => {
            const item = q.items!.find((it) => it.id === id)!
            const move = (to: number) => {
              const order = [...answer.order]
              order.splice(i, 1)
              order.splice(to, 0, id)
              onChange({ order })
            }
            return (
              <li key={id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                <GripVerticalIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="w-5 text-muted-foreground">{i + 1}.</span>
                <span className="flex-1" dangerouslySetInnerHTML={{ __html: item.html }} />
                <Button type="button" variant="outline" size="icon" className="size-7" aria-label={t('quiz.moveUp')} disabled={i === 0} onClick={() => move(i - 1)}>
                  <ArrowUpIcon />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-7"
                  aria-label={t('quiz.moveDown')}
                  disabled={i === answer.order.length - 1}
                  onClick={() => move(i + 1)}
                >
                  <ArrowDownIcon />
                </Button>
              </li>
            )
          })}
        </ol>
      )}
    </fieldset>
  )
}
