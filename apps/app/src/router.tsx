import { createBrowserRouter } from 'react-router'
import { Layout } from './routes/Layout.tsx'
import { Home } from './routes/Home.tsx'
import { Login } from './routes/Login.tsx'

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'login', element: <Login /> },
    ],
  },
])
