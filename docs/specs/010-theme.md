# 010 — Theme, light / dark mode and UI components

| Field | Value |
| --- | --- |
| Area | UI |
| Actors | everyone |
| Related | [018](018-localization.md); covers the original 010 and 011 |

## Theme

- Built on **shadcn/ui** (Radix primitives, Tailwind CSS v4), shared by both frontends from `packages/ui`.
- Colors are CSS variables in `packages/ui/src/styles/globals.css` (`:root` for light, `.dark` for dark), exposed to
  Tailwind as tokens: `background`, `foreground`, `card`, `primary` (pupitre blue `#1b86f2`), `secondary`, `muted`,
  `accent`, `destructive`, `border`, `input`, `ring`, plus pupitre status tokens `success`, `warning`, `xp` (each with
  `-foreground` / `-soft` variants) and `sidebar-*`. Font: Inter (variable).
- Both apps import the theme with `@import '@pupitre/ui/globals.css'`; the learner app adds the typography plugin and
  the course content styles (admonitions, code highlighting).

## Light / dark mode

- A sun/moon button (`ThemeToggle`, "Passer en mode sombre / clair") in the top bar of both frontends and on the login
  page switches the whole app.
- The choice is stored in `localStorage.theme` (`light` / `dark`), shared by both frontends (same origin); without a
  stored choice, the system preference applies. An inline script in each `index.html` applies it before first paint.

## Navigation shell (original spec 011)

- Learner app: sticky top bar (brand, Catalogue, Mes cours, Mon XP, Classement, language, theme, account, "⚙ Admin",
  Déconnexion). Below the `md` breakpoint the links move to a drawer opened by "Menu".
- Admin app: left sidebar (Tableau de bord, Cours, Catégories, Utilisateurs, Retour au catalogue) and a top bar
  (language, theme, account, Déconnexion); below `md` the sidebar is a drawer.

## Components

`packages/ui/src/components/ui/*` (added with the shadcn CLI): alert, avatar, badge (+ `success`, `warning`, `xp`,
`info`, `muted` variants), button, card, dropdown-menu, input, label, native-select, progress, separator, sheet,
skeleton, table, textarea, tooltip. Pupitre blocks in `packages/ui`: `PageHeader`, `EmptyState`, `LoadingState`,
`ErrorState`, `ThemeToggle`, `LanguageSwitcher`, course badges (`DifficultyBadge`, `StatusBadge`, `VisibilityBadge`,
`LevelBadge`, `CategoryLabel`).

Native `<select>` elements are kept (styled `NativeSelect`) so forms stay accessible and testable.

## Acceptance criteria

- Toggling the theme persists across reloads and between the learner and admin apps.
- At phone width, navigation is reachable through the drawer.

## Source

`packages/ui/src/styles/globals.css`, `packages/ui/src/components/`, `packages/ui/components.json`,
`apps/app/src/routes/Layout.tsx`, `apps/admin/src/routes/AdminLayout.tsx`, `e2e/theme.spec.ts`.
