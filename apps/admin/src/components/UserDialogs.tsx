import { useTranslation } from '@pupitre/i18n'
import { type AdminUserUpdateInput, ROLES, type Role } from '@pupitre/shared'
import { toast, unwrap } from '@pupitre/ui'
import { Alert, AlertDescription } from '@pupitre/ui/components/ui/alert'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pupitre/ui/components/ui/dialog'
import { Label } from '@pupitre/ui/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { Switch } from '@pupitre/ui/components/ui/switch'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { adminApi } from '../lib/api.ts'
import { userLabel } from '../lib/users.ts'

type EditableUser = { id: string; username: string | null; name: string; role: Role; isActive: boolean }

async function invalidateUsers(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
  await queryClient.invalidateQueries({ queryKey: ['admin-user', id] })
}

/** Spec 163: "Modifier — <username>": role and active flag. */
export function UserEditDialog({ user, onClose }: { user: EditableUser | null; onClose: () => void }) {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const [role, setRole] = useState<Role>('student')
  const [isActive, setIsActive] = useState(true)
  const [shownFor, setShownFor] = useState<string | null>(null)
  if (user && shownFor !== user.id) {
    setShownFor(user.id)
    setRole(user.role)
    setIsActive(user.isActive)
  }

  const save = useMutation({
    mutationFn: (input: AdminUserUpdateInput) =>
      unwrap(adminApi.users[':id'].$patch({ param: { id: user!.id }, json: input })),
    onSuccess: async () => {
      toast.success(t('users.updated'))
      const id = user!.id
      onClose()
      await invalidateUsers(queryClient, id)
    },
  })

  return (
    <Dialog
      open={!!user}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
          save.reset()
          setShownFor(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user && t('users.editTitle', { name: userLabel(user) })}</DialogTitle>
          <DialogDescription className="sr-only">{t('users.roleLabel')}</DialogDescription>
        </DialogHeader>
        {save.error && (
          <Alert variant="destructive">
            <AlertDescription>{save.error.message}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-role">{t('users.roleLabel')}</Label>
          <NativeSelect id="user-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <NativeSelectOption key={r} value={r}>
                {t(`common:roles.${r}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="user-active">{t('users.activeLabel')}</Label>
            <p className="text-sm text-muted-foreground">{t('users.activeHelp')}</p>
          </div>
          <Switch id="user-active" checked={isActive} onCheckedChange={setIsActive} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate({ role, isActive })}>
            {save.isPending ? t('common:saving') : t('common:save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Spec 163: "Supprimer <username> ?" confirmation. */
export function UserDeleteDialog({
  user,
  onClose,
  onDeleted,
}: {
  user: { id: string; username: string | null; name: string } | null
  onClose: () => void
  onDeleted?: () => void
}) {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(adminApi.users[':id'].$delete({ param: { id } })),
    onSuccess: async (_, id) => {
      toast.success(t('users.deleted'))
      queryClient.removeQueries({ queryKey: ['admin-user', id] })
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      onDeleted?.()
    },
    onError: (err) => toast.error(err.message),
    onSettled: onClose,
  })
  return (
    <AlertDialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{user && t('users.deleteTitle', { name: userLabel(user) })}</AlertDialogTitle>
          <AlertDialogDescription>{t('users.deleteBody')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={(e) => {
              e.preventDefault()
              if (user) remove.mutate(user.id)
            }}
          >
            {t('common:delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

