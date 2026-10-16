import { useTranslation } from '@pupitre/i18n'
import type { ModuleSummary } from '@pupitre/shared'
import { Link } from 'react-router'
import { moduleHref } from '../lib/learning.ts'

const TYPE_ICONS: Record<ModuleSummary['type'], string> = { text: '📄', video: '🎬', image: '🖼️', quiz: '🧩', lab: '🧪' }

const badge = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'

/**
 * Spec 053: one row per module, in order. Inline quizzes have no row: their state shows on the lesson before them.
 * Locked rows are not links.
 */
export function ModuleList({ courseSlug, modules }: { courseSlug: string; modules: ModuleSummary[] }) {
  const { t } = useTranslation('app')

  return (
    <ol className="flex flex-col divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
      {modules.map((m, i) => {
        if (m.inline) return null
        const inlineQuiz = modules[i + 1]?.inline ? modules[i + 1] : undefined
        const row = (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-xl" aria-hidden="true">
              {m.locked ? '🔒' : TYPE_ICONS[m.type]}
            </span>
            <span className={`min-w-0 flex-1 truncate font-medium ${m.locked ? 'text-zinc-400' : ''}`}>{m.name}</span>
            <span className="flex flex-wrap justify-end gap-1">
              {m.hidden && <span className={`${badge} bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300`}>{t('course.hiddenBadge')}</span>}
              {m.type !== 'text' && (
                <span className={`${badge} bg-zinc-100 dark:bg-zinc-800`}>{t(`course.moduleTypes.${m.type}`)}</span>
              )}
              {m.locked && <span className={`${badge} bg-zinc-100 text-zinc-500 dark:bg-zinc-800`}>{t('course.locked')}</span>}
              {m.results && m.results.attempts > 0 && (
                <span className={`${badge} bg-zinc-100 dark:bg-zinc-800`}>{t('course.attempts', { count: m.results.attempts })}</span>
              )}
              {m.results?.passed && (
                <span className={`${badge} bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300`}>
                  {t('course.quizScore', { score: m.results.bestScore, max: m.results.maxScore })}
                </span>
              )}
              {m.type !== 'quiz' && m.done && (
                <span className={`${badge} bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300`}>{t('course.viewed')}</span>
              )}
              {inlineQuiz && (
                <span
                  className={`${badge} ${
                    inlineQuiz.done
                      ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                      : 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
                  }`}
                >
                  {inlineQuiz.done ? t('course.inlineQuizDone') : t('course.inlineQuizPending')}
                </span>
              )}
            </span>
          </div>
        )
        return (
          <li key={m.slug} data-testid={`module-${m.slug}`}>
            {m.locked ? (
              <div aria-disabled="true">{row}</div>
            ) : (
              <Link to={moduleHref(courseSlug, m)} className="block hover:bg-zinc-50 dark:hover:bg-zinc-900">
                {row}
              </Link>
            )}
          </li>
        )
      })}
    </ol>
  )
}
