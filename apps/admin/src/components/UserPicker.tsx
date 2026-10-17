import { useTranslation } from '@pupitre/i18n'
import type { AdminUserSearchResult } from '@pupitre/shared'
import { unwrap, useDebouncedValue } from '@pupitre/ui'
import { Input } from '@pupitre/ui/components/ui/input'
import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { adminApi } from '../lib/api.ts'

export function userLabel(u: { username: string | null; name: string }) {
  return u.username ?? u.name
}

/**
 * Search-as-you-type user field (username, name or e-mail). `value` is the picked user; typing again clears it.
 */
export function UserPicker({
  value,
  onChange,
  label,
}: {
  value: AdminUserSearchResult | null
  onChange: (user: AdminUserSearchResult | null) => void
  label?: string
}) {
  const { t } = useTranslation('admin')
  const listId = useId()
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search.trim(), 250)
  const suggestions = useQuery({
    queryKey: ['admin-user-search', q],
    queryFn: () => unwrap(adminApi.users.search.$get({ query: { q } })),
    enabled: q.length > 0 && !value,
  })
  const open = !value && !!q && !!suggestions.data?.users.length

  return (
    <div className="relative min-w-64 flex-1">
      <Input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label ?? t('userPicker.label')}
        placeholder={t('userPicker.placeholder')}
        value={value ? `${userLabel(value)} <${value.email}>` : search}
        onChange={(e) => {
          onChange(null)
          setSearch(e.target.value)
        }}
        className="h-10 max-w-sm"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-w-sm overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
        >
          {suggestions.data!.users.map((u) => (
            <li key={u.id} role="option" aria-selected={false}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange(u)
                  setSearch('')
                }}
              >
                <span className="font-medium">{userLabel(u)}</span> <span className="text-muted-foreground">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
