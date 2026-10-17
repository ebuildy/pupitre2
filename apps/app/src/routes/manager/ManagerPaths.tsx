import { useTranslation } from '@pupitre/i18n'
import { EmptyState, ErrorState, LoadingState, toast, unwrap } from '@pupitre/ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pupitre/ui/components/ui/alert-dialog'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card } from '@pupitre/ui/components/ui/card'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pupitre/ui/components/ui/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../lib/api.ts'

/** Spec 143: enroll members of the manager's scope in a path; their progress. */
export function ManagerPaths() {
  const { t, i18n } = useTranslation(['app', 'common'])
  const queryClient = useQueryClient()
  const [pathId, setPathId] = useState('')
  const [userId, setUserId] = useState('')
  const [unenrolling, setUnenrolling] = useState<string | null>(null)
  const paths = useQuery({ queryKey: ['manager-paths'], queryFn: () => unwrap(api.api.manager.paths.$get()) })
  const users = useQuery({ queryKey: ['manager-users'], queryFn: () => unwrap(api.api.manager.users.$get()) })
  const enrollments = useQuery({
    queryKey: ['manager-path-enrollments', pathId],
    queryFn: () => unwrap(api.api.manager.paths[':id'].enrollments.$get({ param: { id: pathId } })),
    enabled: !!pathId,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['manager-path-enrollments', pathId] })
  const enroll = useMutation({
    mutationFn: () => unwrap(api.api.manager.paths[':id'].enrollments.$post({ param: { id: pathId }, json: { userId } })),
    onSuccess: async () => {
      toast.success(t('managerPaths.enrolled'))
      setUserId('')
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })
  const unenroll = useMutation({
    mutationFn: (uid: string) =>
      unwrap(api.api.manager.paths[':id'].enrollments[':userId'].$delete({ param: { id: pathId, userId: uid } })),
    onSuccess: async () => {
      toast.success(t('managerPaths.unenrolled'))
      await refresh()
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setUnenrolling(null),
  })

  const enrolledIds = new Set(enrollments.data?.users.map((u) => u.userId))
  const candidates = (users.data?.users ?? []).filter((u) => !enrolledIds.has(u.id))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label={t('managerPaths.path')} value={pathId} onChange={(e) => setPathId(e.target.value)}>
          <NativeSelectOption value="">{t('managerPaths.choosePath')}</NativeSelectOption>
          {paths.data?.paths.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {pathId && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!userId) return toast.error(t('managerPaths.chooseMember'))
              enroll.mutate()
            }}
          >
            <NativeSelect aria-label={t('managerPaths.member')} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <NativeSelectOption value="">{t('managerPaths.chooseMember')}</NativeSelectOption>
              {candidates.map((u) => (
                <NativeSelectOption key={u.id} value={u.id}>
                  {u.username ?? u.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="submit" disabled={enroll.isPending}>
              {t('managerPaths.enroll')}
            </Button>
          </form>
        )}
      </div>
      {pathId &&
        (enrollments.isPending ? (
          <LoadingState label={t('myPaths.loading')} rows={1} />
        ) : enrollments.isError ? (
          <ErrorState message={enrollments.error.message} />
        ) : enrollments.data.users.length === 0 ? (
          <EmptyState icon="🗺️" title={t('managerPaths.empty')} />
        ) : (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('managerPaths.columns.member')}</TableHead>
                  <TableHead>{t('managerPaths.columns.progress')}</TableHead>
                  <TableHead>{t('managerPaths.columns.enrolledAt')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.data.users.map((u) => (
                  <TableRow key={u.userId} data-testid={`manager-path-${u.username ?? u.userId}`}>
                    <TableCell className="font-medium">{u.username ?? u.name}</TableCell>
                    <TableCell>
                      <Badge variant={u.completed === u.total && u.total > 0 ? 'success' : 'outline'}>
                        {u.completed}/{u.total}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(u.enrolledAt))}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => setUnenrolling(u.userId)}>
                        {t('managerPaths.unenroll')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ))}
      <AlertDialog open={!!unenrolling} onOpenChange={(open) => !open && setUnenrolling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('managerPaths.confirmUnenroll')}</AlertDialogTitle>
            <AlertDialogDescription className="sr-only">{t('managerPaths.confirmUnenroll')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault()
                if (unenrolling) unenroll.mutate(unenrolling)
              }}
            >
              {t('managerPaths.unenroll')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
