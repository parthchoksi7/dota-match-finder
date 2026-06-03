/**
 * Unit tests for pipeline/_publisher.js file-patching utilities.
 *
 * patchLlms and patchSitemap are pure string functions that modify production
 * files on every article publish. Bugs here would silently corrupt llms.txt
 * or sitemap.js, so these tests are critical.
 */

import { describe, it, expect } from 'vitest'
import { patchLlms, patchSitemap } from '../api/pipeline/_publisher.js'

// ── Test fixtures ────────────────────────────────────────────────────────────

const article = {
  slug: 'blast-slam-vii-liquid-wins-grand-final',
  title: 'Team Liquid Wins BLAST Slam VII',
  tournamentLabel: 'BLAST Slam VII',
  tournament: 'blast-slam-vii',
  publishedAt: '2026-06-07',
  excerpt: 'Team Liquid defeated LGD Gaming 3-1 in the BLAST Slam VII grand final.',
}

const articleNewTournament = {
  slug: 'pgl-wallachia-s3-spirit-dominates',
  title: 'Spirit Dominates PGL Wallachia S3',
  tournamentLabel: 'PGL Wallachia S3',
  tournament: 'pgl-wallachia-s3',
  publishedAt: '2026-07-01',
  excerpt: 'Team Spirit won PGL Wallachia Season 3 without dropping a series.',
}

const llmsTxtWithExistingSection = `## Editorial Articles

Spectate publishes editorial coverage.

- [Articles Index](https://spectateesports.live/articles): All articles

### BLAST Slam VII — Published Articles

- [Old Article](https://spectateesports.live/articles/blast-slam-vii-old) — June 5, 2026. Old article excerpt.

### Some Other Section

Content here.
`

const llmsTxtEmpty = `## Editorial Articles

Spectate publishes editorial coverage.
`

const sitemapJs = `import { getPremiumLeagueIds } from './_shared.js'

const ARTICLE_SLUGS = [
  'blast-slam-vii-parivision-visa-liquid-replacement',
  'blast-slam-vii-copenhagen-playoffs-preview',
]

export default async function handler(req, res) {
  const BASE_URL = 'https://spectateesports.live'
  const xml = \`<?xml version="1.0" encoding="UTF-8"?>
  <url>
    <loc>\${BASE_URL}/articles</loc>
  </url>
  <url>
    <loc>\${BASE_URL}/articles?tournament=blast-slam-vii</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  \`
}`

// ── patchLlms ────────────────────────────────────────────────────────────────

describe('patchLlms', () => {
  it('prepends new entry before existing bullet in the matching section', () => {
    const result = patchLlms(llmsTxtWithExistingSection, article)
    const lines = result.split('\n')
    const oldIdx = lines.findIndex(l => l.includes('blast-slam-vii-old'))
    const newIdx = lines.findIndex(l => l.includes('blast-slam-vii-liquid-wins-grand-final'))
    expect(newIdx).toBeGreaterThan(-1)
    expect(newIdx).toBeLessThan(oldIdx)
  })

  it('includes the article title, URL, and excerpt in the entry', () => {
    const result = patchLlms(llmsTxtWithExistingSection, article)
    expect(result).toContain('Team Liquid Wins BLAST Slam VII')
    expect(result).toContain('/articles/blast-slam-vii-liquid-wins-grand-final')
    expect(result).toContain('Team Liquid defeated LGD Gaming 3-1')
  })

  it('does not duplicate the section header', () => {
    const result = patchLlms(llmsTxtWithExistingSection, article)
    const count = (result.match(/### BLAST Slam VII/g) || []).length
    expect(count).toBe(1)
  })

  it('creates a new section when the tournament is not yet in the file', () => {
    const result = patchLlms(llmsTxtWithExistingSection, articleNewTournament)
    expect(result).toContain('### PGL Wallachia S3')
    expect(result).toContain('pgl-wallachia-s3-spirit-dominates')
  })

  it('new section appears before existing ### sections (newest first)', () => {
    const result = patchLlms(llmsTxtWithExistingSection, articleNewTournament)
    const newSectionIdx = result.indexOf('### PGL Wallachia S3')
    const oldSectionIdx = result.indexOf('### BLAST Slam VII')
    expect(newSectionIdx).toBeLessThan(oldSectionIdx)
  })

  it('handles file with no existing tournament sections gracefully', () => {
    const result = patchLlms(llmsTxtEmpty, article)
    expect(result).toContain('### BLAST Slam VII')
    expect(result).toContain('blast-slam-vii-liquid-wins-grand-final')
  })

  it('does not corrupt surrounding content', () => {
    const result = patchLlms(llmsTxtWithExistingSection, article)
    expect(result).toContain('### Some Other Section')
    expect(result).toContain('Content here.')
    expect(result).toContain('Spectate publishes editorial coverage.')
  })
})

// ── patchSitemap ─────────────────────────────────────────────────────────────

describe('patchSitemap', () => {
  it('prepends the new slug to ARTICLE_SLUGS', () => {
    const result = patchSitemap(sitemapJs, article)
    expect(result).toContain(`'blast-slam-vii-liquid-wins-grand-final'`)
    const slugsStart = result.indexOf('const ARTICLE_SLUGS = [')
    const newSlugPos = result.indexOf('blast-slam-vii-liquid-wins-grand-final', slugsStart)
    const oldSlugPos = result.indexOf('blast-slam-vii-parivision-visa-liquid-replacement', slugsStart)
    expect(newSlugPos).toBeLessThan(oldSlugPos)
  })

  it('does not add a duplicate tournament filter URL when it already exists', () => {
    const result = patchSitemap(sitemapJs, article)
    const count = (result.match(/articles\?tournament=blast-slam-vii/g) || []).length
    expect(count).toBe(1)
  })

  it('adds a new tournament filter URL when it is a new tournament', () => {
    const result = patchSitemap(sitemapJs, articleNewTournament)
    expect(result).toContain('articles?tournament=pgl-wallachia-s3')
  })

  it('does not corrupt the existing ARTICLE_SLUGS entries', () => {
    const result = patchSitemap(sitemapJs, article)
    expect(result).toContain(`'blast-slam-vii-parivision-visa-liquid-replacement'`)
    expect(result).toContain(`'blast-slam-vii-copenhagen-playoffs-preview'`)
  })

  it('preserves the rest of the sitemap file', () => {
    const result = patchSitemap(sitemapJs, article)
    expect(result).toContain('getPremiumLeagueIds')
    expect(result).toContain('export default async function handler')
  })
})
