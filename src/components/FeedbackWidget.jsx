import { useState, useEffect, useRef } from 'react'
import { trackEvent } from '../utils'

const MAX_CHARS = 1000
const MIN_CHARS = 10

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState('')
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [open])

  // Track virtual keyboard height via visualViewport so the drawer stays above it
  useEffect(() => {
    const vv = window.visualViewport
    if (!open || !vv) { setKeyboardOffset(0); return }

    function update() {
      const offset = window.innerHeight - vv.height - vv.offsetTop
      setKeyboardOffset(Math.max(0, offset))
    }

    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setKeyboardOffset(0)
    }
  }, [open])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && open) handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg('')
    if (message.trim().length < MIN_CHARS) {
      setErrorMsg(`Message must be at least ${MIN_CHARS} characters.`)
      return
    }
    setStatus('loading')
    try {
      const res = await fetch('/api/draft-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'feedback',
          message: message.trim(),
          email: email.trim() || undefined,
          page: window.location.pathname,
        }),
      })
      if (res.ok) {
        setStatus('success')
        trackEvent('feedback_submitted', { page: window.location.pathname, has_email: !!email.trim() })
        setTimeout(() => {
          handleClose()
        }, 2000)
      } else {
        const data = await res.json().catch(() => ({}))
        setStatus('error')
        setErrorMsg(
          res.status === 429
            ? "You've sent a few messages recently. Try again later."
            : 'Something went wrong. Try again?'
        )
      }
    } catch {
      setStatus('error')
      setErrorMsg('Something went wrong. Try again?')
    }
  }

  function handleClose() {
    if (status === 'loading') return
    setOpen(false)
    setTimeout(() => {
      setStatus('idle')
      setMessage('')
      setEmail('')
      setErrorMsg('')
    }, 200)
  }

  const charsLeft = MAX_CHARS - message.length
  const isOverLimit = charsLeft < 0

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => { setOpen(true); trackEvent('feedback_opened', { page: window.location.pathname }) }}
        className="fixed bottom-[72px] right-4 md:bottom-5 md:right-5 z-40 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-medium px-3.5 py-2 rounded-full shadow-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        aria-label="Open feedback form"
      >
        <ChatIcon />
        Feedback
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          aria-hidden="true"
          onClick={handleClose}
        />
      )}

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Send feedback"
        style={keyboardOffset > 0 ? { bottom: keyboardOffset } : undefined}
        className={[
          'fixed z-50 transition-all duration-200',
          // Mobile: bottom sheet
          'bottom-0 left-0 right-0 rounded-t-2xl',
          // Desktop: floating panel above button
          'sm:bottom-14 sm:right-5 sm:left-auto sm:w-80 sm:rounded-xl',
          'bg-gray-900 border border-gray-700 shadow-2xl',
          open
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : 'translate-y-4 opacity-0 pointer-events-none',
        ].join(' ')}
      >
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-white">Send feedback</p>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-white transition-colors p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              aria-label="Close feedback form"
            >
              <CloseIcon />
            </button>
          </div>

          {status === 'success' ? (
            <div className="py-6 text-center">
              <CheckIcon className="mx-auto mb-2 text-green-400" />
              <p className="text-sm text-green-400 font-medium">Sent! Thanks for helping build SpectateEsports.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={e => setMessage(e.target.value.slice(0, MAX_CHARS + 50))}
                placeholder="Bug, idea, or anything on your mind…"
                rows={4}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <div className="flex justify-end mb-2">
                <span className={`text-xs ${charsLeft <= 50 ? (isOverLimit ? 'text-red-400' : 'text-yellow-400') : 'text-gray-500'}`}>
                  {charsLeft}
                </span>
              </div>

              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Your email (optional, for reply)"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors mb-3"
              />

              {errorMsg && (
                <p className="text-xs text-red-400 mb-2">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={status === 'loading' || isOverLimit}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                {status === 'loading' ? (
                  <span className="flex items-center justify-center gap-2">
                    <SpinnerIcon />
                    Sending…
                  </span>
                ) : (
                  'Send Feedback'
                )}
              </button>

              <p className="text-xs text-gray-500 mt-2 text-center">
                Building this solo — your feedback matters.
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  )
}

function ChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  )
}

function CheckIcon({ className }) {
  return (
    <svg width="32" height="32" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0110 10" />
    </svg>
  )
}
