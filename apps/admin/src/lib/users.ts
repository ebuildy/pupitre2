import { useSession } from '@pupitre/auth-ui'

/** How a user is named in lists and dialogs: username, else display name. */
export function userLabel(u: { username: string | null; name: string }) {
  return u.username ?? u.name
}

/** The signed-in admin: their own row has no delete button (spec 163). */
export function useSelfId() {
  return useSession().data?.user.id ?? null
}
