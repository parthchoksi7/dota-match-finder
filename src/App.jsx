import { useState, useEffect } from "react"
import SearchBar from "./components/SearchBar"
import MatchList from "./components/MatchList"
import { fetchProMatches, findTwitchVod } from "./api"

function App() {
  const [allMatches, setAllMatches] = useState([])
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchProMatches()
      .then((data) => setAllMatches(data))
      .catch(() => setError("Failed to load matches. Try again later."))
  }, [])

async function handleSelectMatch(match) {
    setSelectedMatch({ ...match, loadingVod: true })
    const channels = ["dota2ti", "esl_dota2", "beyond_the_summit", "pgldota2"]
    let vod = null
    for (const channel of channels) {
      vod = await findTwitchVod(channel, match.startTime)
      if (vod) break
    }
    setSelectedMatch({ ...match, loadingVod: false, ...vod })
  }

  function handleSearch(query, searchType) {
    setLoading(true)
    setSelectedMatch(null)
    setTimeout(() => {
      const filtered = allMatches.filter((m) =>
        searchType === "team"
          ? m.radiantTeam.toLowerCase().includes(query.toLowerCase()) ||
            m.direTeam.toLowerCase().includes(query.toLowerCase())
          : m.tournament.toLowerCase().includes(query.toLowerCase())
      )
      setMatches(filtered)
      setLoading(false)
      setSearched(true)
    }, 300)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-950 border-b border-gray-800 px-6 py-4">
        <h1 className="text-2xl font-bold text-red-500 text-center">Dota Match Finder</h1>
        <p className="text-gray-400 text-sm text-center mt-1">
          Find pro matches and jump straight to the VOD
        </p>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-8">
        <SearchBar onSearch={handleSearch} />
        {error && (
          <div className="text-red-400 text-center">{error}</div>
        )}
        
        {selectedMatch && (
          <div className="w-full max-w-2xl mx-auto bg-gray-800 border border-red-500 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-1">
              {selectedMatch.radiantTeam} vs {selectedMatch.direTeam}
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              {selectedMatch.tournament} - {selectedMatch.date}
            </p>
            {selectedMatch.loadingVod && (
              <p className="text-yellow-400 text-sm animate-pulse">Finding VOD...</p>
            )}
            {!selectedMatch.loadingVod && selectedMatch.url && (
              <a
                href={selectedMatch.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                Watch on Twitch
              </a>
            )}
            {!selectedMatch.loadingVod && !selectedMatch.url && (
              <p className="text-gray-500 text-sm">No VOD found for this match. It may have expired or wasn't broadcast on a tracked channel.</p>
            )}
          </div>
        )}

        {searched && (
          <MatchList
            matches={matches}
            onSelect={handleSelectMatch}
            loading={loading}
          />
        )}
        {!searched && (
          <div className="text-center text-gray-600 text-sm mt-4">
            Search for a team like "Liquid" or a tournament like "ESL"
          </div>
        )}
      </div>
    </div>
  )
}

export default App