'use client'

import { useState } from 'react'

type ColumnInfo = { name: string; dtype: string }

type UploadResult = {
  columns: ColumnInfo[]
  sample: Record<string, string | number | boolean | null>[]
  all_rows: Record<string, string | number | boolean | null>[]
  row_count: number
}

type TransformPanelProps = {
  initialUploadResult: UploadResult | null
}

type PreviewData = {
  preview_rows: Record<string, string | number | boolean | null>[]
  total_rows: number
  output_columns: string[]
}

export default function TransformPanel({ initialUploadResult }: TransformPanelProps) {
  const cols = initialUploadResult?.columns ?? []

  // Column selection: checked = included, default all checked
  const [selected, setSelected]       = useState<Set<string>>(() => new Set(cols.map(c => c.name)))
  const [renameMap, setRenameMap]     = useState<Record<string, string>>({})
  const [rowsPerChunk, setRowsPerChunk] = useState(1000)
  const [outputFilename, setOutputFilename] = useState('')

  const [previewing,   setPreviewing]   = useState(false)
  const [previewData,  setPreviewData]  = useState<PreviewData | null>(null)
  const [previewError, setPreviewError] = useState('')

  const [splitting,   setSplitting]   = useState(false)
  const [splitError,  setSplitError]  = useState('')

  function toggleCol(name: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
    setPreviewData(null)
  }

  function setRename(original: string, value: string) {
    setRenameMap(prev => ({ ...prev, [original]: value }))
    setPreviewData(null)
  }

  function selectAll() {
    setSelected(new Set(cols.map(c => c.name)))
    setPreviewData(null)
  }

  function selectNone() {
    setSelected(new Set())
    setPreviewData(null)
  }

  function buildPayload() {
    const selectedCols = cols.map(c => c.name).filter(n => selected.has(n))
    const cleanRename: Record<string, string> = {}
    for (const [k, v] of Object.entries(renameMap)) {
      if (selected.has(k) && v.trim()) cleanRename[k] = v.trim()
    }
    return { selectedCols, cleanRename }
  }

  async function handlePreview() {
    if (!initialUploadResult || selected.size === 0) return
    setPreviewing(true)
    setPreviewError('')
    setPreviewData(null)

    const { selectedCols, cleanRename } = buildPayload()
    try {
      const res = await fetch('http://localhost:8000/transform/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          all_rows: initialUploadResult.all_rows,
          selected_columns: selectedCols,
          rename_map: cleanRename,
        }),
      })
      if (!res.ok) {
        const err = await res.json() as { detail?: string }
        throw new Error(err.detail ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as PreviewData
      setPreviewData(data)
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSplit() {
    if (!initialUploadResult || selected.size === 0) return
    setSplitting(true)
    setSplitError('')

    const { selectedCols, cleanRename } = buildPayload()
    try {
      const res = await fetch('http://localhost:8000/transform/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          all_rows: initialUploadResult.all_rows,
          selected_columns: selectedCols,
          rename_map: cleanRename,
          rows_per_chunk: rowsPerChunk,
          output_filename: outputFilename.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json() as { detail?: string }
        throw new Error(err.detail ?? `HTTP ${res.status}`)
      }
      const blob  = await res.blob()
      const url   = URL.createObjectURL(blob)
      const a     = document.createElement('a')
      a.href      = url
      const cd    = res.headers.get('Content-Disposition') ?? ''
      const match = /filename="([^"]+)"/.exec(cd)
      a.download  = match?.[1] ?? 'chunks.zip'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setSplitError(e instanceof Error ? e.message : 'Split failed')
    } finally {
      setSplitting(false)
    }
  }

  if (!initialUploadResult) {
    return (
      <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 px-4 py-3 max-w-2xl">
        <p className="text-sm text-amber-300">Upload a file first on the Overview tab.</p>
      </div>
    )
  }

  const totalChunks = rowsPerChunk > 0
    ? Math.ceil(initialUploadResult.row_count / rowsPerChunk)
    : 0

  return (
    <div className="space-y-6">

      {/* Dataset summary */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-3">
        <p className="text-sm text-zinc-200">
          {initialUploadResult.row_count.toLocaleString()} rows &middot; {cols.length} columns
        </p>
      </div>

      {/* Column config */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-zinc-400">Select &amp; rename columns</p>
          <div className="flex gap-3">
            <button onClick={selectAll}  className="text-xs text-zinc-500 hover:text-zinc-300 transition">All</button>
            <button onClick={selectNone} className="text-xs text-zinc-500 hover:text-zinc-300 transition">None</button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_1fr] text-xs font-medium text-zinc-500 px-4 py-2 border-b border-zinc-700">
            <span className="w-5" />
            <span>Original column</span>
            <span>Rename to (optional)</span>
          </div>
          <div className="divide-y divide-zinc-800 max-h-72 overflow-y-auto">
            {cols.map(col => (
              <div
                key={col.name}
                className={`grid grid-cols-[auto_1fr_1fr] items-center gap-3 px-4 py-2.5 transition ${selected.has(col.name) ? '' : 'opacity-40'}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(col.name)}
                  onChange={() => toggleCol(col.name)}
                  className="w-3.5 h-3.5 accent-indigo-500 cursor-pointer"
                />
                <span className="text-sm text-zinc-300 truncate">{col.name}</span>
                <input
                  type="text"
                  value={renameMap[col.name] ?? ''}
                  onChange={e => setRename(col.name, e.target.value)}
                  disabled={!selected.has(col.name)}
                  placeholder={col.name}
                  className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-30"
                />
              </div>
            ))}
          </div>
        </div>
        <p className="mt-1.5 text-xs text-zinc-600">{selected.size} of {cols.length} columns selected</p>
      </div>

      {/* Chunk size + output filename */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-zinc-400 block mb-1.5">
            Rows per chunk
            {totalChunks > 0 && (
              <span className="ml-2 text-zinc-600">→ {totalChunks} file{totalChunks !== 1 ? 's' : ''}</span>
            )}
          </label>
          <input
            type="number"
            min={1}
            value={rowsPerChunk}
            onChange={e => setRowsPerChunk(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-400 block mb-1.5">
            Output filename prefix <span className="text-zinc-600">(optional)</span>
          </label>
          <input
            type="text"
            value={outputFilename}
            onChange={e => setOutputFilename(e.target.value)}
            placeholder="chunk"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => void handlePreview()}
          disabled={selected.size === 0 || previewing}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 hover:border-indigo-500 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:text-zinc-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {previewing ? (
            <><span className="w-3.5 h-3.5 border border-zinc-500 border-t-transparent rounded-full animate-spin" />Previewing…</>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              Preview
            </>
          )}
        </button>

        <button
          onClick={() => void handleSplit()}
          disabled={selected.size === 0 || splitting || rowsPerChunk < 1}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 px-5 py-2 text-sm font-medium text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {splitting ? (
            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Splitting…</>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Split &amp; Download ZIP
            </>
          )}
        </button>

        {splitError && <p className="text-xs text-red-400">{splitError}</p>}
        {previewError && <p className="text-xs text-red-400">{previewError}</p>}
      </div>

      {/* Preview result */}
      {previewData && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-3">
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span>{previewData.total_rows.toLocaleString()} total rows</span>
            <span>&middot;</span>
            <span>{previewData.output_columns.length} output columns</span>
          </div>
          <div className="overflow-x-auto">
            <p className="text-xs text-zinc-600 mb-2">First {previewData.preview_rows.length} rows after transformation</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  {previewData.output_columns.map(col => (
                    <th key={col} className="text-left px-2 py-1.5 text-zinc-400 font-medium border-b border-zinc-700 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.preview_rows.map((row, i) => (
                  <tr key={i} className="border-b border-zinc-800">
                    {previewData.output_columns.map(col => (
                      <td key={col} className="px-2 py-1.5 text-zinc-300 whitespace-nowrap max-w-[160px] truncate">
                        {row[col] === null || row[col] === undefined ? (
                          <span className="text-zinc-600 italic">null</span>
                        ) : String(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
