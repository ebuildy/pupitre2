import { useTranslation } from '@pupitre/i18n'
import type { ModuleSummary } from '@pupitre/shared'
import { cn } from '@pupitre/ui'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Card } from '@pupitre/ui/components/ui/card'
import { CheckCircle2Icon, FileTextIcon, FlaskConicalIcon, ImageIcon, LockIcon, PuzzleIcon, VideoIcon } from 'lucide-react'
import { Link } from 'react-router'
import { moduleHref } from '../lib/learning.ts'

const TYPE_ICONS: Record<ModuleSummary['type'], typeof FileTextIcon> = {
  text: FileTextIcon,
  video: VideoIcon,
  image: ImageIcon,
  quiz: PuzzleIcon,
  lab: FlaskConicalIcon,
}

/**
 * Spec 053: one row per module, in order. Inline quizzes have no row: their state shows on the lesson before them.
 * Locked rows are not links.
 */
export function ModuleList({ courseSlug, modules }: { courseSlug: string; modules: ModuleSummary[] }) {
  const { t } = useTranslation('app')

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <ol className="divide-y">
        {modules.map((m, i) => {
          if (m.inline) return null
          const inlineQuiz = modules[i + 1]?.inline ? modules[i + 1] : undefined
          const Icon = m.locked ? LockIcon : m.done ? CheckCircle2Icon : TYPE_ICONS[m.type]
          const row = (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full',
                  m.locked ? 'bg-muted text-muted-foreground' : m.done ? 'bg-success-soft text-success' : 'bg-secondary text-primary',
                )}
                aria-hidden="true"
              >
                <Icon className="size-4" />
              </span>
              <span className={cn('min-w-0 flex-1 truncate font-medium', m.locked && 'text-muted-foreground')}>{m.name}</span>
              <span className="flex flex-wrap justify-end gap-1">
                {m.hidden && (
                  <Badge variant="destructive" className="bg-destructive/15 text-destructive">
                    {t('course.hiddenBadge')}
                  </Badge>
                )}
                {m.type !== 'text' && <Badge variant="muted">{t(`course.moduleTypes.${m.type}`)}</Badge>}
                {m.locked && <Badge variant="muted">{t('course.locked')}</Badge>}
                {m.results && m.results.attempts > 0 && (
                  <Badge variant="outline">{t('course.attempts', { count: m.results.attempts })}</Badge>
                )}
                {m.results?.passed && (
                  <Badge variant="success">{t('course.quizScore', { score: m.results.bestScore, max: m.results.maxScore })}</Badge>
                )}
                {m.type !== 'quiz' && m.done && <Badge variant="success">{t('course.viewed')}</Badge>}
                {inlineQuiz && (
                  <Badge variant={inlineQuiz.done ? 'success' : 'xp'}>
                    {inlineQuiz.done ? t('course.inlineQuizDone') : t('course.inlineQuizPending')}
                  </Badge>
                )}
              </span>
            </div>
          )
          return (
            <li key={m.slug} data-testid={`module-${m.slug}`}>
              {m.locked ? (
                <div aria-disabled="true">{row}</div>
              ) : (
                <Link to={moduleHref(courseSlug, m)} className="block transition-colors hover:bg-muted/60">
                  {row}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
