import { useTranslation } from '@pupitre/i18n'
import { type AdminUserSummary, ROLES, type Role } from '@pupitre/shared'
import { ErrorState, LevelBadge, LoadingState, PageHeader, unwrap, useDebouncedValue, UserAvatar } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card } from '@pupitre/ui/components/ui/card'
import { Input } from '@pupitre/ui/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pupitre/ui/components/ui/table'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { UserDeleteDialog, UserEditDialog, useSelfId } from '../../components/UserDialogs.tsx'
import { adminApi } from '../../lib/api.ts'

/** Spec 162: search, role and status filters (kept in the URL), edit and delete (163), XP and level (103). */
export function UserList() {
  const { t, i18n } = useTranslation(['admin', 'common'])
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const debouncedSearch = useDebouncedValue(search.trim(), 280)
  // Filters live in state and are mirrored to the URL (shareable), so quick successive changes are all kept.
  const [role, setRole] = useState<Role | undefined>((params.get('role') as Role | null) ?? undefined)
  const [status, setStatus] = useState<'active' | 'inactive' | undefined>(
    (params.get('status') as 'active' | 'inactive' | null) ?? undefined,
  )
  useEffect(() => {
    const next = new URLSearchParams()
    if (debouncedSearch) next.set('search', debouncedSearch)
    if (role) next.set('role', role)
    if (status) next.set('status', status)
    setParams(next, { replace: true })
  }, [debouncedSearch, role, status, setParams])
  const selfId = useSelfId()
  const [editing, setEditing] = useState<AdminUserSummary | null>(null)
  const [deleting, setDeleting] = useState<AdminUserSummary | null>(null)

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin-users', debouncedSearch, role, status],
    queryFn: () => unwrap(adminApi.users.$get({ query: { search: debouncedSearch || undefined, role, status } })),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('users.title')} description={data ? t('users.count', { count: data.total }) : undefined} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('users.searchPlaceholder')}
          aria-label={t('users.searchLabel')}
          className="h-10 max-w-sm"
        />
        <NativeSelect aria-label={t('users.filters.role')} value={role ?? ''} onChange={(e) => setRole((e.target.value || undefined) as Role | undefined)}>
          <NativeSelectOption value="">{t('users.filters.allRoles')}</NativeSelectOption>
          {ROLES.map((r) => (
            <NativeSelectOption key={r} value={r}>
              {t(`common:roles.${r}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t('users.filters.status')}
          value={status ?? ''}
          onChange={(e) => setStatus((e.target.value || undefined) as 'active' | 'inactive' | undefined)}
        >
          <NativeSelectOption value="">{t('users.filters.allStatuses')}</NativeSelectOption>
          <NativeSelectOption value="active">{t('users.filters.active')}</NativeSelectOption>
          <NativeSelectOption value="inactive">{t('users.filters.inactive')}</NativeSelectOption>
        </NativeSelect>
      </div>
      {isPending ? (
        <LoadingState label={t('users.loading')} />
      ) : isError ? (
        <ErrorState message={error.message} />
      ) : data.users.length === 0 ? (
        <p className="text-muted-foreground">{t('users.empty')}</p>
      ) : (
        <Card className="py-0">
          <Table className="w-full text-left text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>{t('users.columns.user')}</TableHead>
                <TableHead>{t('users.columns.role')}</TableHead>
                <TableHead>{t('users.columns.level')}</TableHead>
                <TableHead className="text-right">{t('users.columns.xp')}</TableHead>
                <TableHead className="text-right">{t('users.moreColumns.courses')}</TableHead>
                <TableHead>{t('users.moreColumns.createdAt')}</TableHead>
                <TableHead className="text-right">{t('users.moreColumns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map((u) => {
                const label = u.username ?? u.name
                return (
                  <TableRow key={u.id} data-testid={`user-row-${u.username ?? u.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserAvatar image={u.image} name={label} />
                        <div className="flex flex-col">
                          <Link to={`/users/${u.id}`} className="font-medium hover:underline">
                            {label}
                          </Link>
                          <span className="text-xs text-muted-foreground">{u.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {t(`common:roles.${u.role}`)}
                      {!u.isActive && <span className="ml-2 text-xs text-destructive">{t('users.inactive')}</span>}
                    </TableCell>
                    <TableCell>
                      <LevelBadge xp={u.xp} />
                    </TableCell>
                    <TableCell className="text-right font-semibold">{t('common:xpAmount', { amount: u.xp })}</TableCell>
                    <TableCell className="text-right">{u.enrolledCourses}</TableCell>
                    <TableCell>
                      {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(u.createdAt))}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(u)} aria-label={`${t('common:edit')} ${label}`}>
                          {t('common:edit')}
                        </Button>
                        {u.id !== selfId && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDeleting(u)}
                            aria-label={`${t('common:delete')} ${label}`}
                          >
                            {t('common:delete')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      <UserEditDialog user={editing} onClose={() => setEditing(null)} />
      <UserDeleteDialog user={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}
