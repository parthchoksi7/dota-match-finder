import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.jsx'
import AboutPage from './pages/AboutPage.jsx'
import ReleaseNotesPage from './pages/ReleaseNotesPage.jsx'
import Tournaments from './pages/Tournaments.jsx'
import TournamentDetail from './pages/TournamentDetail.jsx'
import Calendar from './pages/Calendar.jsx'

const path = window.location.pathname

function Root() {
  if (path === '/about') return <AboutPage />
  if (path === '/release-notes') return <ReleaseNotesPage />
  if (path === '/tournaments') return <Tournaments />
  if (path.startsWith('/tournament/')) return <TournamentDetail />
  if (path === '/calendar') return <Calendar />
  return <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
    <Analytics />
  </StrictMode>
)
