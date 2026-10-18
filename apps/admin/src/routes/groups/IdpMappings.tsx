import { useTranslation } from '@pupitre/i18n'
import { MEMBERSHIP_ROLES, ROLES } from '@pupitre/shared'
import { toast, unwrap } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pupitre/ui/components/ui/card'
import { Input } from '@pupitre/ui/components/ui/input'
import { Label } from '@pupitre/ui/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { adminApi } from '../../lib/api.ts'

type PlatformRole = (typeof ROLES)[number]
type GroupRole = (typeof MEMBERSHIP_ROLES)[number]

/** Spec 134: identity provider group → platform role and / or role in the mirrored group. */
export function IdpMappings() {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const [platformRole, setPlatformRole] = useState<PlatformRole | ''>('')
  const [membershipRole, setMembershipRole] = useState<GroupRole | ''>('')
  const mappings = useQuery({ queryKey: ['admin-idp-mappings'], queryFn: () => unwrap(adminApi['idp-mappings'].$get()) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-idp-mappings'] })
  const save = useMutation({
    mutationFn: (groupName: string) =>
      unwrap(
        adminApi['idp-mappings'].$post({
          json: { groupName, platformRole: platformRole || null, membershipRole: membershipRole || null },
        }),
      ),
    onSuccess: async () => {
      toast.success(t('groups.mappingSaved'))
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(adminApi['idp-mappings'][':id'].$delete({ param: { id } })),
    onSuccess: async () => {
      toast.success(t('groups.mappingDeleted'))
      await refresh()
    },
  })
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = String(new FormData(e.currentTarget).get('groupName') ?? '').trim()
    if (name) save.mutate(name, { onSuccess: () => e.currentTarget?.reset() })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('groups.mappingsTitle')}</h2>
        </CardTitle>
        <CardDescription>{t('groups.mappingsHelp')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mappings.data?.mappings.length ? (
          <ul className="flex flex-col divide-y" aria-label={t('groups.mappingsTitle')}>
            {mappings.data.mappings.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-mono">{m.groupName}</span>
                <span className="text-muted-foreground">
                  {[m.platformRole && t(`common:roles.${m.platformRole}`), m.membershipRole && t(`common:membershipRoles.${m.membershipRole}`)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-destructive"
                  onClick={() => remove.mutate(m.id)}
                  aria-label={`${t('common:delete')} ${m.groupName}`}
                >
                  {t('common:delete')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{t('groups.mappingsEmpty')}</p>
        )}
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mapping-group">{t('groups.mappingGroup')}</Label>
            <Input id="mapping-group" name="groupName" placeholder="devops-team" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mapping-platform">{t('groups.mappingPlatformRole')}</Label>
            <NativeSelect id="mapping-platform" value={platformRole} onChange={(e) => setPlatformRole(e.target.value as PlatformRole | '')}>
              <NativeSelectOption value="">{t('groups.mappingNone')}</NativeSelectOption>
              {ROLES.map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {t(`common:roles.${r}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mapping-membership">{t('groups.mappingMembershipRole')}</Label>
            <NativeSelect id="mapping-membership" value={membershipRole} onChange={(e) => setMembershipRole(e.target.value as GroupRole | '')}>
              <NativeSelectOption value="">{t('groups.mappingNone')}</NativeSelectOption>
              {MEMBERSHIP_ROLES.map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {t(`common:membershipRoles.${r}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" disabled={save.isPending}>
            {t('groups.mappingAdd')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
