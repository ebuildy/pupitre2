import { useTranslation } from '@pupitre/i18n'
import { LevelBadge, unwrap, useDebouncedValue } from '@pupitre/ui'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { adminApi } from '../../lib/api.ts'

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
      <h1 className="text-2xl font-semibold">
        {t('users.title')}
        {data && <span className="ml-2 text-base font-normal text-zinc-500">{t('users.count', { count: data.total })}</span>}
      </h1>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('users.searchPlaceholder')}
        aria-label={t('users.searchLabel')}
        className="h-10 max-w-sm rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700"
      />
      {isPending ? (
        <p>{t('users.loading')}</p>
      ) : isError ? (
        <p role="alert" className="text-red-600">
          {error.message}
        </p>
      ) : data.users.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">{t('users.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full max-w-4xl text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="py-2 pr-4 font-medium">{t('users.columns.user')}</th>
                <th className="py-2 pr-4 font-medium">{t('users.columns.role')}</th>
                <th className="py-2 pr-4 font-medium">{t('users.columns.level')}</th>
                <th className="py-2 pr-4 text-right font-medium">{t('users.columns.xp')}</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-4">
                    <Link to={`/users/${u.id}`} className="font-medium hover:underline">
                      {u.username ?? u.name}
                    </Link>
                    <div className="text-xs text-zinc-500">{u.email}</div>
                  </td>
                  <td className="py-2 pr-4">
                    {t(`common:roles.${u.role}`)}
                    {!u.isActive && <span className="ml-2 text-xs text-red-600">{t('users.inactive')}</span>}
                  </td>
                  <td className="py-2 pr-4">
                    <LevelBadge xp={u.xp} />
                  </td>
                  <td className="py-2 pr-4 text-right font-semibold">{t('common:xpAmount', { amount: u.xp })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
