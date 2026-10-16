import { LoginPage, RequireAuth } from '@pupitre/auth-ui'
import { createBrowserRouter } from 'react-router'
import { AdminLayout } from './routes/AdminLayout.tsx'
import { Dashboard } from './routes/Dashboard.tsx'

export const router = createBrowserRouter(
  [
    { path: 'login', element: <LoginPage /> },
    {
      element: (
        <RequireAuth roles={['admin']}>
          <AdminLayout />
        </RequireAuth>
      ),
      children: [{ index: true, element: <Dashboard /> }],
    },
  ],
  { basename: '/admin' },
)
