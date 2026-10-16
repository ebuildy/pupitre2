import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { signIn, signUp } from '../lib/auth-client.ts'

// Minimal sign-in / sign-up form to exercise better-auth; the real screens come from specs 020–026.
export function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email'))
    const password = String(form.get('password'))
    const { error } =
      mode === 'signIn'
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name: String(form.get('name')) })
    if (error) return setError(error.message ?? 'Erreur')
    navigate('/')
  }

  const input = 'w-full rounded border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700'

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-12 flex max-w-sm flex-col gap-3">
      <h1 className="text-xl font-semibold">{mode === 'signIn' ? 'Connexion' : 'Inscription'}</h1>
      {mode === 'signUp' && (
        <input name="name" placeholder="Nom" aria-label="Nom" required className={input} />
      )}
      <input name="email" type="email" placeholder="Email" aria-label="Email" required className={input} />
      <input
        name="password"
        type="password"
        placeholder="Mot de passe"
        aria-label="Mot de passe"
        required
        className={input}
      />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button type="submit" className="rounded bg-zinc-900 px-3 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">
        {mode === 'signIn' ? 'Se connecter' : "S'inscrire"}
      </button>
      <button
        type="button"
        className="text-sm underline"
        onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
      >
        {mode === 'signIn' ? 'Créer un compte' : "J'ai déjà un compte"}
      </button>
    </form>
  )
}
