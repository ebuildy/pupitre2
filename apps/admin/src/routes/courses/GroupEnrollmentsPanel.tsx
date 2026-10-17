import { useTranslation } from '@pupitre/i18n'
import { ErrorState, LoadingState, toast, unwrap } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { adminApi } from '../../lib/api.ts'

/** Spec 135: groups enrolled in the course; every member gets access. */
export function GroupEnrollmentsPanel({ courseId }: { courseId: string }) {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const enrolled = useQuery({
    queryKey: ['admin-course-groups', courseId],
    queryFn: () => unwrap(adminApi.courses[':id'].groups.$get({ param: { id: courseId } })),
  })
  const groups = useQuery({ queryKey: ['admin-groups'], queryFn: () => unwrap(adminApi.groups.$get()) })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-course-groups', courseId] })
    await queryClient.invalidateQueries({ queryKey: ['admin-enrollments', courseId] })
    await queryClient.invalidateQueries({ queryKey: ['admin-groups'] })
    await queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
  }
  const add = useMutation({
    mutationFn: (groupId: string) =>
      unwrap(adminApi.groups[':id'].courses.$post({ param: { id: groupId }, json: { courseId } })),
    onSuccess: async ({ enrolled }) => {
      toast.success(t('groups.courseAdded', { count: enrolled }))
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })
  const remove = useMutation({
    mutationFn: (groupId: string) =>
      unwrap(adminApi.groups[':id'].courses[':courseId'].$delete({ param: { id: groupId, courseId } })),
    onSuccess: async () => {
      toast.success(t('groups.courseRemoved'))
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  const ids = new Set(enrolled.data?.groups.map((g) => g.id))
  const candidates = (groups.data?.groups ?? []).filter((g) => !ids.has(g.id))
  const count = enrolled.data?.groups.length ?? 0

  return (
    <section className="flex max-w-3xl flex-col gap-3 border-t pt-6">
      <h2 className="text-xl font-semibold tracking-tight">{t('courseGroups.title', { count })}</h2>
      <NativeSelect
        aria-label={t('courseGroups.add')}
        value=""
        disabled={add.isPending}
        onChange={(e) => e.target.value && add.mutate(e.target.value)}
        className="max-w-md"
      >
        <NativeSelectOption value="">{t('courseGroups.add')}</NativeSelectOption>
        {candidates.map((g) => (
          <NativeSelectOption key={g.id} value={g.id}>
            {'  '.repeat(g.depth)}
            {g.name} ({t('courseGroups.members', { count: g.memberCount })})
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {enrolled.isPending ? (
        <LoadingState label={t('courses.loading')} rows={1} />
      ) : enrolled.isError ? (
        <ErrorState message={enrolled.error.message} />
      ) : enrolled.data.groups.length === 0 ? (
        <p className="text-muted-foreground">{t('courseGroups.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {enrolled.data.groups.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <Link to={`/groups/${g.id}`} className="font-medium hover:underline">
                  {g.name}
                </Link>{' '}
                <span className="text-sm text-muted-foreground">{t('courseGroups.members', { count: g.memberCount })}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(g.id)}
                aria-label={`${t('common:remove')} ${g.name}`}
              >
                {t('common:remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
