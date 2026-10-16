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
import { Input } from '@pupitre/ui/components/ui/input'
import { Textarea } from '@pupitre/ui/components/ui/textarea'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { buttonVariants } from '@pupitre/ui/components/ui/button'

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

  const field = 'w-full'
  const label = 'flex flex-col gap-1 text-sm font-medium'

  return (
    <form onSubmit={submit} noValidate className="flex max-w-2xl flex-col gap-4">
      {(invalid || error) && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {invalid ? t(`courses.form.${invalid}`) : error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          {t('courses.form.title')} *
          <Input value={values.title} onChange={set('title')} className={field} />
        </label>
        <label className={label}>
          {t('courses.form.slug')} *
          <Input value={values.slug} onChange={set('slug')} className={`${field} font-mono`} placeholder="mon-cours" />
          <span className="text-xs font-normal text-muted-foreground">{t('courses.form.slugHelp')}</span>
        </label>
      </div>
      <label className={label}>
        {t('courses.form.description')}
        <Textarea value={values.description} onChange={set('description')} rows={4} className={field} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          {t('courses.form.category')}
          <NativeSelect containerClassName="w-full" value={values.categoryId} onChange={set('categoryId')} className={field}>
            <NativeSelectOption value="">{t('courses.form.noCategory')}</NativeSelectOption>
            {flattenTree(categories.data?.categories ?? []).map((row) => (
              <NativeSelectOption key={row.category.id} value={row.category.id}>
                {row.path}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className={label}>
          {t('courses.form.difficulty')}
          <NativeSelect containerClassName="w-full" value={values.difficulty} onChange={set('difficulty')} className={field}>
            <NativeSelectOption value="">{t('courses.form.noDifficulty')}</NativeSelectOption>
            {DIFFICULTIES.map((d) => (
              <NativeSelectOption key={d} value={d}>
                {t(`common:difficulty.${d}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className={label}>
          {t('courses.form.visibility')}
          <NativeSelect containerClassName="w-full" value={values.visibility} onChange={set('visibility')} className={field}>
            {COURSE_VISIBILITIES.map((v) => (
              <NativeSelectOption key={v} value={v}>
                {t(`common:visibility.${v}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className={label}>
          {t('courses.form.status')}
          <NativeSelect containerClassName="w-full" value={values.status} onChange={set('status')} className={field}>
            {COURSE_STATUSES.map((s) => (
              <NativeSelectOption key={s} value={s}>
                {t(`common:status.${s}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          {t('courses.form.xpRequired')}
          <Input
            type="number"
            min={0}
            step={1}
            value={values.xpRequired}
            onChange={set('xpRequired')}
            className={field}
          />
          <span className="text-xs font-normal text-muted-foreground">{t('courses.form.xpRequiredHelp')}</span>
        </label>
        <label className={label}>
          {t('courses.form.completionXp')}
          <Input
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
        className={buttonVariants({ className: 'self-start' })}
      >
        {pending ? t('courses.form.saving') : course ? t('courses.form.save') : t('courses.form.create')}
      </button>
    </form>
  )
}
