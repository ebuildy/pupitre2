import { useTranslation } from '@pupitre/i18n'
import { EmptyState, ErrorState, LoadingState, PageHeader, sortByTitle, unwrap } from '@pupitre/ui'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card } from '@pupitre/ui/components/ui/card'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pupitre/ui/components/ui/table'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { adminApi } from '../lib/api.ts'

/** Spec 095: "Suivi des labs" — every lab check, filtered by course, with figures. */
export function Labs() {
  const { t, i18n } = useTranslation('admin')
  const [courseId, setCourseId] = useState('')
  const courses = useQuery({ queryKey: ['admin-courses', ''], queryFn: () => unwrap(adminApi.courses.$get({ query: {} })) })
  const checks = useQuery({
    queryKey: ['admin-lab-checks', courseId],
    queryFn: () => unwrap(adminApi['lab-checks'].$get({ query: { course: courseId || undefined } })),
  })
  const rows = checks.data?.checks ?? []
  const learners = new Set(rows.map((r) => r.userEmail)).size
  const stats = [
    { key: 'total', value: rows.length },
    { key: 'passed', value: rows.filter((r) => r.allow).length },
    { key: 'failed', value: rows.filter((r) => !r.allow).length },
    { key: 'learners', value: learners },
  ] as const

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('labs.title')} description={t('labs.count', { checks: rows.length, learners })} />
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label={t('labs.course')} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <NativeSelectOption value="">{t('labs.allCourses')}</NativeSelectOption>
          {sortByTitle(courses.data?.courses ?? []).map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button variant="outline" onClick={() => checks.refetch()}>
          {t('labs.refresh')}
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="lab-stats">
        {stats.map((s) => (
          <div key={s.key} className="flex flex-col-reverse rounded-xl border bg-card p-4 shadow-xs">
            <dt className="text-sm text-muted-foreground">{t(`labs.stats.${s.key}`)}</dt>
            <dd className="text-2xl font-bold">{s.value}</dd>
          </div>
        ))}
      </dl>
      {checks.isPending ? (
        <LoadingState label={t('labs.loading')} />
      ) : checks.isError ? (
        <ErrorState message={checks.error.message} />
      ) : rows.length === 0 ? (
        <EmptyState icon="🧪" title={t('labs.empty')} />
      ) : (
        <Card className="overflow-x-auto py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('labs.columns.learner')}</TableHead>
                <TableHead>{t('labs.columns.course')}</TableHead>
                <TableHead>{t('labs.columns.lab')}</TableHead>
                <TableHead>{t('labs.columns.status')}</TableHead>
                <TableHead>{t('labs.columns.violations')}</TableHead>
                <TableHead>{t('labs.columns.checkedAt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-testid={`lab-check-${r.user?.username ?? r.userEmail}`}>
                  <TableCell>
                    <div className="font-medium">{r.user?.username ?? r.userEmail}</div>
                    <div className="text-xs text-muted-foreground">{r.userEmail}</div>
                  </TableCell>
                  <TableCell>{r.course?.title}</TableCell>
                  <TableCell>
                    {r.module}
                    {r.step && <div className="text-xs text-muted-foreground">{r.step}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.allow ? 'success' : 'destructive'}>{r.allow ? t('labs.passed') : t('labs.failed')}</Badge>
                    {!r.verified && <div className="text-xs text-muted-foreground">{t('labs.reported')}</div>}
                  </TableCell>
                  <TableCell className="max-w-sm text-sm">
                    <ul className="list-disc pl-4">
                      {r.violations.map((v) => (
                        <li key={v}>{v}</li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(r.checkedAt))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
