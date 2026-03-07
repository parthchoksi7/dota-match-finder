import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.jsx'
import AboutPage from './pages/AboutPage.jsx'
import ReleaseNotesPage from './pages/ReleaseNotesPage.jsx'

const path = window.location.pathname

function Root() {
  if (path === '/about') return <AboutPage />
  if (path === '/release-notes') return <ReleaseNotesPage />
  return <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
    <Analytics />
  </StrictMode>
)
