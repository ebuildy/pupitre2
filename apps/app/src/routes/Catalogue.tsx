import { useTranslation } from '@pupitre/i18n'
import type { Difficulty } from '@pupitre/shared'
import { categoryIcon, EmptyState, ErrorState, LoadingState, PageHeader, sortByTitle, unwrap, useDebouncedValue } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { Input } from '@pupitre/ui/components/ui/input'
import { SearchIcon } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion, type Transition } from 'motion/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ContinueHero } from '../components/ContinueHero.tsx'
import { CourseCard } from '../components/CourseCard.tsx'
import { DifficultySlider } from '../components/DifficultySlider.tsx'
import { api } from '../lib/api.ts'

const EASE_OUT = [0.22, 1, 0.36, 1] as const
/** Cards and chips glide to their new place when the results change (FLIP), new ones rise in, old ones fade out. */
const LAYOUT: Transition = { type: 'spring', stiffness: 380, damping: 34, mass: 0.8 }
const enter = (index: number): Transition => ({ layout: LAYOUT, default: { duration: 0.28, ease: EASE_OUT, delay: Math.min(index, 8) * 0.035 } })
const leave = { opacity: 0, scale: 0.94, transition: { duration: 0.16, ease: 'easeIn' } } as const

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
  const { data, isPending, isError, error, isPlaceholderData } = useQuery({
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

  const courses = data ? sortByTitle(data.courses) : []

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
        <DifficultySlider value={difficulty} onChange={(d) => update((next) => (d ? next.set('difficulty', d) : next.delete('difficulty')))} />
        {data && (
          <span className="relative inline-flex overflow-hidden text-sm text-muted-foreground" role="status">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={data.total}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
              >
                {t('catalogue.count', { count: data.total })}
              </motion.span>
            </AnimatePresence>
          </span>
        )}
      </div>

      {data && showChips && (
        <LayoutGroup id="category-chips">
          <div role="group" aria-label={t('catalogue.categoriesLabel')} className="flex flex-wrap gap-2">
            <motion.div layout transition={LAYOUT}>
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
            </motion.div>
            <AnimatePresence mode="popLayout" initial={false}>
              {chips.map((c) => {
                const active = categories.includes(c.slug)
                return (
                  <motion.div
                    key={c.slug}
                    layout
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.14 } }}
                    transition={{ layout: LAYOUT, default: { duration: 0.2, ease: EASE_OUT } }}
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      aria-pressed={active}
                      className="rounded-full"
                      onClick={() => toggleCategory(c.slug)}
                    >
                      <span aria-hidden="true">{categoryIcon(c)}</span> {c.title} <span className="opacity-70 tabular-nums">{c.count}</span>
                    </Button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </LayoutGroup>
      )}

      {/* Loading, empty and results cross-fade; inside the results, cards move instead of being replaced. */}
      <AnimatePresence mode="wait" initial={false}>
        {isPending ? (
          <motion.div key="loading" exit={{ opacity: 0, transition: { duration: 0.12 } }}>
            <LoadingState label={t('catalogue.loading')} />
          </motion.div>
        ) : isError ? (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ErrorState message={error.message} />
          </motion.div>
        ) : courses.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.14 } }}
            transition={{ duration: 0.26, ease: EASE_OUT }}
          >
            <EmptyState icon="📭" title={t('catalogue.emptyTitle')} description={t('catalogue.emptyBody')} />
          </motion.div>
        ) : (
          <motion.ul
            key="results"
            data-testid="catalogue-results"
            aria-busy={isPlaceholderData}
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            // Previous results stay while the new ones load, dimmed.
            animate={{ opacity: isPlaceholderData ? 0.55 : 1, filter: isPlaceholderData ? 'saturate(0.6)' : 'saturate(1)' }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2 }}
          >
            <AnimatePresence mode="popLayout">
              {courses.map((course, i) => (
                <motion.li
                  key={course.slug}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={leave}
                  transition={enter(i)}
                >
                  <CourseCard course={course} />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
