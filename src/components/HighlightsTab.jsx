import { useState, useEffect } from 'react'
import { trackEvent } from '../utils'

function timeAgo(isoDate) {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

export default function HighlightsTab({ tournamentName, spoilerFree, beginAt, endAt, limit }) {
  const [videos, setVideos] = useState(null)
  const [channelHandle, setChannelHandle] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [retryKey, setRetryKey] = useState(0)
  const [selectedVideoId, setSelectedVideoId] = useState(null)

  useEffect(() => {
    if (!tournamentName) return
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ mode: 'highlights', name: tournamentName })
    if (beginAt) params.set('beginAt', beginAt)
    if (endAt) params.set('endAt', endAt)
    fetch(`/api/tournaments?${params.toString()}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setVideos(data.videos || [])
        setChannelHandle(data.channelHandle || null)
        setSelectedVideoId(null)
        trackEvent('tournament_highlights_view', {
          tournamentName,
          videoCount: (data.videos || []).length,
          channelHandle: data.channelHandle,
        })
      })
      .catch(err => {
        console.error('[highlights] fetch error:', err)
        setError(true)
      })
      .finally(() => setLoading(false))
  }, [tournamentName, beginAt, endAt, retryKey])

  function handleVideoClick(video) {
    const isExpanding = selectedVideoId !== video.videoId
    setSelectedVideoId(isExpanding ? video.videoId : null)
    trackEvent('highlights_video_open', {
      videoId: video.videoId,
      action: isExpanding ? 'expand' : 'collapse',
      tournamentName,
    })
  }

  if (loading) return <HighlightsSkeleton />

  if (error) return (
    <div className="py-8 text-center flex flex-col items-center gap-4">
      <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
        Could not load highlights
      </p>
      <button
        onClick={() => { setError(null); setRetryKey(k => k + 1) }}
        className="px-4 py-2 text-xs font-semibold uppercase tracking-wide border border-gray-300 dark:border-gray-700 rounded hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
      >
        Try again
      </button>
    </div>
  )

  if (videos !== null && videos.length === 0) return (
    <div className="py-8 text-center flex flex-col items-center gap-3">
      <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
        No highlights found yet
      </p>
      {channelHandle && (
        <a
          href={`https://www.youtube.com/${channelHandle}/videos`}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          onClick={() => trackEvent('highlights_channel_link', { channelHandle, source: 'empty_state' })}
        >
          View channel on YouTube →
        </a>
      )}
    </div>
  )

  if (videos === null) return null

  const displayVideos = limit ? videos.slice(0, limit) : videos
  const selectedVideo = displayVideos.find(v => v.videoId === selectedVideoId)

  return (
    <div className="flex flex-col gap-3">

      {/* Video thumbnail grid */}
      <div className={`grid gap-2 ${limit ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
        {displayVideos.map((video, i) => (
          <VideoCard
            key={video.videoId}
            video={video}
            index={i}
            isSelected={video.videoId === selectedVideoId}
            spoilerFree={spoilerFree}
            onClick={() => handleVideoClick(video)}
          />
        ))}
      </div>

      {/* Inline player — shown below grid when a video is selected */}
      {selectedVideo && (
        <div className="rounded border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="aspect-video">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${selectedVideo.videoId}?autoplay=1&rel=0`}
              title={spoilerFree ? 'Highlight video' : selectedVideo.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full"
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* Channel link footer */}
      {channelHandle && (
        <a
          href={`https://www.youtube.com/${channelHandle}/videos`}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 text-center transition-colors"
          onClick={() => trackEvent('highlights_channel_link', { channelHandle, source: 'footer' })}
        >
          View all on YouTube →
        </a>
      )}
    </div>
  )
}

function VideoCard({ video, index, isSelected, spoilerFree, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded border overflow-hidden transition-colors min-h-[44px] ${
        isSelected
          ? 'border-red-500 dark:border-red-500'
          : 'border-gray-200 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-600'
      }`}
    >
      {/* Thumbnail */}
      <div className={`relative aspect-video bg-gray-100 dark:bg-gray-800 overflow-hidden ${spoilerFree ? 'blur-sm brightness-50' : ''}`}>
        <img
          src={video.thumbnail}
          alt={spoilerFree ? `Highlight ${index + 1}` : video.title}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        {/* Play indicator overlay */}
        <div className={`absolute inset-0 flex items-center justify-center bg-black/0 transition-colors ${isSelected ? 'bg-black/40' : 'hover:bg-black/20'}`}>
          <svg
            className={`w-7 h-7 text-white drop-shadow transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0'}`}
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>

      {/* Metadata */}
      <div className="px-2 py-1.5 bg-white dark:bg-gray-900">
        <p className={`text-[11px] font-semibold leading-snug line-clamp-2 ${
          isSelected ? 'text-red-500' : 'text-gray-900 dark:text-white'
        }`}>
          {spoilerFree ? `Highlight ${index + 1}` : video.title}
        </p>
        {video.publishedAt && (
          <p className="text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-600 mt-0.5">
            {timeAgo(video.publishedAt)}
          </p>
        )}
      </div>
    </button>
  )
}

function HighlightsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {[58, 72, 64, 50, 68, 56].map((w, i) => (
        <div key={i} className="rounded border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="aspect-video bg-gray-200 dark:bg-gray-800 animate-pulse" />
          <div className="px-2 py-1.5 bg-white dark:bg-gray-900 flex flex-col gap-1">
            <div className={`h-2.5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse`} style={{ width: `${w}%` }} />
            <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}
