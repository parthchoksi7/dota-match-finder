import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App.jsx'
import AboutPage from './pages/AboutPage.jsx'
import ReleaseNotesPage from './pages/ReleaseNotesPage.jsx'
import Tournaments from './pages/Tournaments.jsx'
import TournamentDetail from './pages/TournamentDetail.jsx'
import Calendar from './pages/Calendar.jsx'
import AnalyticsPage from './pages/AnalyticsPage.jsx'
import NewsPage from './pages/NewsPage.jsx'
import GlossaryPage from './pages/GlossaryPage.jsx'
import TeamsPage from './pages/TeamsPage.jsx'
import AdminCoveragePage from './pages/AdminCoveragePage.jsx'
import AdminReviewPage from './pages/AdminReviewPage.jsx'
import AdminVodUrlsPage from './pages/AdminVodUrlsPage.jsx'
import ArticlesPage from './pages/ArticlesPage.jsx'
import ArticlePage from './pages/ArticlePage.jsx'
import HeroPage from './pages/HeroPage.jsx'
import FeedbackWidget from './components/FeedbackWidget.jsx'

const path = window.location.pathname

function Root() {
  if (path === '/about') return <AboutPage />
  if (path === '/release-notes') return <ReleaseNotesPage />
  if (path === '/tournaments') return <Tournaments />
  if (path.startsWith('/tournament/')) return <TournamentDetail />
  if (path === '/calendar') return <Calendar />
  if (path === '/analytics') return <AnalyticsPage />
  if (path === '/news') return <NewsPage />
  if (path === '/glossary' || path.startsWith('/glossary/')) return <GlossaryPage />
  if (path === '/teams' || path.startsWith('/teams/')) return <TeamsPage />
  if (path === '/admin/coverage') return <AdminCoveragePage />
  if (path.startsWith('/admin/review/')) return <AdminReviewPage />
  if (path === '/admin/vod-urls') return <AdminVodUrlsPage />
  if (path === '/articles') return <ArticlesPage />
  if (path.startsWith('/articles/')) return <ArticlePage />
  if (path === '/heroes' || path.startsWith('/heroes/')) return <HeroPage />
  return <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
    <FeedbackWidget />
    <Analytics />
    <SpeedInsights />
  </StrictMode>
)
