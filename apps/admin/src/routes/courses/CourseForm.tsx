import { useTranslation } from '@pupitre/i18n'
import {
  type AdminCourse,
  COURSE_STATUSES,
  COURSE_VISIBILITIES,
  type CourseCreateInput,
  DEFAULT_COMPLETION_XP,
  DIFFICULTIES,
  SLUG_PATTERN,
} from '@pupitre/shared'
import { type FormEvent, useState } from 'react'
import { flattenTree, useCategories } from '../../lib/categories.ts'

// Form state: text inputs hold strings (numbers are parsed on submit).
type Values = Required<{
  [K in keyof CourseCreateInput]: NonNullable<CourseCreateInput[K]> extends number
    ? string
    : NonNullable<CourseCreateInput[K]> | ''
}>

function initialValues(course?: AdminCourse): Values {
  return {
    slug: course?.slug ?? '',
    title: course?.title ?? '',
    description: course?.description ?? '',
    categoryId: course?.categoryId ?? '',
    difficulty: course?.difficulty ?? '',
    xpRequired: String(course?.xpRequired ?? 0),
    completionXp: String(course?.completionXp ?? DEFAULT_COMPLETION_XP),
    visibility: course?.visibility ?? 'private',
    status: course?.status ?? 'draft',
  }
}

/** Specs 166, 167: create and edit form. Validates first with translated messages; the API re-validates. */
export function CourseForm({
  course,
  pending,
  error,
  onSubmit,
}: {
  course?: AdminCourse
  pending: boolean
  error?: string | null
  onSubmit: (input: CourseCreateInput) => void
}) {
  const { t } = useTranslation(['admin', 'common'])
  const [values, setValues] = useState(() => initialValues(course))
  const categories = useCategories()
  const [invalid, setInvalid] = useState<'titleRequired' | 'slugInvalid' | 'xpInvalid' | null>(null)

  const set = (key: keyof Values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!values.title.trim()) return setInvalid('titleRequired')
    if (!SLUG_PATTERN.test(values.slug.trim())) return setInvalid('slugInvalid')
    const xpRequired = Number(values.xpRequired || 0)
    const completionXp = Number(values.completionXp || 0)
    if (![xpRequired, completionXp].every((n) => Number.isInteger(n) && n >= 0)) return setInvalid('xpInvalid')
    setInvalid(null)
    onSubmit({
      slug: values.slug.trim(),
      title: values.title.trim(),
      description: values.description || null,
      categoryId: values.categoryId || null,
      difficulty: values.difficulty || null,
      xpRequired,
      completionXp,
      visibility: values.visibility || 'private',
      status: values.status || 'draft',
    })
  }

  const field = 'w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700'
  const label = 'flex flex-col gap-1 text-sm font-medium'

  return (
    <form onSubmit={submit} noValidate className="flex max-w-2xl flex-col gap-4">
      {(invalid || error) && (
        <p role="alert" className="rounded-lg border border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {invalid ? t(`courses.form.${invalid}`) : error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          {t('courses.form.title')} *
          <input value={values.title} onChange={set('title')} className={field} />
        </label>
        <label className={label}>
          {t('courses.form.slug')} *
          <input value={values.slug} onChange={set('slug')} className={`${field} font-mono`} placeholder="mon-cours" />
          <span className="text-xs font-normal text-zinc-500">{t('courses.form.slugHelp')}</span>
        </label>
      </div>
      <label className={label}>
        {t('courses.form.description')}
        <textarea value={values.description} onChange={set('description')} rows={4} className={field} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          {t('courses.form.category')}
          <select value={values.categoryId} onChange={set('categoryId')} className={field}>
            <option value="">{t('courses.form.noCategory')}</option>
            {flattenTree(categories.data?.categories ?? []).map((row) => (
              <option key={row.category.id} value={row.category.id}>
                {row.path}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          {t('courses.form.difficulty')}
          <select value={values.difficulty} onChange={set('difficulty')} className={field}>
            <option value="">{t('courses.form.noDifficulty')}</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {t(`common:difficulty.${d}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          {t('courses.form.visibility')}
          <select value={values.visibility} onChange={set('visibility')} className={field}>
            {COURSE_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {t(`common:visibility.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          {t('courses.form.status')}
          <select value={values.status} onChange={set('status')} className={field}>
            {COURSE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`common:status.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          {t('courses.form.xpRequired')}
          <input
            type="number"
            min={0}
            step={1}
            value={values.xpRequired}
            onChange={set('xpRequired')}
            className={field}
          />
          <span className="text-xs font-normal text-zinc-500">{t('courses.form.xpRequiredHelp')}</span>
        </label>
        <label className={label}>
          {t('courses.form.completionXp')}
          <input
            type="number"
            min={0}
            step={1}
            value={values.completionXp}
            onChange={set('completionXp')}
            className={field}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {pending ? t('courses.form.saving') : course ? t('courses.form.save') : t('courses.form.create')}
      </button>
    </form>
  )
}
