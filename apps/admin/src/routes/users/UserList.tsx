import { useTranslation } from '@pupitre/i18n'
import { ErrorState, LevelBadge, LoadingState, unwrap, useDebouncedValue } from '@pupitre/ui'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { adminApi } from '../../lib/api.ts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pupitre/ui/components/ui/table'
import { Card } from '@pupitre/ui/components/ui/card'
import { Input } from '@pupitre/ui/components/ui/input'

/** Users with their XP and level (spec 103). User management (162/163) comes later. */
export function UserList() {
  const { t } = useTranslation(['admin', 'common'])
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim(), 280)

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin-users', debouncedSearch],
    queryFn: () => unwrap(adminApi.users.$get({ query: { search: debouncedSearch || undefined } })),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold tracking-tight">
        {t('users.title')}
        {data && <span className="ml-2 text-base font-normal text-muted-foreground">{t('users.count', { count: data.total })}</span>}
      </h1>
      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('users.searchPlaceholder')}
        aria-label={t('users.searchLabel')}
        className="h-10 max-w-sm"
      />
      {isPending ? (
        <LoadingState label={t('users.loading')} />
      ) : isError ? (
        <ErrorState message={error.message} />
      ) : data.users.length === 0 ? (
        <p className="text-muted-foreground">{t('users.empty')}</p>
      ) : (
        <Card className="py-0">
          <Table className="w-full max-w-4xl text-left text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>{t('users.columns.user')}</TableHead>
                <TableHead>{t('users.columns.role')}</TableHead>
                <TableHead>{t('users.columns.level')}</TableHead>
                <TableHead className="text-right font-medium">{t('users.columns.xp')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Link to={`/users/${u.id}`} className="font-medium hover:underline">
                      {u.username ?? u.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell>
                    {t(`common:roles.${u.role}`)}
                    {!u.isActive && <span className="ml-2 text-xs text-destructive">{t('users.inactive')}</span>}
                  </TableCell>
                  <TableCell>
                    <LevelBadge xp={u.xp} />
                  </TableCell>
                  <TableCell className="text-right font-semibold">{t('common:xpAmount', { amount: u.xp })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
