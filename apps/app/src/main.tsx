import { Toaster } from '@pupitre/ui/components/ui/sonner'
import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import '@pupitre/i18n'
import './index.css'
import { queryClient } from './lib/query-client.ts'
import { router } from './router.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Animations follow the system's "reduce motion" preference. */}
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
      </MotionConfig>
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
