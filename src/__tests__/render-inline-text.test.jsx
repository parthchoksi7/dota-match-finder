/**
 * renderInlineText (src/utils/articleInlineLinks.jsx) -- the minimal `[label](/path)` markdown-link
 * parser article body text is allowed to use (2026-08-16). Mirrored server-side by
 * middleware.js's renderInlineTextHtml() for the no-JS/bot SSR shell -- see that
 * function's test (__tests__/render-inline-text-html.test.js) for the HTML-string side.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { renderInlineText } from '../utils/articleInlineLinks'

vi.mock('../utils', () => ({ trackEvent: vi.fn() }))
import { trackEvent } from '../utils'

function Wrapper({ text }) {
  return <p>{renderInlineText(text)}</p>
}

describe('renderInlineText', () => {
  it('renders a real, correctly-targeted anchor for inline link syntax', () => {
    render(<Wrapper text="Check out [Team Spirit](/teams/team-spirit) today." />)
    const link = screen.getByRole('link', { name: 'Team Spirit' })
    expect(link).toHaveAttribute('href', '/teams/team-spirit')
    expect(screen.getByText(/Check out/)).toBeInTheDocument()
    expect(screen.getByText(/today\./)).toBeInTheDocument()
  })

  it('renders multiple links in the same string, each with its own target', () => {
    render(<Wrapper text="[Iron Wing](/teams/1win) vs. [Team Spirit](/teams/team-spirit)" />)
    expect(screen.getByRole('link', { name: 'Iron Wing' })).toHaveAttribute('href', '/teams/1win')
    expect(screen.getByRole('link', { name: 'Team Spirit' })).toHaveAttribute('href', '/teams/team-spirit')
  })

  it('renders plain text untouched when there is no link syntax', () => {
    render(<Wrapper text="No links here." />)
    expect(screen.getByText('No links here.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('does not render literal bracket syntax as text once a link is parsed', () => {
    render(<Wrapper text="Visit [Team Spirit](/teams/team-spirit)." />)
    expect(screen.queryByText(/\[Team Spirit\]/)).toBeNull()
  })

  it('fires article_inline_link_click with the href on click', () => {
    render(<Wrapper text="[Team Spirit](/teams/team-spirit)" />)
    fireEvent.click(screen.getByRole('link', { name: 'Team Spirit' }))
    expect(trackEvent).toHaveBeenCalledWith('article_inline_link_click', { href: '/teams/team-spirit' })
  })

  it('does not render a link for a non-internal href -- shows the original bracket text instead', () => {
    render(<Wrapper text="[evil](https://evil.com)" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('[evil](https://evil.com)')).toBeInTheDocument()
  })

  it('does not render a link for a javascript: href', () => {
    render(<Wrapper text="[click me](javascript:alert(1))" />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('leaves unmatched bracket syntax untouched', () => {
    render(<Wrapper text="[not a link] and (not a link either)" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('[not a link] and (not a link either)')).toBeInTheDocument()
  })
})
