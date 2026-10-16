import { LoginPage, RequireAuth } from '@pupitre/auth-ui'
import { createBrowserRouter } from 'react-router'
import { AdminLayout } from './routes/AdminLayout.tsx'
import { CategoryEdit } from './routes/categories/CategoryEdit.tsx'
import { CategoryList } from './routes/categories/CategoryList.tsx'
import { CategoryNew } from './routes/categories/CategoryNew.tsx'
import { CourseEdit } from './routes/courses/CourseEdit.tsx'
import { CourseList } from './routes/courses/CourseList.tsx'
import { CourseNew } from './routes/courses/CourseNew.tsx'
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
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'courses', element: <CourseList /> },
        { path: 'courses/new', element: <CourseNew /> },
        { path: 'courses/:id', element: <CourseEdit /> },
        { path: 'categories', element: <CategoryList /> },
        { path: 'categories/new', element: <CategoryNew /> },
        { path: 'categories/:id', element: <CategoryEdit /> },
      ],
    },
  ],
  { basename: '/admin' },
)
