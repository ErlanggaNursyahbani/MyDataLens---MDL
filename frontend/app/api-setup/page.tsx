'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Provider = 'openai' | 'anthropic' | 'gemini' | 'groq'

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'groq', label: 'Groq (Free - Testing)' },
]

export default function ApiSetupPage() {
  const router = useRouter()
  const [provider, setProvider] = useState<Provider>('openai')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState('')

  function handleSave() {
    if (!apiKey.trim()) {
      setError('API key cannot be empty.')
      return
    }
    sessionStorage.setItem('mdl_api_key', apiKey.trim())
    sessionStorage.setItem('mdl_provider', provider)
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            MyDataLens
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Connect your AI provider to get started
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          <h2 className="text-base font-medium text-zinc-100 mb-5">
            API Key Setup
          </h2>

          {/* Provider select */}
          <div className="mb-4">
            <label
              htmlFor="provider"
              className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide"
            >
              Provider
            </label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* API Key input */}
          <div className="mb-5">
            <label
              htmlFor="apiKey"
              className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide"
            >
              API Key
            </label>
            <div className="relative">
              <input
                id="apiKey"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setError('')
                }}
                placeholder="Paste your API key here"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 pr-10 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute inset-y-0 right-3 flex items-center text-zinc-400 hover:text-zinc-200 transition"
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="size-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z"
                      clipRule="evenodd"
                    />
                    <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="size-4"
                  >
                    <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                    <path
                      fillRule="evenodd"
                      d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            </div>
            {error && (
              <p className="mt-1.5 text-xs text-red-400">{error}</p>
            )}
          </div>

          {/* Security note */}
          <p className="mb-5 text-xs text-zinc-500 leading-relaxed">
            Your key is stored only in browser session storage and never sent to
            our servers.
          </p>

          {/* Save button */}
          <button
            type="button"
            onClick={handleSave}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 active:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900 transition"
          >
            Save & Continue
          </button>
        </div>
      </div>
    </div>
  )
}
