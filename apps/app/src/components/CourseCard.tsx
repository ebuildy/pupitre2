import { useTranslation } from '@pupitre/i18n'
import type { CourseSummary, SkillRef } from '@pupitre/shared'
import { CategoryLabel, courseIcon, DifficultyBadge } from '@pupitre/ui'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Card } from '@pupitre/ui/components/ui/card'
import { Progress } from '@pupitre/ui/components/ui/progress'
import { CheckIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

function percentOf(progress: { done: number; total: number } | null) {
  return progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
}

/** "🎯 Linux" chips linking to the skill pages (spec 110). */
export function SkillChips({ skills, max }: { skills: SkillRef[]; max?: number }) {
  return (
    <>
      {skills.slice(0, max).map((s) => (
        <Link key={s.slug} to={`/skills/${s.slug}`} className="relative z-10">
          <Badge variant="outline" className="hover:bg-muted">
            🎯 {s.label}
          </Badge>
        </Link>
      ))}
    </>
  )
}

/** A course's progress bar and "x/y modules · p %". */
export function CourseProgress({ progress }: { progress: { done: number; total: number } }) {
  const { t } = useTranslation('app')
  const percent = percentOf(progress)
  return (
    <div className="flex flex-col gap-1">
      <Progress value={percent} aria-label={t('catalogue.progressLabel', { ...progress, percent })} className="h-1.5" />
      <span className="text-xs text-muted-foreground">{t('catalogue.progressLabel', { ...progress, percent })}</span>
    </div>
  )
}

/** Spec 044. The whole card is clickable through the title link; skill chips stay clickable above it. */
export function CourseCard({ course, footer }: { course: CourseSummary; footer?: ReactNode }) {
  const { t } = useTranslation(['app', 'common'])

  return (
    <Card className="group relative h-full gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
      <div
        className="flex h-28 items-center justify-center overflow-hidden bg-gradient-to-br from-secondary to-muted text-5xl transition-transform"
        aria-hidden="true"
      >
        {course.thumbnailUrl ? (
          <img src={course.thumbnailUrl} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <span className="transition-transform group-hover:scale-110">{courseIcon(course)}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          {course.category ? <CategoryLabel category={course.category} /> : <span />}
          {course.moduleCount > 0 && <span>{t('catalogue.modules', { count: course.moduleCount })}</span>}
        </div>
        <h2 className="leading-snug font-semibold">
          <Link to={`/courses/${course.slug}`} className="after:absolute after:inset-0 hover:text-primary">
            {course.badge && (
              <span className="mr-1" title={course.badge.name} aria-hidden="true">
                {course.badge.icon}
              </span>
            )}
            {course.title}
          </Link>
        </h2>
        {course.progress && course.progress.total > 0 && <CourseProgress progress={course.progress} />}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
          {course.difficulty && <DifficultyBadge difficulty={course.difficulty} />}
          {course.inPerson && <Badge variant="outline">{t('catalogue.inPerson')}</Badge>}
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
          <SkillChips skills={course.skills} max={3} />
        </div>
        {/* Above the stretched title link, so its own links stay clickable. */}
        {footer && <div className="relative z-10">{footer}</div>}
      </div>
    </Card>
  )
}
