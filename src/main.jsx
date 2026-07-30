import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/browser'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'

// No-ops (SDK stays disabled, nothing is sent) when VITE_SENTRY_DSN is unset — same
// "silently disabled if missing" convention as the other optional integrations in this app.
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0, // error tracking only — no perf/tracing spend until that's actually wanted
})
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
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
import PlayersPage from './pages/PlayersPage.jsx'
import TIHistoryPage from './pages/TIHistoryPage.jsx'
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
  if (path === '/players' || path.startsWith('/players/')) return <PlayersPage />
  if (path === '/tournaments/the-international') return <TIHistoryPage />
  return <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Only Root is wrapped: FeedbackWidget stays outside so a crashed page still leaves the
        user a way to report the crash, and Analytics/SpeedInsights keep reporting the session. */}
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
    <FeedbackWidget />
    <Analytics />
    <SpeedInsights />
  </StrictMode>
)
