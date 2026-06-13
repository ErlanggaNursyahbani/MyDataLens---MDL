'use client'

import { useRef, useState } from 'react'

type ColumnInfo = { name: string; dtype: string }

type UploadResult = {
  columns: ColumnInfo[]
  sample: Record<string, string | number | boolean | null>[]
  all_rows: Record<string, string | number | boolean | null>[]
  row_count: number
}

type MergePanelProps = {
  initialUploadResult: UploadResult | null
}

type HowOption = 'inner' | 'left' | 'right' | 'outer'

const HOW_OPTIONS: { value: HowOption; label: string }[] = [
  { value: 'inner', label: 'Inner — keep matching rows only' },
  { value: 'left',  label: 'Left — keep all rows from Dataset 1' },
  { value: 'right', label: 'Right — keep all rows from Dataset 2' },
  { value: 'outer', label: 'Outer — keep all rows from both' },
]

export default function MergePanel({ initialUploadResult }: MergePanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  const [secondResult, setSecondResult]     = useState<UploadResult | null>(null)
  const [secondFileName, setSecondFileName] = useState('')
  const [uploadState, setUploadState]       = useState<'idle' | 'uploading' | 'error'>('idle')
  const [uploadError, setUploadError]       = useState('')

  const [leftKey,        setLeftKey]        = useState('')
  const [rightKey,       setRightKey]       = useState('')
  const [how,            setHow]            = useState<HowOption>('inner')
  const [outputFilename, setOutputFilename] = useState('')

  const [merging,    setMerging]    = useState(false)
  const [mergeError, setMergeError] = useState('')

  async function handleSecondFile(file: File) {
    setUploadState('uploading')
    setUploadError('')
    setSecondResult(null)
    setRightKey('')

    const body = new FormData()
    body.append('file', file)

    try {
      const res = await fetch('http://localhost:8000/upload', { method: 'POST', body })
      if (!res.ok) {
        const err = await res.json() as { detail?: string }
        throw new Error(err.detail ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as UploadResult
      setSecondResult(data)
      setSecondFileName(file.name)
      setUploadState('idle')
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed')
      setUploadState('error')
    }
  }

  function resetSecond() {
    setSecondResult(null)
    setSecondFileName('')
    setRightKey('')
    setUploadState('idle')
    setUploadError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleMerge() {
    if (!initialUploadResult || !secondResult || !leftKey || !rightKey) return
    setMerging(true)
    setMergeError('')

    try {
      const res = await fetch('http://localhost:8000/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          left_rows: initialUploadResult.all_rows,
          left_key: leftKey,
          right_rows: secondResult.all_rows,
          right_key: rightKey,
          how,
          output_filename: outputFilename.trim() || null,
        }),
      })

      if (!res.ok) {
        const err = await res.json() as { detail?: string }
        throw new Error(err.detail ?? `HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      const cd    = res.headers.get('Content-Disposition') ?? ''
      const match = /filename="([^"]+)"/.exec(cd)
      a.download  = match?.[1] ?? 'merged.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : 'Merge failed')
    } finally {
      setMerging(false)
    }
  }

  const leftCols  = initialUploadResult?.columns ?? []
  const rightCols = secondResult?.columns ?? []
  const canMerge  = !!initialUploadResult && !!secondResult && !!leftKey && !!rightKey && !merging

  return (
    <div className="max-w-2xl space-y-6">

      {/* Dataset 1 summary */}
      <div>
        <p className="text-xs font-medium text-zinc-400 mb-2">Dataset 1 (already uploaded)</p>
        {initialUploadResult ? (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-3">
            <p className="text-sm text-zinc-200">
              {initialUploadResult.row_count.toLocaleString()} rows &middot; {initialUploadResult.columns.length} columns
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 px-4 py-3">
            <p className="text-sm text-amber-300">Upload a file first on the Overview tab.</p>
          </div>
        )}
      </div>

      {/* Dataset 2 upload */}
      <div>
        <p className="text-xs font-medium text-zinc-400 mb-2">Dataset 2 (to merge with)</p>
        {!secondResult ? (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadState === 'uploading'}
              className="inline-flex items-center gap-2 rounded-lg border border-dashed border-zinc-600 hover:border-indigo-500 bg-zinc-900 px-4 py-3 text-sm text-zinc-400 hover:text-zinc-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadState === 'uploading' ? (
                <>
                  <span className="w-3.5 h-3.5 border border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                  Upload CSV / Excel
                </>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleSecondFile(f) }}
            />
            {uploadState === 'error' && (
              <p className="mt-2 text-xs text-red-400">{uploadError}</p>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-zinc-200 truncate">{secondFileName}</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {secondResult.row_count.toLocaleString()} rows &middot; {secondResult.columns.length} columns
              </p>
            </div>
            <button
              onClick={resetSecond}
              className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300 transition"
            >
              Change
            </button>
          </div>
        )}
      </div>

      {/* Key column selectors */}
      {initialUploadResult && secondResult && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1.5">
              Join key — Dataset 1
            </label>
            <select
              value={leftKey}
              onChange={e => setLeftKey(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Select column…</option>
              {leftCols.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1.5">
              Join key — Dataset 2
            </label>
            <select
              value={rightKey}
              onChange={e => setRightKey(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Select column…</option>
              {rightCols.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Join type + output filename */}
      {initialUploadResult && secondResult && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1.5">Join type</label>
            <select
              value={how}
              onChange={e => setHow(e.target.value as HowOption)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {HOW_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1.5">
              Output filename <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              type="text"
              value={outputFilename}
              onChange={e => setOutputFilename(e.target.value)}
              placeholder="merged"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      )}

      {/* Merge button + error */}
      {initialUploadResult && secondResult && (
        <div>
          {mergeError && (
            <p className="mb-3 text-xs text-red-400">{mergeError}</p>
          )}
          <button
            onClick={() => void handleMerge()}
            disabled={!canMerge}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 px-5 py-2.5 text-sm font-medium text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {merging ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Merging…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Merge &amp; Download CSV
              </>
            )}
          </button>
        </div>
      )}

    </div>
  )
}
