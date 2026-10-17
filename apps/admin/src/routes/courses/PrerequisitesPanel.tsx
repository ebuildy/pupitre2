import { useTranslation } from '@pupitre/i18n'
import type { AdminCourse } from '@pupitre/shared'
import { sortByTitle, toast, unwrap } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { Input } from '@pupitre/ui/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { adminApi } from '../../lib/api.ts'

type Row = { courseId: string; minScore: string; modules: string[] }

/** Spec 050: courses to complete first, with an optional minimum quiz score and modules to pass. */
export function PrerequisitesPanel({ course }: { course: AdminCourse }) {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<Row[]>(
    course.prerequisites.map((p) => ({ courseId: p.courseId, minScore: p.minScore ? String(p.minScore) : '', modules: p.modules })),
  )
  const courses = useQuery({ queryKey: ['admin-courses', ''], queryFn: () => unwrap(adminApi.courses.$get({ query: {} })) })
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        adminApi.courses[':id'].$patch({
          param: { id: course.id },
          json: {
            prerequisites: rows
              .filter((r) => r.courseId)
              .map((r) => ({ courseId: r.courseId, minScore: r.minScore ? Number(r.minScore) : null, modules: r.modules })),
          },
        }),
      ),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['admin-course', course.id], updated)
      toast.success(t('authoring.prerequisites.saved'))
    },
    onError: (err) => toast.error(err.message),
  })
  const candidates = sortByTitle((courses.data?.courses ?? []).filter((c) => c.id !== course.id))
  const update = (i: number, patch: Partial<Row>) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <section className="flex max-w-3xl flex-col gap-3 border-t pt-6">
      <h2 className="text-xl font-semibold tracking-tight">{t('authoring.prerequisites.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('authoring.prerequisites.help')}</p>
      {rows.length === 0 && <p className="text-muted-foreground">{t('authoring.prerequisites.empty')}</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border p-3" data-testid={`prerequisite-${i}`}>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm font-medium">
              {t('authoring.prerequisites.course')}
              <NativeSelect value={r.courseId} onChange={(e) => update(i, { courseId: e.target.value, modules: [] })}>
                <NativeSelectOption value="">{t('authoring.prerequisites.chooseCourse')}</NativeSelectOption>
                {candidates.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.title}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className="flex w-40 flex-col gap-1 text-sm font-medium">
              {t('authoring.prerequisites.minScore')}
              <Input type="number" min={0} value={r.minScore} onChange={(e) => update(i, { minScore: e.target.value })} />
            </label>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setRows((list) => list.filter((_, j) => j !== i))}>
              {t('authoring.prerequisites.remove')}
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">{t('authoring.prerequisites.minScoreHelp')}</span>
          {r.courseId && <ModulePicker courseId={r.courseId} value={r.modules} onChange={(modules) => update(i, { modules })} />}
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setRows((list) => [...list, { courseId: '', minScore: '', modules: [] }])}>
          {t('authoring.prerequisites.add')}
        </Button>
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t('common:saving') : t('authoring.prerequisites.save')}
        </Button>
      </div>
    </section>
  )
}

function ModulePicker({ courseId, value, onChange }: { courseId: string; value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation('admin')
  const modules = useQuery({
    queryKey: ['admin-modules', courseId],
    queryFn: () => unwrap(adminApi.courses[':id'].modules.$get({ param: { id: courseId } })),
  })
  if (!modules.data?.modules.length) return null
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-medium">{t('authoring.prerequisites.modules')}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {modules.data.modules.map((m) => (
          <label key={m.slug} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              className="accent-primary"
              checked={value.includes(m.slug)}
              onChange={(e) => onChange(e.target.checked ? [...value, m.slug] : value.filter((s) => s !== m.slug))}
            />
            {m.name}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
