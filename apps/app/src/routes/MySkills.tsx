import { useTranslation } from '@pupitre/i18n'
import { EmptyState, ErrorState, LoadingState, SkillLevelBadge, unwrap } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card } from '@pupitre/ui/components/ui/card'
import { Progress } from '@pupitre/ui/components/ui/progress'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../lib/api.ts'

/** Spec 114: one card per skill with a level; "En cours" for skills of unfinished courses. A tab of the profile page. */
export function MySkills() {
  const { t } = useTranslation('app')
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['my-skills'],
    queryFn: () => unwrap(api.api.my.skills.$get()),
  })
  if (isPending) return <LoadingState label={t('mySkills.loading')} />
  if (isError) return <ErrorState message={error.message} />

  return (
    <div className="flex flex-col gap-6">
      {data.skills.length === 0 && data.inProgress.length === 0 ? (
        <EmptyState
          icon="🎯"
          title={t('mySkills.empty')}
          action={
            <Button asChild>
              <Link to="/courses">{t('mySkills.browse')}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.skills.map((s) => (
            <li key={s.slug} data-testid={`skill-${s.slug}`}>
              <Link to={`/skills/${s.slug}`} className="block h-full">
                <Card
                  className={`h-full gap-3 p-4 transition-shadow hover:shadow-md ${s.level === 'master' ? 'border-xp bg-xp-soft' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">🎯 {s.label}</span>
                    <SkillLevelBadge level={s.level} />
                  </div>
                  <Progress value={s.totalCourses ? (s.completedCourses / s.totalCourses) * 100 : 0} className="h-1.5" />
                  <span className="text-xs text-muted-foreground">
                    {t('mySkills.coursesProgress', { completed: s.completedCourses, total: s.totalCourses })}
                  </span>
                </Card>
              </Link>
            </li>
          ))}
          {data.inProgress.map((s) => (
            <li key={s.slug} data-testid={`skill-${s.slug}`}>
              <Link to={`/skills/${s.slug}`} className="block h-full">
                <Card className="h-full gap-2 border-dashed p-4 transition-shadow hover:shadow-md">
                  <span className="font-semibold">🎯 {s.label}</span>
                  <span className="text-xs text-muted-foreground">{t('mySkills.inProgress')}</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
