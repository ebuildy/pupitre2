import { useTranslation } from '@pupitre/i18n'
import type { AdminGroup } from '@pupitre/shared'
import { EmptyState, ErrorState, LoadingState, NameDialog, toast, unwrap, UserAvatar } from '@pupitre/ui'
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
import { Button } from '@pupitre/ui/components/ui/button'
import { Card, CardContent } from '@pupitre/ui/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pupitre/ui/components/ui/dialog'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../lib/api.ts'

/** Spec 142: the manager's groups (tree): create, add a subgroup, delete, members. */
export function ManagerGroups() {
  const { t } = useTranslation(['app', 'common'])
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState<{ parent: AdminGroup | null } | null>(null)
  const [deleting, setDeleting] = useState<AdminGroup | null>(null)
  const [members, setMembers] = useState<AdminGroup | null>(null)
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['manager-groups'],
    queryFn: () => unwrap(api.api.manager.groups.$get()),
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['manager-groups'] })
    await queryClient.invalidateQueries({ queryKey: ['manager-scope'] })
    await queryClient.invalidateQueries({ queryKey: ['manager-users'] })
  }
  const create = useMutation({
    mutationFn: (input: { name: string; parentId: string | null }) => unwrap(api.api.manager.groups.$post({ json: input })),
    onSuccess: async () => {
      toast.success(t('manager.groups.created'))
      setCreating(null)
      await refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.api.manager.groups[':id'].$delete({ param: { id } })),
    onSuccess: async () => {
      toast.success(t('manager.groups.deleted'))
      await refresh()
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setDeleting(null),
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={() => setCreating({ parent: null })}>{t('manager.groups.new')}</Button>
      </div>
      {isPending ? (
        <LoadingState label={t('manager.groups.loading')} />
      ) : isError ? (
        <ErrorState message={error.message} />
      ) : data.groups.length === 0 ? (
        <EmptyState icon="👥" title={t('manager.groups.empty')} />
      ) : (
        <Card className="py-0">
          <CardContent className="divide-y px-0">
            {data.groups.map((g) => (
              <div
                key={g.id}
                className="flex flex-wrap items-center gap-2 px-4 py-3"
                style={{ paddingLeft: `${1 + g.depth * 1.25}rem` }}
                data-testid={`manager-group-${g.name}`}
              >
                <span className="font-medium">{g.name}</span>
                <span className="text-sm text-muted-foreground">{t('manager.groups.members', { count: g.memberCount })}</span>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setMembers(g)} aria-label={`${t('manager.groups.membersButton')} ${g.name}`}>
                    {t('manager.groups.membersButton')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCreating({ parent: g })} aria-label={`${t('manager.groups.newSubgroup')} ${g.name}`}>
                    {t('manager.groups.newSubgroup')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setDeleting(g)}
                    aria-label={`${t('common:delete')} ${g.name}`}
                  >
                    {t('common:delete')}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <NameDialog
        open={!!creating}
        title={creating?.parent ? t('manager.groups.newSubgroupTitle', { name: creating.parent.name }) : t('manager.groups.newTitle')}
        label={t('manager.groups.name')}
        placeholder={t('manager.groups.namePlaceholder')}
        submitLabel={t('manager.groups.create')}
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
            <AlertDialogTitle>{t('manager.groups.confirmDelete', { name: deleting?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription className="sr-only">{deleting?.name}</AlertDialogDescription>
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

      <MembersDialog group={members} onClose={() => setMembers(null)} />
    </div>
  )
}

function MembersDialog({ group, onClose }: { group: AdminGroup | null; onClose: () => void }) {
  const { t } = useTranslation(['app', 'common'])
  const queryClient = useQueryClient()
  const [userId, setUserId] = useState('')
  const id = group?.id ?? ''
  const members = useQuery({
    queryKey: ['manager-group-members', id],
    queryFn: () => unwrap(api.api.manager.groups[':id'].members.$get({ param: { id } })),
    enabled: !!group,
  })
  const scopeUsers = useQuery({
    queryKey: ['manager-users'],
    queryFn: () => unwrap(api.api.manager.users.$get()),
    enabled: !!group,
  })
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['manager-group-members', id] })
    await queryClient.invalidateQueries({ queryKey: ['manager-groups'] })
    await queryClient.invalidateQueries({ queryKey: ['manager-users'] })
  }
  const add = useMutation({
    mutationFn: (uid: string) => unwrap(api.api.manager.groups[':id'].members.$post({ param: { id }, json: { userId: uid } })),
    onSuccess: async () => {
      toast.success(t('manager.groups.memberAdded'))
      setUserId('')
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })
  const remove = useMutation({
    mutationFn: (uid: string) =>
      unwrap(api.api.manager.groups[':id'].members[':userId'].$delete({ param: { id, userId: uid } })),
    onSuccess: async () => {
      toast.success(t('manager.groups.memberRemoved'))
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  const memberIds = new Set(members.data?.members.map((m) => m.userId))
  const candidates = (scopeUsers.data?.users ?? []).filter((u) => !memberIds.has(u.id))

  return (
    <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{group && t('manager.groups.membersTitle', { name: group.name })}</DialogTitle>
          <DialogDescription className="sr-only">{group?.name}</DialogDescription>
        </DialogHeader>
        {members.isPending ? (
          <LoadingState label={t('manager.groups.loading')} rows={1} />
        ) : members.isError ? (
          <ErrorState message={members.error.message} />
        ) : (
          <ul className="flex flex-col divide-y">
            {members.data.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-2 py-2 text-sm">
                <UserAvatar image={m.image} name={m.username ?? m.name} />
                <span className="flex-1">{m.username ?? m.name}</span>
                {m.role === 'manager' ? (
                  <span className="text-xs text-muted-foreground">{t('common:membershipRoles.manager')}</span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(m.userId)}
                    aria-label={`${t('common:remove')} ${m.username ?? m.name}`}
                  >
                    {t('common:remove')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (userId) add.mutate(userId)
          }}
        >
          <NativeSelect
            aria-label={t('manager.groups.addMember')}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            containerClassName="flex-1"
          >
            <NativeSelectOption value="">{t('manager.groups.chooseMember')}</NativeSelectOption>
            {candidates.map((u) => (
              <NativeSelectOption key={u.id} value={u.id}>
                {u.username ?? u.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button type="submit" disabled={add.isPending || !userId}>
            {t('common:add')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
