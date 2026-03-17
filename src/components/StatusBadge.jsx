export default function StatusBadge({ status }) {
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-500">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
        Live
      </span>
    )
  }
  if (status === 'upcoming') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400">
        Upcoming
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500">
      Completed
    </span>
  )
}
