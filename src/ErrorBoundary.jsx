import { Component } from "react"

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error("App error:", error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6"
          role="alert"
        >
          <h1 className="font-display text-xl font-bold uppercase tracking-widest text-red-400 mb-2">
            Something went wrong
          </h1>
          <p className="text-gray-400 text-sm text-center max-w-md mb-6">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold uppercase tracking-wider rounded"
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
