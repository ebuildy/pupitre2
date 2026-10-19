import { LoginPage, RegisterPage, RequireAuth } from '@pupitre/auth-ui'
import { createBrowserRouter, Navigate } from 'react-router'
import { ManagerExports } from './routes/manager/ManagerExports.tsx'
import { ManagerGroups } from './routes/manager/ManagerGroups.tsx'
import { ManagerLayout } from './routes/manager/ManagerLayout.tsx'
import { ManagerMembers } from './routes/manager/ManagerMembers.tsx'
import { ManagerPaths } from './routes/manager/ManagerPaths.tsx'
import { MyPathDetail } from './routes/MyPaths.tsx'
import { SkillPage } from './routes/SkillPage.tsx'
import { demoAccounts, ssoDemoAccounts } from './lib/demo-accounts.ts'
import { Agenda } from './routes/Agenda.tsx'
import { Attendance } from './routes/Attendance.tsx'
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
  { path: 'login', element: <LoginPage demoAccounts={demoAccounts} ssoDemoAccounts={ssoDemoAccounts} /> },
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
      // Now tabs of the profile page; old links keep working.
      { path: 'my-paths', element: <Navigate to="/profile?tab=paths" replace /> },
      {
        path: 'my-paths/:slug',
        element: (
          <RequireAuth>
            <MyPathDetail />
          </RequireAuth>
        ),
      },
      // Now tabs of the profile page; old links keep working.
      { path: 'my-badges', element: <Navigate to="/profile?tab=badges" replace /> },
      // Now tabs of the profile page; old links keep working.
      { path: 'my-skills', element: <Navigate to="/profile?tab=skills" replace /> },
      { path: 'skills/:slug', element: <SkillPage /> },
      {
        path: 'agenda',
        element: (
          <RequireAuth>
            <Agenda />
          </RequireAuth>
        ),
      },
      {
        path: 'sessions/:id/attendance',
        element: (
          <RequireAuth>
            <Attendance />
          </RequireAuth>
        ),
      },
      // Now a section of the profile page; old links keep working.
      { path: 'my-groups', element: <Navigate to="/profile?tab=groups" replace /> },
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
          { path: 'paths', element: <ManagerPaths /> },
          { path: 'exports', element: <ManagerExports /> },
        ],
      },
    ],
  },
])
