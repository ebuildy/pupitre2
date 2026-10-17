import { useTranslation } from '@pupitre/i18n'
import { ErrorState, LoadingState, PageHeader, StatusBadge, unwrap, VisibilityBadge } from '@pupitre/ui'
import { Card, CardContent, CardHeader, CardTitle } from '@pupitre/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pupitre/ui/components/ui/table'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { StatCards, TopLearners } from '../components/StatCards.tsx'
import { adminApi } from '../lib/api.ts'

/** Spec 161: figures, course overview, top 10. */
export function Monitoring() {
  const { t } = useTranslation('admin')
  const courses = useQuery({ queryKey: ['admin-stats-courses'], queryFn: () => unwrap(adminApi.stats.courses.$get()) })
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('monitoring.title')} />
      <StatCards />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('monitoring.coursesTitle')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {courses.isPending ? (
            <LoadingState label={t('courses.loading')} rows={3} />
          ) : courses.isError ? (
            <ErrorState message={courses.error.message} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('monitoring.columns.title')}</TableHead>
                  <TableHead>{t('monitoring.columns.category')}</TableHead>
                  <TableHead className="text-right">{t('monitoring.columns.modules')}</TableHead>
                  <TableHead className="text-right">{t('monitoring.columns.enrolled')}</TableHead>
                  <TableHead className="text-right">{t('monitoring.columns.completions')}</TableHead>
                  <TableHead>{t('monitoring.columns.access')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.data.courses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link to={`/courses/${c.id}`} className="font-medium hover:underline">
                        {c.title}
                      </Link>
                    </TableCell>
                    <TableCell>{c.category ?? '—'}</TableCell>
                    <TableCell className="text-right">{c.modules}</TableCell>
                    <TableCell className="text-right">{c.enrolled}</TableCell>
                    <TableCell className="text-right">{c.completions}</TableCell>
                    <TableCell>
                      <span className="flex gap-1">
                        <VisibilityBadge visibility={c.visibility} />
                        {c.status !== 'published' && <StatusBadge status={c.status} />}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <TopLearners limit={10} title={t('monitoring.top')} linkLabel={t('monitoring.fullLeaderboard')} />
    </div>
  )
}
