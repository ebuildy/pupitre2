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
import { GroupDetail } from './routes/groups/GroupDetail.tsx'
import { GroupList } from './routes/groups/GroupList.tsx'
import { Leaderboard } from './routes/Leaderboard.tsx'
import { Settings } from './routes/Settings.tsx'
import { UserDetail } from './routes/users/UserDetail.tsx'
import { UserList } from './routes/users/UserList.tsx'

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
        { path: 'groups', element: <GroupList /> },
        { path: 'groups/:id', element: <GroupDetail /> },
        { path: 'users', element: <UserList /> },
        { path: 'users/:id', element: <UserDetail /> },
        { path: 'leaderboard', element: <Leaderboard /> },
        { path: 'settings', element: <Settings /> },
      ],
    },
  ],
  { basename: '/admin' },
)
