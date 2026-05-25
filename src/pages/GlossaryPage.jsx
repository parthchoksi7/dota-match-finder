import { useEffect } from 'react'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import BottomTabBar from '../components/BottomTabBar'
import { GLOSSARY_TERMS, GLOSSARY_TERM_MAP } from '../data/glossary'
import { trackEvent } from '../utils'

function GlossaryPage() {
  const path = window.location.pathname
  const isDetail = path.startsWith('/glossary/') && path.length > '/glossary/'.length
  const termId = isDetail ? path.replace('/glossary/', '').split('/')[0] : null
  const term = termId ? GLOSSARY_TERM_MAP[termId] : null

  if (isDetail && !term) {
    window.location.replace('/glossary')
    return null
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col font-mono">
      <SiteHeader />
      <main className="max-w-2xl mx-auto px-4 py-12 flex-1 w-full pb-20 md:pb-12">
        {isDetail ? <TermDetail term={term} /> : <GlossaryIndex />}
      </main>
      <SiteFooter />
      <BottomTabBar />
    </div>
  )
}

function GlossaryIndex() {
  useEffect(() => { trackEvent('glossary_index_view', {}) }, [])

  return (
    <>
      <p className="text-xs uppercase tracking-[5px] text-red-500 mb-3">Dota 2</p>
      <h1 className="text-3xl font-black uppercase tracking-wide mb-2">Glossary</h1>
      <p className="text-sm uppercase tracking-widest text-gray-500 dark:text-gray-600 mb-12 pb-12 border-b border-gray-200 dark:border-gray-800">
        Key terms for professional Dota 2 · Mechanics, roles, items, objectives
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {GLOSSARY_TERMS.map(t => (
          <a
            key={t.id}
            href={`/glossary/${t.id}`}
            className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40 p-4 rounded hover:border-red-500 dark:hover:border-red-500 transition-colors group"
          >
            <p className="text-xs font-bold uppercase tracking-[3px] text-gray-900 dark:text-white mb-1.5 group-hover:text-red-500 transition-colors">
              {t.term}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 leading-relaxed">{t.shortDef}</p>
          </a>
        ))}
      </div>
    </>
  )
}

function TermDetail({ term }) {
  useEffect(() => { trackEvent('glossary_term_view', { term: term.id }) }, [term.id])

  return (
    <>
      <p className="text-xs uppercase tracking-[5px] text-red-500 mb-3">
        <a href="/glossary" className="hover:text-red-400 transition-colors">Dota 2 Glossary</a>
      </p>
      <h1 className="text-3xl font-black uppercase tracking-wide mb-2">{term.term}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-12 pb-12 border-b border-gray-200 dark:border-gray-800">
        {term.shortDef}
      </p>

      <section className="mb-12">
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{term.definition}</p>
      </section>

      {term.relatedTerms?.length > 0 && (
        <section className="mb-12">
          <p className="text-xs uppercase tracking-[4px] text-red-500 mb-4">Related Terms</p>
          <div className="flex flex-wrap gap-2">
            {term.relatedTerms.map(id => {
              const related = GLOSSARY_TERM_MAP[id]
              if (!related) return null
              return (
                <a
                  key={id}
                  href={`/glossary/${id}`}
                  onClick={() => trackEvent('glossary_related_term_click', { from: term.id, to: id })}
                  className="text-xs uppercase tracking-widest px-3 py-1.5 border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-600 rounded-sm hover:border-red-500 hover:text-red-500 transition-colors"
                >
                  {related.term}
                </a>
              )
            })}
          </div>
        </section>
      )}

      <div className="pt-12 border-t border-gray-200 dark:border-gray-800">
        <a href="/glossary" className="text-xs uppercase tracking-[4px] text-gray-500 hover:text-red-500 transition-colors">
          ← All Terms
        </a>
      </div>
    </>
  )
}

export default GlossaryPage
