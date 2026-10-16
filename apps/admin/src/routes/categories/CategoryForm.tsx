import { useTranslation } from '@pupitre/i18n'
import { type AdminCategory, type CategoryCreateInput, SLUG_PATTERN } from '@pupitre/shared'
import { type FormEvent, useState } from 'react'
import { flattenTree, subtreeIds, useCategories } from '../../lib/categories.ts'

/** Create and edit form. Validates first with translated messages; the API re-validates. */
export function CategoryForm({
  category,
  pending,
  error,
  onSubmit,
}: {
  category?: AdminCategory
  pending: boolean
  error?: string | null
  onSubmit: (input: CategoryCreateInput) => void
}) {
  const { t } = useTranslation('admin')
  const { data } = useCategories()
  const [title, setTitle] = useState(category?.title ?? '')
  const [slug, setSlug] = useState(category?.slug ?? '')
  const [parentId, setParentId] = useState(category?.parentId ?? '')
  const [invalid, setInvalid] = useState<'titleRequired' | 'slugInvalid' | null>(null)

  // A category can't be moved under itself or one of its subcategories.
  const excluded = category && data ? subtreeIds(data.categories, category.id) : new Set<string>()
  const parents = flattenTree(data?.categories ?? []).filter((row) => !excluded.has(row.category.id))

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setInvalid('titleRequired')
    if (!SLUG_PATTERN.test(slug.trim())) return setInvalid('slugInvalid')
    setInvalid(null)
    onSubmit({ title: title.trim(), slug: slug.trim(), parentId: parentId || null })
  }

  const field = 'w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700'
  const label = 'flex flex-col gap-1 text-sm font-medium'

  return (
    <form onSubmit={submit} noValidate className="flex max-w-2xl flex-col gap-4">
      {(invalid || error) && (
        <p role="alert" className="rounded-lg border border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {invalid ? t(`categories.form.${invalid}`) : error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          {t('categories.form.title')} *
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </label>
        <label className={label}>
          {t('categories.form.slug')} *
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className={`${field} font-mono`} placeholder="devops" />
          <span className="text-xs font-normal text-zinc-500">{t('categories.form.slugHelp')}</span>
        </label>
      </div>
      <label className={label}>
        {t('categories.form.parent')}
        <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={field}>
          <option value="">{t('categories.form.noParent')}</option>
          {parents.map((row) => (
            <option key={row.category.id} value={row.category.id}>
              {row.path}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {pending ? t('categories.form.saving') : category ? t('categories.form.save') : t('categories.form.create')}
      </button>
    </form>
  )
}
