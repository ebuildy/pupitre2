import { useTranslation } from '@pupitre/i18n'
import type { ManagerMember } from '@pupitre/shared'
import { EmptyState, ErrorState, LoadingState, toast, unwrap, UserAvatar } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card } from '@pupitre/ui/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pupitre/ui/components/ui/dialog'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pupitre/ui/components/ui/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../lib/api.ts'

const label = (u: { username: string | null; name: string }) => u.username ?? u.name

/** Spec 141: "Mes membres": users of the groups the manager manages, and their course enrollments. */
export function ManagerMembers() {
  const { t } = useTranslation('app')
  const [managing, setManaging] = useState<ManagerMember | null>(null)
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['manager-users'],
    queryFn: () => unwrap(api.api.manager.users.$get()),
  })

  if (isPending) return <LoadingState label={t('manager.members.loading')} />
  if (isError) return <ErrorState message={error.message} />
  if (data.users.length === 0) return <EmptyState icon="👥" title={t('manager.members.empty')} />

  return (
    <>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('manager.members.columns.member')}</TableHead>
              <TableHead>{t('manager.members.columns.groups')}</TableHead>
              <TableHead className="text-right">{t('manager.members.columns.courses')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.users.map((u) => (
              <TableRow key={u.id} data-testid={`member-${u.username ?? u.id}`}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <UserAvatar image={u.image} name={label(u)} />
                    <div className="flex flex-col">
                      <span className="font-medium">{label(u)}</span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{u.groups.map((g) => g.name).join(', ')}</TableCell>
                <TableCell className="text-right">{u.enrolledCourses}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => setManaging(u)} aria-label={`${t('manager.members.manage')} — ${label(u)}`}>
                    {t('manager.members.manage')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <EnrollmentsDialog member={managing} onClose={() => setManaging(null)} />
    </>
  )
}

function EnrollmentsDialog({ member, onClose }: { member: ManagerMember | null; onClose: () => void }) {
  const { t } = useTranslation(['app', 'common'])
  const queryClient = useQueryClient()
  const [courseId, setCourseId] = useState('')
  const userId = member?.id ?? ''
  const enrollments = useQuery({
    queryKey: ['manager-enrollments', userId],
    queryFn: () => unwrap(api.api.manager.users[':userId'].enrollments.$get({ param: { userId } })),
    enabled: !!member,
  })
  const courses = useQuery({
    queryKey: ['manager-courses'],
    queryFn: () => unwrap(api.api.manager.courses.$get()),
    enabled: !!member,
  })
  const paths = useQuery({
    queryKey: ['manager-paths'],
    queryFn: () => unwrap(api.api.manager.paths.$get()),
    enabled: !!member,
  })
  const [pathId, setPathId] = useState('')
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['manager-enrollments', userId] })
    await queryClient.invalidateQueries({ queryKey: ['manager-users'] })
    await queryClient.invalidateQueries({ queryKey: ['manager-path-enrollments'] })
  }
  const enrollPath = useMutation({
    mutationFn: (id: string) =>
      unwrap(api.api.manager.paths[':id'].enrollments.$post({ param: { id }, json: { userId } })),
    onSuccess: async () => {
      toast.success(t('manager.members.pathEnrolled'))
      setPathId('')
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })
  const removePath = useMutation({
    mutationFn: (id: string) =>
      unwrap(api.api.manager.paths[':id'].enrollments[':userId'].$delete({ param: { id, userId } })),
    onSuccess: async () => {
      toast.success(t('manager.members.pathRemoved'))
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })
  const enroll = useMutation({
    mutationFn: (id: string) =>
      unwrap(api.api.manager.users[':userId'].enrollments.$post({ param: { userId }, json: { courseId: id } })),
    onSuccess: async () => {
      toast.success(t('manager.members.enrolled'))
      setCourseId('')
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })
  const remove = useMutation({
    mutationFn: (id: string) =>
      unwrap(api.api.manager.users[':userId'].enrollments[':courseId'].$delete({ param: { userId, courseId: id } })),
    onSuccess: async () => {
      toast.success(t('manager.members.removed'))
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  const enrolledIds = new Set(enrollments.data?.courses.map((c) => c.courseId))
  const candidates = (courses.data?.courses ?? []).filter((c) => !enrolledIds.has(c.id))
  const enrolledPathIds = new Set(enrollments.data?.paths.map((p) => p.id))
  const pathCandidates = (paths.data?.paths ?? []).filter((p) => !enrolledPathIds.has(p.id))

  return (
    <Dialog open={!!member} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{member && t('manager.members.dialogTitle', { name: label(member) })}</DialogTitle>
          <DialogDescription className="sr-only">{t('manager.members.current')}</DialogDescription>
        </DialogHeader>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('manager.members.current')}</h3>
          {enrollments.isPending ? (
            <LoadingState label={t('manager.members.loading')} rows={1} />
          ) : enrollments.isError ? (
            <ErrorState message={enrollments.error.message} />
          ) : enrollments.data.courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('manager.members.none')}</p>
          ) : (
            <ul className="flex flex-col divide-y" aria-label={t('manager.members.current')}>
              {enrollments.data.courses.map((c) => (
                <li key={c.courseId} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>{c.title}</span>
                  {c.removable ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(c.courseId)}
                      aria-label={`${t('common:remove')} ${c.title}`}
                    >
                      {t('common:remove')}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('manager.members.otherSource')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <form
          className="flex flex-col gap-2"
          aria-label={t('manager.members.enrollTitle')}
          onSubmit={(e) => {
            e.preventDefault()
            if (!courseId) return toast.error(t('manager.members.chooseCourse'))
            enroll.mutate(courseId)
          }}
        >
          <h3 className="text-sm font-semibold">{t('manager.members.enrollTitle')}</h3>
          <div className="flex gap-2">
            <NativeSelect
              aria-label={t('manager.members.enrollTitle')}
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              containerClassName="flex-1"
            >
              <NativeSelectOption value="">{t('manager.members.chooseCourse')}</NativeSelectOption>
              {candidates.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="submit" disabled={enroll.isPending}>
              {t('manager.members.enroll')}
            </Button>
          </div>
        </form>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('manager.members.currentPaths')}</h3>
          {enrollments.data &&
            (enrollments.data.paths.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('manager.members.noPaths')}</p>
            ) : (
              <ul className="flex flex-col divide-y" aria-label={t('manager.members.currentPaths')}>
                {enrollments.data.paths.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>{p.title}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      disabled={removePath.isPending}
                      onClick={() => removePath.mutate(p.id)}
                      aria-label={`${t('common:remove')} ${p.title}`}
                    >
                      {t('common:remove')}
                    </Button>
                  </li>
                ))}
              </ul>
            ))}
        </section>
        <form
          className="flex flex-col gap-2"
          aria-label={t('manager.members.enrollPathTitle')}
          onSubmit={(e) => {
            e.preventDefault()
            if (!pathId) return toast.error(t('manager.members.choosePath'))
            enrollPath.mutate(pathId)
          }}
        >
          <h3 className="text-sm font-semibold">{t('manager.members.enrollPathTitle')}</h3>
          <div className="flex gap-2">
            <NativeSelect
              aria-label={t('manager.members.enrollPathTitle')}
              value={pathId}
              onChange={(e) => setPathId(e.target.value)}
              containerClassName="flex-1"
            >
              <NativeSelectOption value="">{t('manager.members.choosePath')}</NativeSelectOption>
              {pathCandidates.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="submit" disabled={enrollPath.isPending}>
              {t('manager.members.enroll')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
