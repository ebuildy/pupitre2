import { i18next, useTranslation } from '@pupitre/i18n'
import { Badge } from '@pupitre/ui/components/ui/badge'
import {
  type CategoryRef,
  type CourseCategory,
  type CourseStatus,
  type CourseVisibility,
  type Difficulty,
  xpLevel,
} from '@pupitre/shared'

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

// Spec 044: icon inferred from skills and title keywords, before the category's.
const KEYWORD_ICONS: [RegExp, string][] = [
  [/pentest|hack|cyber|ctf/, '🔐'],
  [/secur|securite/, '🛡️'],
  [/linux|bash|shell/, '🐧'],
  [/kubernetes|helm|k8s/, '☸️'],
  [/docker|podman|conteneur/, '🐋'],
  [/\bgit|ci-cd|devops/, '⚙️'],
  [/python/, '🐍'],
  [/reseau|network|tcp/, '🌐'],
  [/cloud|aws|openstack/, '☁️'],
  [/database|sql|redis/, '🗄️'],
  [/\bweb\b|html/, '🌍'],
  [/typescript|javascript|node/, '📦'],
  [/\bgo\b/, '🦫'],
]

export function courseIcon(course: { title: string; skills?: { slug: string }[]; category: CourseCategory | null }) {
  const haystack = [...(course.skills ?? []).map((s) => s.slug), course.title.toLowerCase()].join(' ')
  return KEYWORD_ICONS.find(([re]) => re.test(haystack))?.[1] ?? categoryIcon(course.category)
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

const DIFFICULTY_VARIANTS = { beginner: 'success', intermediate: 'warning', advanced: 'destructive' } as const

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const { t } = useTranslation()
  return (
    <Badge variant={DIFFICULTY_VARIANTS[difficulty]} className={difficulty === 'advanced' ? 'bg-destructive/15 text-destructive dark:bg-destructive/25' : ''}>
      {t(`difficulty.${difficulty}`)}
    </Badge>
  )
}

export function VisibilityBadge({ visibility }: { visibility: CourseVisibility }) {
  const { t } = useTranslation()
  return <Badge variant={visibility === 'public' ? 'success' : 'muted'}>{t(`visibility.${visibility}`)}</Badge>
}

const STATUS_VARIANTS = { draft: 'warning', published: 'info', archived: 'muted' } as const

export function StatusBadge({ status }: { status: CourseStatus }) {
  const { t } = useTranslation()
  return <Badge variant={STATUS_VARIANTS[status]}>{t(`status.${status}`)}</Badge>
}

/** "Débutant" … "★ Maître" (spec 113). */
export function SkillLevelBadge({ level }: { level: 'beginner' | 'intermediate' | 'advanced' | 'master' }) {
  const { t } = useTranslation()
  return (
    <Badge variant={level === 'master' ? 'xp' : 'info'} className={level === 'master' ? 'font-semibold' : ''}>
      {t(`skillLevels.${level}`)}
    </Badge>
  )
}

/** "🌱 Niveau 1 — Novice" (spec 104). */
export function LevelBadge({ xp, className }: { xp: number; className?: string }) {
  const { t } = useTranslation()
  const { current } = xpLevel(xp)
  return (
    <Badge variant="xp" className={className}>
      <span aria-hidden="true">{current.icon}</span>
      {t('levelLabel', { level: current.level, name: t(`levels.${current.key}`) })}
    </Badge>
  )
}
