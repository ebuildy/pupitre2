import { useTranslation } from '@pupitre/i18n'
import { DIFFICULTIES, type Difficulty } from '@pupitre/shared'
import { categoryIcon, sortByTitle, unwrap, useDebouncedValue } from '@pupitre/ui'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { CourseCard } from '../components/CourseCard.tsx'
import { api } from '../lib/api.ts'

/**
 * Spec 041. Filters live in the URL (`?search=&difficulty=&category=<slug>&category=<slug>`) so views can be shared.
 * Chips are the top-level categories; selecting one includes its subcategories.
 */
export function Catalogue() {
  const { t } = useTranslation(['app', 'common'])
  const [params, setParams] = useSearchParams()

  const difficulty = (params.get('difficulty') ?? '') as Difficulty | ''
  const categories = params.getAll('category')

  const [search, setSearch] = useState(params.get('search') ?? '')
  const debouncedSearch = useDebouncedValue(search.trim(), 280)

  function update(mutate: (next: URLSearchParams) => void) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        mutate(next)
        return next
      },
      { replace: true },
    )
  }

  useEffect(() => {
    if ((params.get('search') ?? '') === debouncedSearch) return
    update((next) => (debouncedSearch ? next.set('search', debouncedSearch) : next.delete('search')))
  }, [debouncedSearch])

  const query = {
    search: params.get('search') || undefined,
    difficulty: difficulty || undefined,
    category: categories.length ? categories : undefined,
  }
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['courses', query],
    queryFn: () => unwrap(api.api.courses.$get({ query })),
    placeholderData: keepPreviousData,
  })

  // Chips: categories of the current results, plus selected ones that no longer match (count 0) so they can be
  // cleared. Shown when there is a choice (≥ 2) or a selection to undo.
  const chips = [...(data?.categories ?? [])]
  for (const selected of categories) {
    if (!chips.some((c) => c.slug === selected)) chips.push({ slug: selected, title: selected, count: 0 })
  }
  const showChips = chips.length >= 2 || categories.length > 0

  function toggleCategory(value: string) {
    update((next) => {
      const current = next.getAll('category')
      next.delete('category')
      const updated = current.includes(value) ? current.filter((c) => c !== value) : [...current, value]
      for (const c of updated) next.append('category', c)
    })
  }

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${
      active
        ? 'border-blue-600 bg-blue-600 text-white'
        : 'border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'
    }`
  const field = 'h-10 rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700'

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">{t('catalogue.title')}</h1>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('catalogue.searchPlaceholder')}
          aria-label={t('catalogue.searchLabel')}
          className={`${field} min-w-0 flex-1 sm:max-w-sm`}
        />
        <select
          value={difficulty}
          onChange={(e) => update((next) => (e.target.value ? next.set('difficulty', e.target.value) : next.delete('difficulty')))}
          aria-label={t('catalogue.difficultyLabel')}
          className={field}
        >
          <option value="">{t('catalogue.allDifficulties')}</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {t(`common:difficulty.${d}`)}
            </option>
          ))}
        </select>
        {data && (
          <span className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
            {t('catalogue.count', { count: data.total })}
          </span>
        )}
      </div>

      {data && showChips && (
        <div role="group" aria-label={t('catalogue.categoriesLabel')} className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={categories.length === 0}
            className={chip(categories.length === 0)}
            onClick={() => update((next) => next.delete('category'))}
          >
            {t('catalogue.allCategories')}
          </button>
          {chips.map((c) => {
            const active = categories.includes(c.slug)
            return (
              <button
                key={c.slug}
                type="button"
                aria-pressed={active}
                className={chip(active)}
                onClick={() => toggleCategory(c.slug)}
              >
                <span aria-hidden="true">{categoryIcon(c)}</span> {c.title} <span className="opacity-70">{c.count}</span>
              </button>
            )
          })}
        </div>
      )}

      {isPending ? (
        <p className="text-zinc-600 dark:text-zinc-400">{t('catalogue.loading')}</p>
      ) : isError ? (
        <p role="alert" className="text-red-600">
          {error.message}
        </p>
      ) : data.courses.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <span className="text-4xl" aria-hidden="true">
            📭
          </span>
          <p className="font-semibold">{t('catalogue.emptyTitle')}</p>
          <p className="text-zinc-600 dark:text-zinc-400">{t('catalogue.emptyBody')}</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortByTitle(data.courses).map((course) => (
            <li key={course.slug}>
              <CourseCard course={course} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
