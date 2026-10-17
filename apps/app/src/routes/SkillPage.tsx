import { useTranslation } from '@pupitre/i18n'
import { DIFFICULTIES, type SkillModuleStatus } from '@pupitre/shared'
import { DifficultyBadge, ErrorState, isNotFound, LoadingState, PageHeader, unwrap } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@pupitre/ui/components/ui/card'
import { Progress } from '@pupitre/ui/components/ui/progress'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2Icon, CircleIcon, LockIcon } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../lib/api.ts'

const STATUS_ICONS: Record<SkillModuleStatus, typeof CircleIcon> = {
  completed: CheckCircle2Icon,
  available: CircleIcon,
  locked: LockIcon,
}

/** Specs 111, 112: courses teaching the skill, grouped by difficulty, with the modules and their status. */
export function SkillPage() {
  const { slug = '' } = useParams()
  const { t } = useTranslation(['app', 'common'])
  const navigate = useNavigate()
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['skill', slug],
    queryFn: () => unwrap(api.api.skills[':slug'].$get({ param: { slug } })),
  })

  if (isPending) return <LoadingState label={t('skill.loading')} />
  if (isError) return <ErrorState message={isNotFound(error) ? t('skill.notFound') : error.message} />

  const groups = [...DIFFICULTIES, null].map((d) => ({
    key: (d ?? 'other') as (typeof DIFFICULTIES)[number] | 'other',
    courses: data.courses.filter((c) => c.difficulty === d),
  }))

  return (
    <div className="flex flex-col gap-6">
      {/* Back through history: returns to a path page when opened from one. */}
      <button type="button" className="self-start text-sm text-muted-foreground hover:text-foreground" onClick={() => navigate(-1)}>
        {t('skill.back')}
      </button>
      <PageHeader
        title={`🎯 ${data.skill.label}`}
        description={data.skill.description ?? t('skill.intro', { name: data.skill.label })}
        actions={
          <Button asChild variant="outline">
            <Link to={`/courses?skill=${data.skill.slug}`}>{t('skill.catalogue')}</Link>
          </Button>
        }
      />
      {data.level && (
        <p className="text-sm" data-testid="skill-level">
          {t('skill.yourLevel', { level: t(`common:skillLevels.${data.level}`) })}
        </p>
      )}
      {groups
        .filter((g) => g.courses.length > 0)
        .map((g) => (
          <section key={g.key} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t(`skill.groups.${g.key}`)}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {g.courses.map((c) => (
                <Card key={c.slug} className="gap-3" data-testid={`skill-course-${c.slug}`}>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <Link to={`/courses/${c.slug}`} className="hover:underline">
                        {c.title}
                      </Link>
                      {c.difficulty && <DifficultyBadge difficulty={c.difficulty} />}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <Progress value={(c.done / c.modules.length) * 100} className="h-1.5" />
                    <span className="text-xs text-muted-foreground">
                      {t('skill.modulesDone', { done: c.done, total: c.modules.length })}
                    </span>
                    <ul className="flex flex-col gap-1 text-sm">
                      {c.modules.map((m) => {
                        const Icon = m.status ? STATUS_ICONS[m.status] : CircleIcon
                        return (
                          <li key={m.slug} className="flex items-center gap-2">
                            <Icon
                              className={`size-4 ${m.status === 'completed' ? 'text-success' : 'text-muted-foreground'}`}
                              aria-label={m.status ? t(`skill.status.${m.status}`) : undefined}
                            />
                            <span className={m.status === 'locked' ? 'text-muted-foreground' : ''}>{m.name}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
    </div>
  )
}
