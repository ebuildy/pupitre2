import { useSession } from '@pupitre/auth-ui'
import { useTranslation } from '@pupitre/i18n'
import { courseIcon, sortByTitle, unwrap } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card } from '@pupitre/ui/components/ui/card'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../lib/api.ts'
import { CourseProgress } from './CourseCard.tsx'

/**
 * Spec 043: "Reprendre": the most recently worked-on course in progress, else the first enrolled open course.
 * Hidden when signed out or enrolled nowhere.
 */
export function ContinueHero() {
  const { t } = useTranslation('app')
  const { data: session } = useSession()
  const { data } = useQuery({
    queryKey: ['my-courses'],
    queryFn: () => unwrap(api.api.my.courses.$get()),
    enabled: !!session,
  })
  if (!session || !data) return null
  const open = sortByTitle(data.courses.filter((c) => c.status === 'published' && !c.completed))
  const inProgress = open
    .filter((c) => c.progress && c.progress.done > 0 && c.progress.done < c.progress.total)
    .sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''))
  const course = inProgress[0] ?? open[0]
  if (!course) return null

  return (
    <Card className="flex-row items-center gap-5 bg-gradient-to-r from-secondary to-card p-5" data-testid="continue-hero">
      <span className="hidden text-5xl sm:block" aria-hidden="true">
        {courseIcon(course)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-xs font-semibold tracking-wide text-primary uppercase">{t('catalogue.heroLabel')}</span>
        <h2 className="truncate text-xl font-semibold">{course.title}</h2>
        {course.progress && course.progress.total > 0 && <CourseProgress progress={course.progress} />}
      </div>
      <Button asChild>
        <Link to={`/courses/${course.slug}`}>{t('catalogue.heroCta')}</Link>
      </Button>
    </Card>
  )
}
