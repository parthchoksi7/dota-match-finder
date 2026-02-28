import { useState } from "react"

function SearchBar({ onSearch, loading }) {
  const [query, setQuery] = useState("")
  const [searchType, setSearchType] = useState("team")

  function handleSubmit(e) {
    e.preventDefault()
    if (query.trim()) onSearch(query, searchType)
  }

  return (
    <div className="w-full">
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setSearchType("team")}
          className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-widest border transition-all ${
            searchType === "team"
              ? "bg-red-600 border-red-600 text-white"
              : "bg-transparent border-gray-600 text-gray-400 hover:border-gray-400"
          }`}
        >
          Team / Player
        </button>
        <button
          onClick={() => setSearchType("tournament")}
          className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-widest border transition-all ${
            searchType === "tournament"
              ? "bg-red-600 border-red-600 text-white"
              : "bg-transparent border-gray-600 text-gray-400 hover:border-gray-400"
          }`}
        >
          Tournament
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchType === "team" ? "e.g. Team Liquid, Tundra..." : "e.g. DreamLeague, ESL..."}
          className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-red-500 placeholder-gray-600 transition-colors"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-900 text-white text-sm font-semibold uppercase tracking-wider transition-colors"
        >
          {loading ? "..." : "Search"}
        </button>
      </form>
    </div>
  )
}

export default SearchBar