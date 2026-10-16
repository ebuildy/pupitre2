import { ApiRequestError } from '@pupitre/ui'
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Client errors (404, 403…) are answers, not glitches: don't retry them.
      retry: (count, error) => !(error instanceof ApiRequestError && error.status < 500) && count < 2,
    },
  },
})
