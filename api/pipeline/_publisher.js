/**
 * Pipeline publisher:
 *  1. publishToDb()         — INSERT into Supabase (instant, no redeploy)
 *  2. postXTweet()          — POST to @SpectateDota2 via Twitter API v2
 *  3. updateMetadataFiles() — Atomic GitHub commit: llms.txt + api/sitemap.js
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { getSupabaseAdmin } from '../_supabase.js'
import { postTweet } from '../_x-post.js'

const GITHUB_API = 'https://api.github.com'
const BASE_URL = 'https://spectateesports.live'

// ── GitHub API helper ─────────────────────────────────────────────────────────

async function gh(path, options = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'spectate-pipeline/1.0',
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`GitHub ${res.status} on ${path}: ${err.message || 'unknown'}`)
  }
  return res.json()
}

async function getFileContent(repo, path) {
  const data = await gh(`/repos/${repo}/contents/${path}`)
  return {
    content: Buffer.from(data.content, 'base64').toString('utf8'),
    sha: data.sha,
  }
}

// ── File patching helpers ─────────────────────────────────────────────────────

export function patchLlms(current, article) {
  const dateStr = new Date(article.publishedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
  const entry = `- [${article.title}](${BASE_URL}/articles/${article.slug}) — ${dateStr}. ${article.excerpt}`
  const header = `### ${article.tournamentLabel}`

  if (current.includes(header)) {
    // Prepend before the first bullet in this section
    const sectionStart = current.indexOf(header)
    const firstBullet = current.indexOf('\n- [', sectionStart)
    if (firstBullet !== -1) {
      return current.slice(0, firstBullet + 1) + entry + '\n' + current.slice(firstBullet + 1)
    }
    // Section exists but no bullets yet
    const endOfHeader = current.indexOf('\n', sectionStart) + 1
    return current.slice(0, endOfHeader) + '\n' + entry + '\n' + current.slice(endOfHeader)
  }

  // New tournament — insert before the first existing ### subsection
  const firstSubsection = current.indexOf('\n### ')
  if (firstSubsection !== -1) {
    const newSection = `### ${article.tournamentLabel} — Coverage\n\n${entry}\n\n`
    return current.slice(0, firstSubsection + 1) + newSection + current.slice(firstSubsection + 1)
  }

  // Fallback: append at end
  return current.trimEnd() + `\n\n### ${article.tournamentLabel} — Coverage\n\n${entry}\n`
}

export function patchSitemap(current, article) {
  // Prepend slug to ARTICLE_SLUGS
  let updated = current.replace(
    'const ARTICLE_SLUGS = [',
    `const ARTICLE_SLUGS = [\n  '${article.slug}',`
  )

  // Add tournament filter URL if new tournament
  const filterMarker = `articles?tournament=${article.tournament}</loc>`
  if (!updated.includes(filterMarker)) {
    const matches = [...updated.matchAll(
      /( {2}<url>\s*\n\s*<loc>\$\{BASE_URL\}\/articles\?tournament=[^<]+<\/loc>[\s\S]*?<\/url>)/g
    )]
    if (matches.length > 0) {
      const last = matches[matches.length - 1]
      const insertAt = last.index + last[0].length
      const newUrlBlock = `\n  <url>\n    <loc>\${BASE_URL}/articles?tournament=${article.tournament}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>`
      updated = updated.slice(0, insertAt) + newUrlBlock + updated.slice(insertAt)
    }
  }

  return updated
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function publishToDb(article) {
  const { error } = await getSupabaseAdmin()
    .from('articles')
    .upsert({
      slug: article.slug,
      title: article.title,
      subtitle: article.subtitle ?? null,
      published_at: article.publishedAt,
      expires_at: article.expiresAt ?? null,
      tournament: article.tournament,
      tournament_label: article.tournamentLabel,
      category: article.category,
      reading_time: article.readingTime ?? 2,
      watch_query: article.watchQuery ?? null,
      watch_label: article.watchLabel ?? null,
      excerpt: article.excerpt,
      sections: article.sections,
      status: 'published',
    }, { onConflict: 'slug' })

  if (error) throw new Error(`Supabase insert failed: ${error.message}`)
  return `${BASE_URL}/articles/${article.slug}`
}

export async function postXTweet(xPostText) {
  const result = await postTweet(xPostText.slice(0, 280))
  if (!result.data?.id) {
    const detail = result.errors?.[0]?.message || result.title || JSON.stringify(result)
    throw new Error(`X post failed: ${detail}`)
  }
  return {
    id: result.data.id,
    url: `https://x.com/SpectateDota2/status/${result.data.id}`,
  }
}

export async function updateMetadataFiles(article) {
  const repo = process.env.GITHUB_REPO

  const [llmsFile, sitemapFile] = await Promise.all([
    getFileContent(repo, 'public/llms.txt'),
    getFileContent(repo, 'api/sitemap.js'),
  ])

  const newLlms = patchLlms(llmsFile.content, article)
  const newSitemap = patchSitemap(sitemapFile.content, article)

  // Build atomic commit via git trees API
  const refData = await gh(`/repos/${repo}/git/refs/heads/main`)
  const headSha = refData.object.sha
  const commitData = await gh(`/repos/${repo}/git/commits/${headSha}`)
  const treeSha = commitData.tree.sha

  const [llmsBlob, sitemapBlob] = await Promise.all([
    gh(`/repos/${repo}/git/blobs`, { method: 'POST', body: { content: newLlms, encoding: 'utf-8' } }),
    gh(`/repos/${repo}/git/blobs`, { method: 'POST', body: { content: newSitemap, encoding: 'utf-8' } }),
  ])

  const newTree = await gh(`/repos/${repo}/git/trees`, {
    method: 'POST',
    body: {
      base_tree: treeSha,
      tree: [
        { path: 'public/llms.txt', mode: '100644', type: 'blob', sha: llmsBlob.sha },
        { path: 'api/sitemap.js', mode: '100644', type: 'blob', sha: sitemapBlob.sha },
      ],
    },
  })

  const newCommit = await gh(`/repos/${repo}/git/commits`, {
    method: 'POST',
    body: {
      message: `seo: add "${article.title}" to llms.txt and sitemap\n\nPublished via editorial pipeline.`,
      tree: newTree.sha,
      parents: [headSha],
    },
  })

  await gh(`/repos/${repo}/git/refs/heads/main`, {
    method: 'PATCH',
    body: { sha: newCommit.sha },
  })

  return newCommit.sha
}
