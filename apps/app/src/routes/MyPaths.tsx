import { useTranslation } from '@pupitre/i18n'
import { DIFFICULTIES, type MyPath, type PathItemStatus } from '@pupitre/shared'
import { EmptyState, ErrorState, LoadingState, PageHeader, unwrap } from '@pupitre/ui'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pupitre/ui/components/ui/card'
import { Progress } from '@pupitre/ui/components/ui/progress'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { SkillChips } from '../components/CourseCard.tsx'
import { api } from '../lib/api.ts'
import { rememberReturnPath } from '../lib/return-path.ts'

function useMyPaths() {
  return useQuery({ queryKey: ['my-paths'], queryFn: () => unwrap(api.api.my.paths.$get()) })
}

function LevelLabel({ level }: { level: MyPath['level'] }) {
  const { t } = useTranslation()
  if (!level) return null
  return (
    <Badge variant="outline">
      {t('pathLevel', { n: DIFFICULTIES.indexOf(level) + 1, name: t(`difficulty.${level}`) })}
    </Badge>
  )
}

/** Spec 123, list view: one card per path with its progress. */
export function MyPaths() {
  const { t } = useTranslation(['app', 'common'])
  const { data, isPending, isError, error } = useMyPaths()
  if (isPending) return <LoadingState label={t('myPaths.loading')} />
  if (isError) return <ErrorState message={error.message} />

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('myPaths.title')} description={t('myPaths.subtitle', { count: data.paths.length })} />
      {data.paths.length === 0 ? (
        <EmptyState
          icon="🗺️"
          title={t('myPaths.empty')}
          action={
            <Button asChild>
              <Link to="/courses">{t('myPaths.emptyCta')}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {data.paths.map((p) => (
            <li key={p.slug}>
              <Link to={`/my-paths/${p.slug}`} className="block h-full">
                <Card className="h-full transition-shadow hover:shadow-md" data-testid={`my-path-${p.slug}`}>
                  <CardHeader>
                    <div className="flex flex-wrap gap-2">
                      <LevelLabel level={p.level} />
                      <Badge variant="muted">{t(`common:pathKinds.${p.kind}`)}</Badge>
                    </div>
                    <CardTitle>
                      <h2>{p.title}</h2>
                    </CardTitle>
                    {p.description && <CardDescription>{p.description}</CardDescription>}
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1">
                    <Progress value={p.progress.length ? (p.completed / p.progress.length) * 100 : 0} className="h-1.5" />
                    <span className="text-sm text-muted-foreground">
                      {t('myPaths.progress', { done: p.completed, total: p.progress.length })}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const NODE_CLASSES: Record<PathItemStatus, { circle: string; text: string }> = {
  completed: { circle: 'fill-success stroke-success', text: 'fill-success-foreground' },
  available: { circle: 'fill-primary stroke-primary animate-pulse', text: 'fill-primary-foreground' },
  locked: { circle: 'fill-muted stroke-border', text: 'fill-muted-foreground' },
}

/** Spec 123, detail view: a winding road with one numbered node per member, coloured by status. */
export function MyPathDetail() {
  const { slug = '' } = useParams()
  const { t } = useTranslation(['app', 'common'])
  const { data, isPending, isError, error } = useMyPaths()
  if (isPending) return <LoadingState label={t('myPaths.loading')} />
  if (isError) return <ErrorState message={error.message} />
  const path = data.paths.find((p) => p.slug === slug)

  return (
    <div className="flex flex-col gap-6">
      <Link to="/my-paths" className="text-sm text-muted-foreground hover:text-foreground">
        {t('myPaths.back')}
      </Link>
      {!path ? (
        <ErrorState message={t('myPaths.notFound')} />
      ) : (
        <>
          <PageHeader title={path.title} description={path.description ?? undefined} />
          <div className="flex flex-wrap items-center gap-2">
            <LevelLabel level={path.level} />
            <span className="text-sm text-muted-foreground">
              {t('myPaths.progress', { done: path.completed, total: path.progress.length })}
            </span>
          </div>
          {path.kind === 'course' && path.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <SkillChips skills={path.skills} />
            </div>
          )}
          <Roadmap path={path} />
        </>
      )}
    </div>
  )
}

function Roadmap({ path }: { path: MyPath }) {
  const { t } = useTranslation(['app', 'common'])
  const step = 110
  const width = 640
  const height = Math.max(1, path.progress.length) * step + 40
  // Nodes alternate left / right; the road is a smooth curve through them.
  const points = path.progress.map((_, i) => ({ x: i % 2 === 0 ? 170 : width - 170, y: 60 + i * step }))
  const road = points
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`
      const prev = points[i - 1]!
      const midY = (prev.y + p.y) / 2
      return `C ${prev.x} ${midY}, ${p.x} ${midY}, ${p.x} ${p.y}`
    })
    .join(' ')

  return (
    <figure className="overflow-x-auto rounded-2xl border bg-card p-4" aria-label={t('myPaths.roadmap')}>
      <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto w-full max-w-2xl" role="presentation">
        <path d={road} className="fill-none stroke-muted" strokeWidth={28} strokeLinecap="round" />
        <path d={road} className="fill-none stroke-border" strokeWidth={2} strokeDasharray="10 10" />
        {path.progress.map((item, i) => {
          const { x, y } = points[i]!
          const href = path.kind === 'course' ? `/courses/${item.slug}` : `/skills/${item.slug}`
          const left = x < width / 2
          const node = (
            <g data-testid={`path-node-${item.slug}`} data-status={item.status}>
              <circle cx={x} cy={y} r={24} className={NODE_CLASSES[item.status].circle} strokeWidth={3} />
              <text x={x} y={y + 6} textAnchor="middle" className={`text-lg font-bold ${NODE_CLASSES[item.status].text}`}>
                {item.status === 'completed' ? '✓' : i + 1}
              </text>
              <text
                x={left ? x + 40 : x - 40}
                y={y - 2}
                textAnchor={left ? 'start' : 'end'}
                className={`text-base font-semibold ${item.status === 'locked' ? 'fill-muted-foreground' : 'fill-foreground'}`}
              >
                {item.title.length > 34 ? `${item.title.slice(0, 33)}…` : item.title}
              </text>
              <text x={left ? x + 40 : x - 40} y={y + 18} textAnchor={left ? 'start' : 'end'} className="fill-muted-foreground text-sm">
                {t(`common:pathStatus.${item.status}`)}
              </text>
            </g>
          )
          // Locked nodes are not links.
          return item.status === 'locked' ? (
            <g key={item.slug}>{node}</g>
          ) : (
            <Link
              key={item.slug}
              to={href}
              aria-label={`${item.title} — ${t(`common:pathStatus.${item.status}`)}`}
              onClick={() => path.kind === 'course' && rememberReturnPath({ courseSlug: item.slug, to: `/my-paths/${path.slug}`, title: path.title })}
            >
              {node}
            </Link>
          )
        })}
      </svg>
    </figure>
  )
}
