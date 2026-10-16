import { useTranslation } from '@pupitre/i18n'
import type { CourseSummary } from '@pupitre/shared'
import { CategoryLabel, categoryIcon, DifficultyBadge } from '@pupitre/ui'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Card } from '@pupitre/ui/components/ui/card'
import { CheckIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

/** Spec 044 (without progress and skills yet). The whole card is clickable through the title link. */
export function CourseCard({ course, footer }: { course: CourseSummary; footer?: ReactNode }) {
  const { t } = useTranslation(['app', 'common'])

  return (
    <Card className="group relative h-full gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
      <div
        className="flex h-28 items-center justify-center bg-gradient-to-br from-secondary to-muted text-5xl transition-transform"
        aria-hidden="true"
      >
        <span className="transition-transform group-hover:scale-110">{categoryIcon(course.category)}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        {course.category && (
          <span className="text-xs text-muted-foreground">
            <CategoryLabel category={course.category} />
          </span>
        )}
        <h2 className="leading-snug font-semibold">
          <Link to={`/courses/${course.slug}`} className="after:absolute after:inset-0 hover:text-primary">
            {course.title}
          </Link>
        </h2>
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
          {course.difficulty && <DifficultyBadge difficulty={course.difficulty} />}
          {course.xpRequired > 0 && <Badge variant="warning">{t('catalogue.xpRequired', { amount: course.xpRequired })}</Badge>}
          {course.completionXp > 0 && <Badge variant="xp">{t('catalogue.reward', { amount: course.completionXp })}</Badge>}
          {course.completed ? (
            <Badge variant="success">
              <CheckIcon />
              {t('catalogue.completedBadge')}
            </Badge>
          ) : (
            course.enrolled && (
              <Badge variant="info">
                <CheckIcon />
                {t('catalogue.enrolledBadge')}
              </Badge>
            )
          )}
        </div>
        {/* Above the stretched title link, so its own links stay clickable. */}
        {footer && <div className="relative z-10">{footer}</div>}
      </div>
    </Card>
  )
}
