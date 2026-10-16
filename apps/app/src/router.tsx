import { LoginPage, RequireAuth } from '@pupitre/auth-ui'
import { createBrowserRouter, Navigate } from 'react-router'
import { Layout } from './routes/Layout.tsx'
import { Placeholder } from './routes/Placeholder.tsx'

// `/admin/*` is the admin app (apps/admin), served on the same origin.
export const router = createBrowserRouter([
  { path: 'login', element: <LoginPage /> },
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/courses" replace /> },
      { path: 'dashboard', element: <Navigate to="/courses" replace /> },
      { path: 'courses', element: <Placeholder page="catalogue" /> },
      {
        path: 'my-courses',
        element: (
          <RequireAuth>
            <Placeholder page="myCourses" />
          </RequireAuth>
        ),
      },
    ],
  },
])
