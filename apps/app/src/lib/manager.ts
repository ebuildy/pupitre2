import { useSession } from '@pupitre/auth-ui'
import { unwrap } from '@pupitre/ui'
import { useQuery } from '@tanstack/react-query'
import { api } from './api.ts'

/** Spec 140: what the signed-in user manages; `canManage` opens "Mon espace". */
export function useManagerScope() {
  const { data: session } = useSession()
  return useQuery({
    queryKey: ['manager-scope', session?.user.id ?? null],
    queryFn: () => unwrap(api.api.manager.scope.$get()),
    enabled: !!session,
  })
}
