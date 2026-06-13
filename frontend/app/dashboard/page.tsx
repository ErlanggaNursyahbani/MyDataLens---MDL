'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type ColumnInfo = {
  name: string
  dtype: string
}

type UploadResult = {
  columns: ColumnInfo[]
  sample: Record<string, string | number | boolean | null>[]
  row_count: number
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

const ACCEPTED = '.csv,.xlsx,.xls'

function dtypeColor(dtype: string): string {
  switch (dtype) {
    case 'integer':  return 'text-blue-400'
    case 'float':    return 'text-cyan-400'
    case 'string':   return 'text-emerald-400'
    case 'datetime': return 'text-purple-400'
    case 'boolean':  return 'text-amber-400'
    default:         return 'text-zinc-400'
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [state, setState] = useState<UploadState>('idle')
  const [result, setResult] = useState<UploadResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    if (!sessionStorage.getItem('mdl_api_key')) {
      router.replace('/api-setup')
    }
  }, [router])

  const uploadFile = useCallback(async (file: File) => {
    setState('uploading')
    setResult(null)
    setErrorMsg('')
    setFileName(file.name)

    const body = new FormData()
    body.append('file', file)

    try {
      const res = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body,
      })

      if (!res.ok) {
        const err = await res.json() as { detail?: string }
        throw new Error(err.detail ?? `HTTP ${res.status}`)
      }

      const data = await res.json() as UploadResult
      setResult(data)
      setState('success')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Upload failed')
      setState('error')
    }
  }, [])

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void uploadFile(file)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void uploadFile(file)
  }

  function reset() {
    setState('idle')
    setResult(null)
    setErrorMsg('')
    setFileName('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Nav */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">MyDataLens</h1>
        <button
          onClick={() => {
            sessionStorage.clear()
            router.push('/api-setup')
          }}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition"
        >
          Change API Key
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h2 className="text-xl font-semibold">Upload Dataset</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Upload a CSV or Excel file to begin analysis
          </p>
        </div>

        {/* Drop zone — hidden once upload succeeds */}
        {state !== 'success' && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => inputRef.current?.click()}
            className={[
              'rounded-xl border-2 border-dashed p-12 flex flex-col items-center justify-center cursor-pointer transition select-none',
              isDragging
                ? 'border-indigo-500 bg-indigo-950/30'
                : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900',
              state === 'uploading' ? 'pointer-events-none opacity-60' : '',
            ].join(' ')}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={handleInputChange}
            />

            {state === 'uploading' ? (
              <>
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm text-zinc-400">Uploading {fileName}…</p>
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-10 h-10 text-zinc-600 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm font-medium text-zinc-300 mb-1">
                  {isDragging ? 'Drop to upload' : 'Drag & drop your file here'}
                </p>
                <p className="text-xs text-zinc-500">or click to browse — CSV, XLSX, XLS</p>
              </>
            )}
          </div>
        )}

        {/* Error banner */}
        {state === 'error' && (
          <div className="mt-4 rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 flex items-start gap-3">
            <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
            </svg>
            <p className="flex-1 text-sm text-red-300">{errorMsg}</p>
            <button onClick={reset} className="text-xs text-red-400 hover:text-red-200 transition">
              Try again
            </button>
          </div>
        )}

        {/* Success view */}
        {state === 'success' && result && (
          <div className="space-y-6">
            {/* File info bar */}
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium text-zinc-100">{fileName}</span>
                <span className="text-xs text-zinc-500">
                  {result.row_count.toLocaleString()} rows · {result.columns.length} columns
                </span>
              </div>
              <button onClick={reset} className="text-xs text-zinc-500 hover:text-zinc-300 transition">
                Upload new file
              </button>
            </div>

            {/* Column schema chips */}
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-3">Column Schema</h3>
              <div className="flex flex-wrap gap-2">
                {result.columns.map((col) => (
                  <div
                    key={col.name}
                    className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5"
                  >
                    <span className="text-sm text-zinc-100">{col.name}</span>
                    <span className={`text-xs font-mono ${dtypeColor(col.dtype)}`}>{col.dtype}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview table */}
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-3">
                Data Preview{' '}
                <span className="text-zinc-500 font-normal">(first {result.sample.length} rows)</span>
              </h3>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900">
                      {result.columns.map((col) => (
                        <th
                          key={col.name}
                          className="px-4 py-2.5 text-left text-xs font-medium text-zinc-400 whitespace-nowrap"
                        >
                          <div className="text-zinc-200">{col.name}</div>
                          <div className={`font-mono font-normal ${dtypeColor(col.dtype)}`}>
                            {col.dtype}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.sample.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-b border-zinc-800/50 ${i % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/40'}`}
                      >
                        {result.columns.map((col) => {
                          const val = row[col.name]
                          return (
                            <td
                              key={col.name}
                              className="px-4 py-2 text-zinc-300 whitespace-nowrap max-w-[200px] truncate"
                              title={val === null || val === undefined ? '' : String(val)}
                            >
                              {val === null || val === undefined ? (
                                <span className="text-zinc-600 italic text-xs">null</span>
                              ) : (
                                String(val)
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
