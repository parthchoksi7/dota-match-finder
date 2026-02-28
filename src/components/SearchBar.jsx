import { useState } from "react"

function SearchBar({ onSearch }) {
  const [query, setQuery] = useState("")
  const [searchType, setSearchType] = useState("team")

  function handleSubmit(e) {
    e.preventDefault()
    if (query.trim()) {
      onSearch(query, searchType)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex gap-4 mb-4 justify-center">
        <button
          onClick={() => setSearchType("team")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            searchType === "team"
              ? "bg-red-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          By Team / Player
        </button>
        <button
          onClick={() => setSearchType("tournament")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            searchType === "tournament"
              ? "bg-red-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          By Tournament
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            searchType === "team"
              ? "Search for a team or player..."
              : "Search for a tournament..."
          }
          className="flex-1 px-4 py-3 rounded-lg bg-gray-800 text-white border border-gray-600 focus:outline-none focus:border-red-500 placeholder-gray-500"
        />
        <button
          type="submit"
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
        >
          Search
        </button>
      </form>
    </div>
  )
}

export default SearchBar