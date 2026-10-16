import { createBrowserRouter, Navigate } from 'react-router'
import { RequireAuth } from './components/RequireAuth.tsx'
import { Layout } from './routes/Layout.tsx'
import { Login } from './routes/Login.tsx'
import { Placeholder } from './routes/Placeholder.tsx'

export const router = createBrowserRouter([
  { path: 'login', element: <Login /> },
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/courses" replace /> },
      { path: 'dashboard', element: <Navigate to="/courses" replace /> },
      { path: 'courses', element: <Placeholder title="Catalogue" /> },
      {
        path: 'my-courses',
        element: (
          <RequireAuth>
            <Placeholder title="Mes cours" />
          </RequireAuth>
        ),
      },
      {
        path: 'admin',
        element: (
          <RequireAuth roles={['admin']}>
            <Placeholder title="Administration" />
          </RequireAuth>
        ),
      },
    ],
  },
])
