import { useTranslation } from '@pupitre/i18n'
import { Button } from '@pupitre/ui/components/ui/button'
import { MoonIcon, SunIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'theme'

function isDark() {
  return document.documentElement.classList.contains('dark')
}

/**
 * Spec 010: switches light/dark for the whole app, persisted in `localStorage.theme` (shared by both frontends).
 * The inline script of each `index.html` applies it before first paint.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation()
  const [dark, setDark] = useState(isDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const label = dark ? t('theme.toLight') : t('theme.toDark')
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      aria-label={label}
      title={label}
      onClick={() => {
        const next = !dark
        setDark(next)
        try {
          localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
        } catch {}
      }}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
