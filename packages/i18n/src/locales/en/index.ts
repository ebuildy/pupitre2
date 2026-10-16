import type * as fr from '../fr/index.ts'
import type { Messages } from '../../types.ts'

export const common = {
  logout: 'Log out',
  signIn: 'Sign in',
  adminButton: '⚙ Admin',
  backToCatalogue: 'Back to catalogue',
  accessDenied: {
    title: 'Access denied',
    body: "You don't have permission to access this page.",
  },
  language: 'Language',
  roles: {
    student: 'Student',
    manager: 'Group manager',
    admin: 'Administrator',
  },
  difficulty: {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
  },
} satisfies Messages<typeof fr.common>

export const auth = {
  login: {
    identifierLabel: 'Username or e-mail',
    identifierPlaceholder: 'username or e-mail',
    passwordLabel: 'Password',
    passwordPlaceholder: 'password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    errors: {
      emptyFields: 'Please fill in all fields',
      invalidCredentials: 'Invalid username or password',
      generic: 'Sign-in failed',
    },
  },
} satisfies Messages<typeof fr.auth>

export const app = {
  pages: {
    catalogue: 'Catalogue',
    myCourses: 'My courses',
  },
} satisfies Messages<typeof fr.app>

export const admin = {
  title: 'Administration',
  nav: {
    dashboard: 'Dashboard',
  },
  dashboard: {
    title: 'Dashboard',
  },
} satisfies Messages<typeof fr.admin>
