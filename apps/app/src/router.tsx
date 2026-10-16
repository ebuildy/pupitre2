import { LoginPage, RequireAuth } from '@pupitre/auth-ui'
import { createBrowserRouter, Navigate } from 'react-router'
import { demoAccounts } from './lib/demo-accounts.ts'
import { Catalogue } from './routes/Catalogue.tsx'
import { CourseDetail } from './routes/CourseDetail.tsx'
import { LessonPage } from './routes/LessonPage.tsx'
import { QuizPage } from './routes/QuizPage.tsx'
import { Layout } from './routes/Layout.tsx'
import { Leaderboard } from './routes/Leaderboard.tsx'
import { MyCourses } from './routes/MyCourses.tsx'
import { MyXp } from './routes/MyXp.tsx'

// `/admin/*` is the admin app (apps/admin), served on the same origin.
export const router = createBrowserRouter([
  { path: 'login', element: <LoginPage demoAccounts={demoAccounts} /> },
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/courses" replace /> },
      { path: 'dashboard', element: <Navigate to="/courses" replace /> },
      { path: 'courses', element: <Catalogue /> },
      { path: 'courses/:slug', element: <CourseDetail /> },
      {
        path: 'courses/:slug/lessons/:moduleSlug',
        element: (
          <RequireAuth>
            <LessonPage />
          </RequireAuth>
        ),
      },
      {
        path: 'courses/:slug/quiz/:moduleSlug',
        element: (
          <RequireAuth>
            <QuizPage />
          </RequireAuth>
        ),
      },
      {
        path: 'my-courses',
        element: (
          <RequireAuth>
            <MyCourses />
          </RequireAuth>
        ),
      },
      {
        path: 'my-xp',
        element: (
          <RequireAuth>
            <MyXp />
          </RequireAuth>
        ),
      },
      { path: 'leaderboard', element: <Leaderboard /> },
    ],
  },
])
