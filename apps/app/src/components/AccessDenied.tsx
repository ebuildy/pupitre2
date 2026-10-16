import { Link } from 'react-router'

export function AccessDenied() {
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">Accès refusé</h1>
      <p className="text-zinc-600 dark:text-zinc-400">Vous n'avez pas les droits nécessaires pour accéder à cette page.</p>
      <Link to="/courses" className="rounded bg-zinc-900 px-3 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">
        Retour au catalogue
      </Link>
    </div>
  )
}
