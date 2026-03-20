import { useState } from 'react';
import AnalyticsChat from '../components/AnalyticsChat';

const SESSION_KEY = 'analytics_auth';

export default function AnalyticsPage() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/analytics-chat?mode=auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: input }),
      });
      if (res.ok) {
        sessionStorage.setItem(SESSION_KEY, '1');
        sessionStorage.setItem('analytics_pw', input);
        setAuthed(true);
      } else {
        setError('Incorrect password');
        setInput('');
      }
    } catch {
      setError('Connection error, try again');
    } finally {
      setLoading(false);
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 w-full max-w-sm">
          <h1 className="text-lg font-semibold mb-1">Analytics</h1>
          <p className="text-gray-400 text-sm mb-6">Enter the password to continue.</p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Password"
              autoFocus
              className="bg-gray-800 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading || !input}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              {loading ? 'Checking...' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="border-b border-gray-800 px-4 py-3 flex items-center gap-4">
        <a href="/" className="text-gray-400 hover:text-white transition-colors text-sm">
          ← Back
        </a>
        <h1 className="text-lg font-semibold">Analytics</h1>
      </div>
      <div className="flex-1 p-4 max-w-3xl mx-auto w-full" style={{ height: 'calc(100vh - 57px)' }}>
        <AnalyticsChat />
      </div>
    </div>
  );
}
