code = '''import { useState, useEffect } from "react"
import SearchBar from "./components/SearchBar"
import MatchList from "./components/MatchList"
import { fetchProMatches, findTwitchVod } from "./api"

function WatchButton({ url }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-2 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold uppercase tracking-widest px-5 py-2.5 transition-colors">
      Watch on Twitch
    </a>
  )
}

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
      .catch(() => setError("Failed to load matches."))
  }, [])

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

  async function handleSelectMatch(match) {
    setSelectedMatch({ ...match, loadingVod: true })
    const channels = ["esl_dota2", "dota2ti", "beyond_the_summit", "pgldota2"]
    let vod = null
    for (const channel of channels) {
      vod = await findTwitchVod(channel, match.startTime)
      if (vod) break
    }
    setSelectedMatch({ ...match, loadingVod: false, ...vod })
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-black uppercase tracking-widest text-white">
            Dota <span className="text-red-500">Match</span> Finder
          </h1>
          <p className="text-gray-600 text-xs uppercase tracking-widest mt-0.5">
            Pro matches — direct VOD links
          </p>
        </div>
        <div className="text-xs text-gray-700 uppercase tracking-widest hidden md:block">
          Powered by OpenDota + Twitch
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
        <SearchBar onSearch={handleSearch} loading={loading} />
        {error && (
          <div className="text-red-500 text-xs uppercase tracking-widest">{error}</div>
        )}
        {selectedMatch && (
          <div className="border border-gray-800 bg-gray-900">
            <div className="px-4 py-2 border-b border-gray-800 flex justify-between items-center">
              <span className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Now Watching</span>
              <button onClick={() => setSelectedMatch(null)} className="text-xs text-gray-600 hover:text-gray-400 uppercase tracking-wider">Dismiss x</button>
            </div>
            <div className="px-4 py-4">
              <p className="font-display text-lg font-bold uppercase tracking-wide">
                {selectedMatch.radiantTeam}
                <span className="text-gray-600 mx-2">vs</span>
                {selectedMatch.direTeam}
              </p>
              <p className="text-gray-500 text-xs uppercase tracking-widest mt-1">
                {selectedMatch.tournament} · {selectedMatch.date} · {selectedMatch.duration}
              </p>
              <div className="mt-4">
                {selectedMatch.loadingVod && (
                  <span className="text-xs text-yellow-500 uppercase tracking-widest animate-pulse">Finding VOD...</span>
                )}
                {!selectedMatch.loadingVod && selectedMatch.url && (
                  <WatchButton url={selectedMatch.url} />
                )}
                {!selectedMatch.loadingVod && !selectedMatch.url && (
                  <span className="text-xs text-gray-600 uppercase tracking-widest">No VOD found</span>
                )}
              </div>
            </div>
          </div>
        )}
        {searched && (
          <MatchList matches={matches} onSelect={handleSelectMatch} loading={loading} />
        )}
        {!searched && (
          <div className="border border-gray-800 px-6 py-12 text-center">
            <p className="font-display text-4xl font-black uppercase tracking-widest text-gray-800">Find Any Match</p>
            <p className="text-gray-600 text-xs uppercase tracking-widest mt-2">Search by team or tournament to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
'''

with open('src/App.jsx', 'w') as f:
    f.write(code)

print('Done!')