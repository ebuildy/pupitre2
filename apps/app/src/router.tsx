import { LoginPage, RegisterPage, RequireAuth } from '@pupitre/auth-ui'
import { createBrowserRouter, Navigate } from 'react-router'
import { ManagerGroups } from './routes/manager/ManagerGroups.tsx'
import { ManagerLayout } from './routes/manager/ManagerLayout.tsx'
import { ManagerMembers } from './routes/manager/ManagerMembers.tsx'
import { MyBadges } from './routes/MyBadges.tsx'
import { MyGroups } from './routes/MyGroups.tsx'
import { MySkills } from './routes/MySkills.tsx'
import { SkillPage } from './routes/SkillPage.tsx'
import { demoAccounts } from './lib/demo-accounts.ts'
import { Catalogue } from './routes/Catalogue.tsx'
import { CourseDetail } from './routes/CourseDetail.tsx'
import { LessonPage } from './routes/LessonPage.tsx'
import { QuizPage } from './routes/QuizPage.tsx'
import { Layout } from './routes/Layout.tsx'
import { Leaderboard } from './routes/Leaderboard.tsx'
import { MyCourses } from './routes/MyCourses.tsx'
import { MyXp } from './routes/MyXp.tsx'
import { Profile } from './routes/Profile.tsx'
import { PublicProfile } from './routes/PublicProfile.tsx'

// `/admin/*` is the admin app (apps/admin), served on the same origin.
export const router = createBrowserRouter([
  { path: 'login', element: <LoginPage demoAccounts={demoAccounts} /> },
  { path: 'register', element: <RegisterPage /> },
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
      {
        path: 'profile',
        element: (
          <RequireAuth>
            <Profile />
          </RequireAuth>
        ),
      },
      { path: 'users/:id', element: <PublicProfile /> },
      {
        path: 'my-badges',
        element: (
          <RequireAuth>
            <MyBadges />
          </RequireAuth>
        ),
      },
      {
        path: 'my-skills',
        element: (
          <RequireAuth>
            <MySkills />
          </RequireAuth>
        ),
      },
      { path: 'skills/:slug', element: <SkillPage /> },
      {
        path: 'my-groups',
        element: (
          <RequireAuth>
            <MyGroups />
          </RequireAuth>
        ),
      },
      {
        path: 'manager',
        element: (
          <RequireAuth>
            <ManagerLayout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <Navigate to="/manager/users" replace /> },
          { path: 'users', element: <ManagerMembers /> },
          { path: 'groups', element: <ManagerGroups /> },
        ],
      },
    ],
  },
])
