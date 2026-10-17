import { useTranslation } from '@pupitre/i18n'
import { DIFFICULTIES, type Difficulty } from '@pupitre/shared'
import { categoryIcon, EmptyState, ErrorState, LoadingState, PageHeader, sortByTitle, unwrap, useDebouncedValue } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { Input } from '@pupitre/ui/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { SearchIcon } from 'lucide-react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ContinueHero } from '../components/ContinueHero.tsx'
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

  const skill = params.get('skill') || undefined
  const query = {
    search: params.get('search') || undefined,
    skill,
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('catalogue.title')} />

      {!skill && !params.get('search') && <ContinueHero />}

      {data?.skillFilter && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-secondary px-4 py-2 text-sm"
          data-testid="skill-filter"
        >
          <span>
            {data.skillFilter.level
              ? t('catalogue.skillBanner', {
                  skill: data.skillFilter.label,
                  level: t(`common:skillLevels.${data.skillFilter.level === 'master' ? 'advanced' : data.skillFilter.level}`),
                })
              : t('catalogue.skillBannerAll', { skill: data.skillFilter.label })}
          </span>
          <Button variant="ghost" size="sm" onClick={() => update((next) => next.delete('skill'))}>
            {t('catalogue.removeFilter')}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-auto sm:min-w-0 sm:flex-1 sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('catalogue.searchPlaceholder')}
            aria-label={t('catalogue.searchLabel')}
            className="h-10 pl-9"
          />
        </div>
        <NativeSelect
          value={difficulty}
          onChange={(e) => update((next) => (e.target.value ? next.set('difficulty', e.target.value) : next.delete('difficulty')))}
          aria-label={t('catalogue.difficultyLabel')}
          className="h-10"
        >
          <NativeSelectOption value="">{t('catalogue.allDifficulties')}</NativeSelectOption>
          {DIFFICULTIES.map((d) => (
            <NativeSelectOption key={d} value={d}>
              {t(`common:difficulty.${d}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {data && (
          <span className="text-sm text-muted-foreground" role="status">
            {t('catalogue.count', { count: data.total })}
          </span>
        )}
      </div>

      {data && showChips && (
        <div role="group" aria-label={t('catalogue.categoriesLabel')} className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={categories.length === 0 ? 'default' : 'outline'}
            aria-pressed={categories.length === 0}
            className="rounded-full"
            onClick={() => update((next) => next.delete('category'))}
          >
            {t('catalogue.allCategories')}
          </Button>
          {chips.map((c) => {
            const active = categories.includes(c.slug)
            return (
              <Button
                key={c.slug}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                aria-pressed={active}
                className="rounded-full"
                onClick={() => toggleCategory(c.slug)}
              >
                <span aria-hidden="true">{categoryIcon(c)}</span> {c.title} <span className="opacity-70">{c.count}</span>
              </Button>
            )
          })}
        </div>
      )}

      {isPending ? (
        <LoadingState label={t('catalogue.loading')} />
      ) : isError ? (
        <ErrorState message={error.message} />
      ) : data.courses.length === 0 ? (
        <EmptyState icon="📭" title={t('catalogue.emptyTitle')} description={t('catalogue.emptyBody')} />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
