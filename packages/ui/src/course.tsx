import { i18next, useTranslation } from '@pupitre/i18n'
import type { CategoryRef, CourseCategory, CourseStatus, CourseVisibility, Difficulty } from '@pupitre/shared'

// Icons of well-known category slugs (spec 041). A category without one uses its nearest ancestor's, else 📖.
const CATEGORY_ICONS: Record<string, string> = {
  linux: '🐧',
  devops: '⚙️',
  kubernetes: '☸️',
  docker: '🐋',
  networking: '🌐',
  security: '🛡️',
  programming: '💻',
  python: '🐍',
  git: '🔀',
  cloud: '☁️',
  database: '🗄️',
  'internal-testing': '🧪',
}

export function categoryIcon(category: CourseCategory | CategoryRef | null | undefined) {
  if (!category) return '📖'
  // Own slug first, then the nearest ancestor up to the root.
  const ancestors = 'ancestors' in category ? [...category.ancestors].reverse() : []
  for (const c of [category, ...ancestors]) {
    const icon = CATEGORY_ICONS[c.slug]
    if (icon) return icon
  }
  return '📖'
}

/** "DevOps › Docker", with the category's icon. */
export function CategoryLabel({ category }: { category: CourseCategory }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true">{categoryIcon(category)}</span>
      {[...category.ancestors, category].map((c) => c.title).join(' › ')}
    </span>
  )
}

/** Natural, accent-insensitive sort by title in the current language (spec 041). */
export function sortByTitle<T extends { title: string }>(items: T[]) {
  const collator = new Intl.Collator(i18next.language, { sensitivity: 'base', numeric: true })
  return [...items].sort((a, b) => collator.compare(a.title, b.title))
}

const pill = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  beginner: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  intermediate: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  advanced: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
}

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const { t } = useTranslation()
  return <span className={`${pill} ${DIFFICULTY_COLORS[difficulty]}`}>{t(`difficulty.${difficulty}`)}</span>
}

export function VisibilityBadge({ visibility }: { visibility: CourseVisibility }) {
  const { t } = useTranslation()
  const color =
    visibility === 'public'
      ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
      : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
  return <span className={`${pill} ${color}`}>{t(`visibility.${visibility}`)}</span>
}

const STATUS_COLORS: Record<CourseStatus, string> = {
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  published: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  archived: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
}

export function StatusBadge({ status }: { status: CourseStatus }) {
  const { t } = useTranslation()
  return <span className={`${pill} ${STATUS_COLORS[status]}`}>{t(`status.${status}`)}</span>
}
