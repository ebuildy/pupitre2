// UI building blocks shared by every frontend.
export { ApiRequestError, isNotFound, unwrap } from './api.ts'
export {
  CategoryLabel,
  categoryIcon,
  courseIcon,
  DifficultyBadge,
  LevelBadge,
  SkillLevelBadge,
  StatusBadge,
  sortByTitle,
  VisibilityBadge,
} from './course.tsx'
export { useDebouncedValue } from './useDebouncedValue.ts'
export { ThemeToggle } from './components/theme-toggle.tsx'
export { cn } from './lib/utils.ts'
export { LanguageSwitcher } from './components/language-switcher.tsx'
export { EmptyState, ErrorState, LoadingState, PageHeader } from './components/page.tsx'
export { UserAvatar } from './components/user-avatar.tsx'
export { toast } from 'sonner'
export { NameDialog } from './components/name-dialog.tsx'
