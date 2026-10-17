# 012 — Toast notifications

| Field | Value |
| --- | --- |
| Area | UI |
| Related | [010](010-theme.md) |

## Behaviour

- shadcn/ui `Toaster` (sonner) mounted once in each frontend, top right, 4 s, following the light/dark theme.
- Call `toast.success(message)`, `toast.error(message)`, `toast.info`, `toast.warning` (`toast` exported by `@pupitre/ui`).
- Mutations report success with a translated message and failure with the API's `error` message.

## Differences from the original

- sonner instead of a hand-made container; existing admin pages still show inline messages and move to toasts when they
  are reworked.

## Source

`packages/ui/src/components/ui/sonner.tsx`, `apps/app/src/main.tsx`, `apps/admin/src/main.tsx`.
