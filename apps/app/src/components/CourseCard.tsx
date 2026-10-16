import { useTranslation } from '@pupitre/i18n'
import type { CourseSummary } from '@pupitre/shared'
import { CategoryLabel, categoryIcon, DifficultyBadge } from '@pupitre/ui'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

/** Spec 044 (without progress and skills yet). */
const pill = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'

export function CourseCard({ course, footer }: { course: CourseSummary; footer?: ReactNode }) {
  const { t } = useTranslation(['app', 'common'])

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="flex h-24 items-center justify-center bg-zinc-100 text-4xl dark:bg-zinc-900" aria-hidden="true">
        {categoryIcon(course.category)}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {course.category && (
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            <CategoryLabel category={course.category} />
          </span>
        )}
        <h2 className="font-semibold">
          <Link to={`/courses/${course.slug}`} className="hover:underline">
            {course.title}
          </Link>
        </h2>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          {course.difficulty && <DifficultyBadge difficulty={course.difficulty} />}
          {course.xpRequired > 0 && (
            <span className={`${pill} bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300`}>
              {t('catalogue.xpRequired', { amount: course.xpRequired })}
            </span>
          )}
          {course.completionXp > 0 && (
            <span className={`${pill} bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300`}>
              {t('catalogue.reward', { amount: course.completionXp })}
            </span>
          )}
          {course.completed ? (
            <span className={`${pill} bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300`}>
              ✓ {t('catalogue.completedBadge')}
            </span>
          ) : (
            course.enrolled && (
              <span className={`${pill} bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300`}>
                ✓ {t('catalogue.enrolledBadge')}
              </span>
            )
          )}
        </div>
        {footer}
      </div>
    </article>
  )
}
