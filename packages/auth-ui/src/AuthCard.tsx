import { LanguageSwitcher, ThemeToggle } from '@pupitre/ui'
import { Card, CardContent } from '@pupitre/ui/components/ui/card'
import type { ReactNode } from 'react'
import logo from './pioupitre.png'

/** Frame of the sign-in and registration pages: logo, language and theme, then the form. */
export function AuthCard({ subtitle, children }: { subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-gradient-to-b from-secondary to-background px-4 py-10 sm:items-center">
      <Card className="w-full max-w-[430px] gap-5 px-2 py-7 shadow-xl sm:px-4 sm:py-9">
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center justify-center gap-3">
            <img src={logo} alt="" className="h-12 w-12 object-contain" />
            <span className="text-3xl font-bold tracking-tight">pupitre</span>
          </div>
          {subtitle && <p className="-mt-2 text-center text-muted-foreground">{subtitle}</p>}
          <div className="flex items-center justify-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  )
}
