import { LoginPage, RequireAuth } from '@pupitre/auth-ui'
import { createBrowserRouter, Navigate } from 'react-router'
import { Catalogue } from './routes/Catalogue.tsx'
import { CourseDetail } from './routes/CourseDetail.tsx'
import { Layout } from './routes/Layout.tsx'
import { MyCourses } from './routes/MyCourses.tsx'

// `/admin/*` is the admin app (apps/admin), served on the same origin.
export const router = createBrowserRouter([
  { path: 'login', element: <LoginPage /> },
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/courses" replace /> },
      { path: 'dashboard', element: <Navigate to="/courses" replace /> },
      { path: 'courses', element: <Catalogue /> },
      { path: 'courses/:slug', element: <CourseDetail /> },
      {
        path: 'my-courses',
        element: (
          <RequireAuth>
            <MyCourses />
          </RequireAuth>
        ),
      },
    ],
  },
])
