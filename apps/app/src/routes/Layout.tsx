import { Link, Outlet, useNavigate } from 'react-router'
import { signOut, useSession } from '../lib/auth-client.ts'

export function Layout() {
  const { data: session, isPending } = useSession()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <Link to="/" className="font-semibold">
          pupitre
        </Link>
        {!isPending &&
          (session ? (
            <div className="flex items-center gap-3">
              <span data-testid="current-user">{session.user.name}</span>
              <button
                type="button"
                className="rounded border px-2 py-1 text-sm"
                onClick={async () => {
                  await signOut()
                  navigate('/login')
                }}
              >
                Déconnexion
              </button>
            </div>
          ) : (
            <Link to="/login" className="text-sm underline">
              Se connecter
            </Link>
          ))}
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Outlet />
      </main>
    </div>
  )
}
