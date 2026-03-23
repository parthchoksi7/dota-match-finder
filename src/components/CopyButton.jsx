import { useState } from "react"

export default function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`shrink-0 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border rounded transition-colors focus-ring ${
        copied
          ? "border-green-600 text-green-600 dark:border-green-500 dark:text-green-500"
          : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600"
      }`}
    >
      {copied ? "Copied!" : label}
    </button>
  )
}
