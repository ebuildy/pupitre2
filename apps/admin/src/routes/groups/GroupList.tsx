import { useTranslation } from '@pupitre/i18n'
import type { AdminGroup } from '@pupitre/shared'
import { EmptyState, ErrorState, LoadingState, NameDialog, PageHeader, toast, unwrap } from '@pupitre/ui'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pupitre/ui/components/ui/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { adminApi } from '../../lib/api.ts'
import { IdpMappings } from './IdpMappings.tsx'

/** Specs 130–132: the group tree; create, add a subgroup, delete. Rename, move and members are on the group page. */
export function GroupList() {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState<{ parent: AdminGroup | null } | null>(null)
  const [deleting, setDeleting] = useState<AdminGroup | null>(null)

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin-groups'],
    queryFn: () => unwrap(adminApi.groups.$get()),
  })

  const create = useMutation({
    mutationFn: (input: { name: string; parentId: string | null }) => unwrap(adminApi.groups.$post({ json: input })),
    onSuccess: async (_, input) => {
      toast.success(t('groups.created', { name: input.name }))
      setCreating(null)
      await queryClient.invalidateQueries({ queryKey: ['admin-groups'] })
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => unwrap(adminApi.groups[':id'].$delete({ param: { id } })),
    onSuccess: async () => {
      toast.success(t('groups.deleted'))
      await queryClient.invalidateQueries({ queryKey: ['admin-groups'] })
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setDeleting(null),
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('groups.title')}
        description={data ? t('groups.count', { count: data.groups.length }) : undefined}
        actions={<Button onClick={() => setCreating({ parent: null })}>{t('groups.new')}</Button>}
      />

      {isPending ? (
        <LoadingState label={t('groups.loading')} />
      ) : isError ? (
        <ErrorState message={error.message} />
      ) : data.groups.length === 0 ? (
        <EmptyState icon="👥" title={t('groups.empty')} />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('groups.columns.name')}</TableHead>
                <TableHead>{t('groups.columns.origin')}</TableHead>
                <TableHead className="text-right">{t('groups.columns.members')}</TableHead>
                <TableHead className="text-right">{t('groups.columns.courses')}</TableHead>
                <TableHead className="text-right">{t('groups.columns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.groups.map((g) => (
                <TableRow key={g.id} data-testid={`group-${g.name}`}>
                  <TableCell>
                    <div className="flex items-center gap-2" style={{ paddingLeft: `${g.depth * 1.25}rem` }}>
                      {g.depth > 0 && (
                        <span className="text-muted-foreground" aria-hidden="true">
                          ↳
                        </span>
                      )}
                      <Link to={`/groups/${g.id}`} className="font-medium hover:underline">
                        {g.name}
                      </Link>
                      {g.isDefault && <Badge variant="muted">{t('groups.defaultBadge')}</Badge>}
                      {g.managerCount > 0 && <Badge variant="info">{t('common:membershipRoles.manager')} × {g.managerCount}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{g.origin === 'local' ? t('groups.origins.local') : g.origin}</TableCell>
                  <TableCell className="text-right">{g.memberCount}</TableCell>
                  <TableCell className="text-right">{g.courseCount}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {!g.isDefault && (
                        <Button variant="outline" size="sm" onClick={() => setCreating({ parent: g })}>
                          {t('groups.newSubgroup')}
                        </Button>
                      )}
                      {!g.isDefault && g.origin === 'local' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDeleting(g)}
                          aria-label={`${t('common:delete')} ${g.name}`}
                        >
                          {t('common:delete')}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <IdpMappings />

      <NameDialog
        open={!!creating}
        title={creating?.parent ? t('groups.newSubgroupTitle', { name: creating.parent.name }) : t('groups.newTitle')}
        label={t('groups.name')}
        placeholder={t('groups.namePlaceholder')}
        submitLabel={t('groups.create')}
        pending={create.isPending}
        error={create.error?.message}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(null)
            create.reset()
          }
        }}
        onSubmit={(name) => create.mutate({ name, parentId: creating?.parent?.id ?? null })}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('groups.confirmDeleteTitle', { name: deleting?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('groups.confirmDeleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault()
                if (deleting) remove.mutate(deleting.id)
              }}
            >
              {t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
