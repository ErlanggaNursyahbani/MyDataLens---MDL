'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────────────

type ColumnInfo = { name: string; dtype: string }

type UploadResult = {
  columns: ColumnInfo[]
  sample: Record<string, string | number | boolean | null>[]
  all_rows?: Record<string, string | number | boolean | null>[]
  row_count: number
}

type BatchStatus = 'submitted' | 'queued' | 'processing' | 'completed' | 'failed'

type BatchInfo = {
  batchId: string
  provider: string
  status: BatchStatus
  completed: number
  total: number
  failedCount: number
}

type TaskItem = {
  taskDescription: string
  outputColumnName: string
}

type PreviewRow = {
  identity: string
  input: string
  ai_outputs: Record<string, string>
}

type Phase = 'setup' | 'tracking'

type BatchPanelProps = {
  initialUploadResult: UploadResult | null
  initialFileName: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ACCEPTED = '.csv,.xlsx,.xls'
const POLL_INTERVAL_MS = 30_000
const SUPPORTED_BATCH_PROVIDERS = ['openai', 'anthropic']

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  groq: 'Groq',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function statusBadge(status: BatchStatus) {
  const cfg: Record<BatchStatus, { label: string; cls: string }> = {
    submitted:  { label: 'Submitted',  cls: 'bg-amber-950/60 text-amber-300 border-amber-800' },
    queued:     { label: 'Queued',     cls: 'bg-amber-950/60 text-amber-300 border-amber-800' },
    processing: { label: 'Processing', cls: 'bg-indigo-950/60 text-indigo-300 border-indigo-800' },
    completed:  { label: 'Completed',  cls: 'bg-emerald-950/60 text-emerald-300 border-emerald-800' },
    failed:     { label: 'Failed',     cls: 'bg-red-950/60 text-red-300 border-red-800' },
  }
  const { label, cls } = cfg[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${cls}`}>
      {(status === 'submitted' || status === 'queued' || status === 'processing') && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {label}
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BatchPanel({ initialUploadResult, initialFileName }: BatchPanelProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [provider, setProvider] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [isBatchSupported, setIsBatchSupported] = useState(true)

  // File / schema — seeded from prop when available
  const [file, setFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(initialUploadResult)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState(initialFileName)

  // Configure state
  const [identityColumn, setIdentityColumn] = useState('')
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([{ taskDescription: '', outputColumnName: 'ai_output' }])

  // Preview state
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Tracking state
  const [phase, setPhase] = useState<Phase>('setup')
  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [showCompletion, setShowCompletion] = useState(false)
  const [downloadMode, setDownloadMode] = useState<'raw' | 'merged' | null>(null)

  const prevStatusRef = useRef<BatchStatus | null>(null)
  const batchIdRef = useRef<string | null>(null)
  const providerRef = useRef(provider)
  const apiKeyRef = useRef(apiKey)

  // Keep refs in sync
  useEffect(() => { providerRef.current = provider }, [provider])
  useEffect(() => { apiKeyRef.current = apiKey }, [apiKey])
  useEffect(() => { batchIdRef.current = batchInfo?.batchId ?? null }, [batchInfo?.batchId])

  // Init: read credentials + restore in-progress batch from localStorage
  useEffect(() => {
    const key = sessionStorage.getItem('mdl_api_key') ?? ''
    const prov = sessionStorage.getItem('mdl_provider') ?? 'openai'
    setApiKey(key)
    setProvider(prov)
    setIsBatchSupported(SUPPORTED_BATCH_PROVIDERS.includes(prov))

    const savedId = localStorage.getItem('mdl_batch_id')
    if (!savedId) return
    const savedProvider = localStorage.getItem('mdl_batch_provider') ?? prov

    setBatchInfo({
      batchId: savedId,
      provider: savedProvider,
      status: 'processing',
      completed: 0,
      total: 0,
      failedCount: 0,
    })
    prevStatusRef.current = 'processing'
    setPhase('tracking')

    const params = new URLSearchParams({ provider: savedProvider, api_key: key })
    fetch(`http://localhost:8000/batch/status/${savedId}?${params}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: { status: BatchStatus; total: number; completed: number; failed_count: number }) => {
        setBatchInfo(prev =>
          prev
            ? { ...prev, status: data.status, completed: data.completed, total: data.total, failedCount: data.failed_count }
            : prev
        )
      })
      .catch(() => {})
  }, [])

  // Completion notification
  useEffect(() => {
    const prev = prevStatusRef.current
    const cur = batchInfo?.status ?? null
    if (
      cur !== null &&
      prev !== null &&
      prev !== 'completed' &&
      prev !== 'failed' &&
      (cur === 'completed' || cur === 'failed')
    ) {
      setShowCompletion(true)
    }
    prevStatusRef.current = cur
  }, [batchInfo?.status])

  // Auto-polling
  useEffect(() => {
    const status = batchInfo?.status
    if (!status || status === 'completed' || status === 'failed') return

    const id = setInterval(async () => {
      const bid = batchIdRef.current
      if (!bid) return
      try {
        await doCheckStatus(bid, providerRef.current, apiKeyRef.current)
        setStatusError('')
      } catch (e) {
        setStatusError(e instanceof Error ? e.message : 'Auto-refresh failed')
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(id)
  }, [batchInfo?.status])

  // ── Handlers ──────────────────────────────────────────────────────────────────

  async function doCheckStatus(bid: string, prov: string, key: string) {
    const params = new URLSearchParams({ provider: prov, api_key: key })
    const res = await fetch(`http://localhost:8000/batch/status/${bid}?${params}`)
    if (!res.ok) {
      const err = await res.json() as { detail?: string }
      throw new Error(err.detail ?? `HTTP ${res.status}`)
    }
    const data = await res.json() as {
      batch_id: string
      status: BatchStatus
      total: number
      completed: number
      failed_count: number
    }
    setBatchInfo(prev => prev ? {
      ...prev,
      status: data.status,
      completed: data.completed,
      total: data.total,
      failedCount: data.failed_count,
    } : prev)
  }

  const uploadFile = useCallback(async (f: File) => {
    setIsUploading(true)
    setUploadError('')
    setUploadResult(null)
    setIdentityColumn('')
    setSelectedColumns([])
    setTasks([{ taskDescription: '', outputColumnName: 'ai_output' }])
    setShowConfirm(false)
    setPreviewRows(null)
    setPreviewError('')
    setSubmitError('')
    setFileName(f.name)

    const body = new FormData()
    body.append('file', f)

    try {
      const res = await fetch('http://localhost:8000/upload', { method: 'POST', body })
      if (!res.ok) {
        const err = await res.json() as { detail?: string }
        throw new Error(err.detail ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as UploadResult
      setFile(f)
      setUploadResult(data)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }, [])

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) void uploadFile(f)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) void uploadFile(f)
  }

  async function handlePreview() {
    const validTasks = tasks.filter(t => t.taskDescription.trim())
    if (selectedColumns.length === 0 || validTasks.length === 0 || !uploadResult) return

    setIsPreviewing(true)
    setPreviewError('')
    setPreviewRows(null)

    const source = uploadResult.all_rows ?? uploadResult.sample
    const sampleRows = source.slice(0, 3)

    const inputValues = sampleRows.map(row =>
      selectedColumns
        .map(col => {
          const v = row[col]
          return v !== null && v !== undefined ? `${col}: ${String(v)}` : ''
        })
        .filter(Boolean)
        .join(' | ')
    )
    const identityValues = sampleRows.map(row => {
      if (!identityColumn) return ''
      const v = row[identityColumn]
      return v !== null && v !== undefined ? String(v) : ''
    })

    try {
      const res = await fetch('http://localhost:8000/batch/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          column: selectedColumns.join(', '),
          tasks: validTasks.map(t => ({
            task_description: t.taskDescription.trim(),
            output_column_name: t.outputColumnName || 'ai_output',
          })),
          rows: inputValues,
          identity_values: identityValues,
          provider,
          api_key: apiKey,
        }),
      })
      if (!res.ok) {
        const err = await res.json() as { detail?: string }
        throw new Error(err.detail ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { preview: PreviewRow[] }
      setPreviewRows(data.preview)
      setShowConfirm(true)
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Preview failed')
    } finally {
      setIsPreviewing(false)
    }
  }

  async function handleSubmit() {
    const validTasks = tasks.filter(t => t.taskDescription.trim())
    if (selectedColumns.length === 0 || validTasks.length === 0) return
    if (!uploadResult?.all_rows?.length && !file) return

    setIsSubmitting(true)
    setSubmitError('')

    try {
      let values: string[]
      let identityValues: string[]

      if (uploadResult?.all_rows?.length) {
        values = uploadResult.all_rows
          .map(row =>
            selectedColumns
              .map(col => {
                const v = row[col]
                return v !== null && v !== undefined ? `${col}: ${String(v)}` : ''
              })
              .filter(Boolean)
              .join(' | ')
          )
          .filter(v => v.length > 0)
        identityValues = uploadResult.all_rows.map(row => {
          if (!identityColumn) return ''
          const v = row[identityColumn]
          return v !== null && v !== undefined ? String(v) : ''
        })
      } else if (file) {
        // Extract each selected column from the file and combine row-by-row
        const extractedByColumn: string[][] = []
        for (const col of selectedColumns) {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('column', col)
          const extractRes = await fetch('http://localhost:8000/batch/extract-column', {
            method: 'POST',
            body: formData,
          })
          if (!extractRes.ok) {
            const err = await extractRes.json() as { detail?: string }
            throw new Error(err.detail ?? `HTTP ${extractRes.status}`)
          }
          const { values: extracted } = await extractRes.json() as { values: string[]; count: number }
          extractedByColumn.push(extracted)
        }
        const numRows = extractedByColumn[0]?.length ?? 0
        values = Array.from({ length: numRows }, (_, i) =>
          selectedColumns
            .map((col, ci) => {
              const v = extractedByColumn[ci]?.[i] ?? ''
              return v ? `${col}: ${v}` : ''
            })
            .filter(Boolean)
            .join(' | ')
        ).filter(v => v.length > 0)
        identityValues = []
      } else {
        throw new Error('No data source available for batch processing')
      }

      const submitRes = await fetch('http://localhost:8000/batch/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          column: selectedColumns.join(', '),
          tasks: validTasks.map(t => ({
            task_description: t.taskDescription.trim(),
            output_column_name: t.outputColumnName || 'ai_output',
          })),
          rows: values,
          provider,
          api_key: apiKey,
          identity_column: identityColumn || null,
          identity_values: identityValues,
          all_rows: uploadResult?.all_rows ?? null,
        }),
      })
      if (!submitRes.ok) {
        const err = await submitRes.json() as { detail?: string }
        throw new Error(err.detail ?? `HTTP ${submitRes.status}`)
      }
      const { batch_id } = await submitRes.json() as {
        batch_id: string
        provider: string
        status: string
      }

      const info: BatchInfo = {
        batchId: batch_id,
        provider,
        status: 'submitted',
        completed: 0,
        total: values.length,
        failedCount: 0,
      }
      setBatchInfo(info)
      prevStatusRef.current = 'submitted'
      setPhase('tracking')
      localStorage.setItem('mdl_batch_id', batch_id)
      localStorage.setItem('mdl_batch_provider', provider)

      try {
        await doCheckStatus(batch_id, provider, apiKey)
      } catch {
        // Non-fatal — polling will retry
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRefreshStatus() {
    if (!batchInfo || isRefreshing) return
    setIsRefreshing(true)
    try {
      await doCheckStatus(batchInfo.batchId, provider, apiKey)
      setStatusError('')
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setIsRefreshing(false)
    }
  }

  async function handleDownload(mode: 'raw' | 'merged') {
    if (!batchInfo || downloadMode !== null) return
    setDownloadMode(mode)
    try {
      const params = new URLSearchParams({ provider, api_key: apiKey, mode })
      const res = await fetch(
        `http://localhost:8000/batch/download/${batchInfo.batchId}?${params}`
      )
      if (!res.ok) {
        const err = await res.json() as { detail?: string }
        throw new Error(err.detail ?? `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `batch_${mode}_${batchInfo.batchId.slice(0, 8)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setDownloadMode(null)
    }
  }

  function resetAll() {
    setFile(null)
    setIdentityColumn('')
    setSelectedColumns([])
    setTasks([{ taskDescription: '', outputColumnName: 'ai_output' }])
    setUploadError('')
    setSubmitError('')
    setShowConfirm(false)
    setPreviewRows(null)
    setIsPreviewing(false)
    setPreviewError('')
    setPhase('setup')
    setBatchInfo(null)
    setStatusError('')
    setShowCompletion(false)
    setDownloadMode(null)
    prevStatusRef.current = null
    localStorage.removeItem('mdl_batch_id')
    localStorage.removeItem('mdl_batch_provider')
    if (fileInputRef.current) fileInputRef.current.value = ''
    setUploadResult(null)
    setFileName('')
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const progressPct =
    batchInfo && batchInfo.total > 0
      ? Math.round((batchInfo.completed / batchInfo.total) * 100)
      : 0

  return (
    <div className="space-y-6">

      {/* Completion notification */}
      {showCompletion && batchInfo && (
        <div
          className={[
            'rounded-lg px-4 py-3 flex items-center justify-between text-sm',
            batchInfo.status === 'completed'
              ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-200'
              : 'bg-red-950/60 border border-red-800 text-red-200',
          ].join(' ')}
        >
          <span>
            {batchInfo.status === 'completed'
              ? `Batch complete — ${batchInfo.completed.toLocaleString()} row${batchInfo.completed !== 1 ? 's' : ''} processed successfully.`
              : `Batch ended with errors — ${batchInfo.failedCount.toLocaleString()} row${batchInfo.failedCount !== 1 ? 's' : ''} failed.`}
          </span>
          <button
            onClick={() => setShowCompletion(false)}
            className="text-xs opacity-70 hover:opacity-100 transition ml-6 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Provider not supported */}
      {!isBatchSupported && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/30 p-5">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-medium text-amber-200 text-sm">
                Batch processing is not available for {PROVIDER_LABELS[provider] ?? provider}
              </p>
              <p className="mt-1 text-xs text-amber-300/80">
                Switch to <strong>OpenAI</strong> or <strong>Anthropic</strong> on the{' '}
                <button
                  onClick={() => router.push('/api-setup')}
                  className="underline hover:text-amber-200 transition"
                >
                  API setup page
                </button>{' '}
                to enable batch processing.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── SETUP PHASE ───────────────────────────────────────────────────── */}
      {phase === 'setup' && (
        <div className={`space-y-6 ${!isBatchSupported ? 'pointer-events-none opacity-40' : ''}`}>

          {/* File upload zone — only shown when no uploadResult */}
          {!uploadResult ? (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onClick={() => fileInputRef.current?.click()}
                className={[
                  'rounded-xl border-2 border-dashed p-12 flex flex-col items-center justify-center cursor-pointer transition select-none',
                  isDragging
                    ? 'border-indigo-500 bg-indigo-950/30'
                    : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900',
                  isUploading ? 'pointer-events-none opacity-60' : '',
                ].join(' ')}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED}
                  className="hidden"
                  onChange={handleInputChange}
                />
                {isUploading ? (
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
                      {isDragging ? 'Drop to upload' : 'Drag & drop your dataset here'}
                    </p>
                    <p className="text-xs text-zinc-500">or click to browse — CSV, XLSX, XLS</p>
                  </>
                )}
              </div>

              {uploadError && (
                <div className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 flex items-start gap-3">
                  <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm text-red-300 flex-1">{uploadError}</p>
                  <button onClick={() => setUploadError('')} className="text-xs text-red-400 hover:text-red-200 transition shrink-0">Dismiss</button>
                </div>
              )}
            </>
          ) : (
            /* ── Configure (uploadResult loaded) ── */
            <div className="space-y-6">

              {/* File info bar */}
              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
                <div className="flex items-center gap-3">
                  <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium text-zinc-100">{fileName}</span>
                  <span className="text-xs text-zinc-500">
                    {uploadResult.row_count.toLocaleString()} rows · {uploadResult.columns.length} columns
                  </span>
                </div>
                <button
                  onClick={resetAll}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition"
                >
                  Change file
                </button>
              </div>

              {/* Identity column selector */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Identity column
                  <span className="ml-1 text-zinc-500 font-normal">— row identifier shown in preview &amp; download</span>
                  <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-400 font-normal">optional</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {uploadResult.columns.map((col) => (
                    <button
                      key={col.name}
                      onClick={() => {
                        setIdentityColumn(prev => prev === col.name ? '' : col.name)
                        setShowConfirm(false)
                        setPreviewRows(null)
                      }}
                      className={[
                        'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition',
                        identityColumn === col.name
                          ? 'border-violet-500 bg-violet-950/60 text-violet-200'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600',
                      ].join(' ')}
                    >
                      {col.name}
                      <span className={`text-xs font-mono ${dtypeColor(col.dtype)}`}>{col.dtype}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Input column selector */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Input columns
                  <span className="ml-1 text-zinc-500 font-normal">— columns AI will process (select one or more)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {uploadResult.columns.map((col) => (
                    <button
                      key={col.name}
                      onClick={() => {
                        setSelectedColumns(prev =>
                          prev.includes(col.name)
                            ? prev.filter(c => c !== col.name)
                            : [...prev, col.name]
                        )
                        setShowConfirm(false)
                        setPreviewRows(null)
                      }}
                      className={[
                        'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition',
                        selectedColumns.includes(col.name)
                          ? 'border-indigo-500 bg-indigo-950/60 text-indigo-200'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600',
                      ].join(' ')}
                    >
                      {selectedColumns.includes(col.name) && (
                        <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                        </svg>
                      )}
                      {col.name}
                      <span className={`text-xs font-mono ${dtypeColor(col.dtype)}`}>{col.dtype}</span>
                    </button>
                  ))}
                </div>
                {selectedColumns.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-zinc-500">Selected:</span>
                    {selectedColumns.map(col => (
                      <span
                        key={col}
                        className="inline-flex items-center gap-1 rounded-full border border-indigo-600 bg-indigo-950/50 pl-2.5 pr-1.5 py-0.5 text-xs text-indigo-200"
                      >
                        {col}
                        <button
                          onClick={() => {
                            setSelectedColumns(prev => prev.filter(c => c !== col))
                            setShowConfirm(false)
                            setPreviewRows(null)
                          }}
                          className="ml-0.5 rounded-full hover:bg-indigo-800/50 p-0.5 transition"
                          aria-label={`Remove ${col}`}
                        >
                          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Task list */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-zinc-300">
                    Tasks
                    <span className="ml-1 text-zinc-500 font-normal">— one or more AI operations per row</span>
                  </label>
                  <button
                    onClick={() => {
                      setTasks(prev => [...prev, { taskDescription: '', outputColumnName: `ai_output_${prev.length + 1}` }])
                      setShowConfirm(false)
                      setPreviewRows(null)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-indigo-700 bg-indigo-950/40 px-2.5 py-1 text-xs text-indigo-300 hover:bg-indigo-950/70 transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Add task
                  </button>
                </div>

                <div className="space-y-3">
                  {tasks.map((taskItem, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                          Task {idx + 1}
                        </span>
                        {tasks.length > 1 && (
                          <button
                            onClick={() => {
                              setTasks(prev => prev.filter((_, i) => i !== idx))
                              setShowConfirm(false)
                              setPreviewRows(null)
                            }}
                            className="text-zinc-600 hover:text-red-400 transition"
                            aria-label="Remove task"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                            </svg>
                          </button>
                        )}
                      </div>

                      <textarea
                        value={taskItem.taskDescription}
                        onChange={(e) => {
                          setTasks(prev => prev.map((t, i) => i === idx ? { ...t, taskDescription: e.target.value } : t))
                          setShowConfirm(false)
                          setPreviewRows(null)
                        }}
                        rows={2}
                        placeholder='E.g. "Classify as: complaint / inquiry / compliment"'
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      />

                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Output column name</label>
                        <input
                          type="text"
                          value={taskItem.outputColumnName}
                          onChange={(e) => {
                            setTasks(prev => prev.map((t, i) => i === idx ? { ...t, outputColumnName: e.target.value } : t))
                          }}
                          placeholder="ai_output"
                          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview error */}
              {previewError && (
                <div className="rounded-lg border border-red-800 bg-red-950/30 px-3 py-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-red-300 truncate">{previewError}</p>
                  <button
                    onClick={() => setPreviewError('')}
                    className="text-xs text-red-400 hover:text-red-200 transition shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Preview & Confirm button / Preview result panel */}
              {!showConfirm ? (
                <button
                  onClick={() => void handlePreview()}
                  disabled={selectedColumns.length === 0 || tasks.every(t => !t.taskDescription.trim()) || isPreviewing}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 px-5 py-2.5 text-sm font-medium text-white transition"
                >
                  {isPreviewing ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generating preview…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                      Preview & Confirm
                    </>
                  )}
                </button>
              ) : (
                /* Preview result panel */
                <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-200">Preview — 3 sample rows</h3>
                    <span className="text-xs text-zinc-500">{uploadResult.row_count.toLocaleString()} rows total · {PROVIDER_LABELS[provider] ?? provider}</span>
                  </div>

                  {/* Preview table */}
                  {previewRows && previewRows.length > 0 && (() => {
                    const outputCols = Object.keys(previewRows[0].ai_outputs)
                    return (
                      <div className="overflow-x-auto rounded-lg border border-zinc-800">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-zinc-800 bg-zinc-950">
                              {identityColumn && (
                                <th className="px-3 py-2 text-left font-medium text-violet-400 whitespace-nowrap">
                                  {identityColumn}
                                </th>
                              )}
                              <th className="px-3 py-2 text-left font-medium text-indigo-400 whitespace-nowrap">
                                {selectedColumns.join(', ')}
                              </th>
                              {outputCols.map(col => (
                                <th key={col} className="px-3 py-2 text-left font-medium text-emerald-400 whitespace-nowrap">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.map((row, i) => (
                              <tr
                                key={i}
                                className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition"
                              >
                                {identityColumn && (
                                  <td className="px-3 py-2.5 text-violet-300 font-mono whitespace-nowrap max-w-[140px] truncate">
                                    {row.identity || '—'}
                                  </td>
                                )}
                                <td className="px-3 py-2.5 text-zinc-300 max-w-[220px]">
                                  <span className="line-clamp-2">{row.input}</span>
                                </td>
                                {outputCols.map(col => (
                                  <td key={col} className="px-3 py-2.5 text-emerald-300 max-w-[260px]">
                                    <span className="line-clamp-3">{row.ai_outputs[col]}</span>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })()}

                  <div className="rounded-lg border border-indigo-900 bg-indigo-950/30 px-3 py-2 text-xs text-indigo-300">
                    Batch jobs use the async queue API — up to 50% cost savings vs real-time calls.
                    Results will be available within minutes to hours depending on queue load.
                  </div>

                  {submitError && (
                    <div className="rounded-lg border border-red-800 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                      {submitError}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => void handleSubmit()}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 px-5 py-2.5 text-sm font-medium text-white transition"
                    >
                      {isSubmitting ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Submitting…
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                          </svg>
                          Looks good, submit full batch
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setShowConfirm(false)
                        setPreviewRows(null)
                        setSubmitError('')
                      }}
                      disabled={isSubmitting}
                      className="text-sm text-zinc-400 hover:text-zinc-200 transition"
                    >
                      Edit task
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TRACKING PHASE ────────────────────────────────────────────────── */}
      {phase === 'tracking' && batchInfo && (
        <div className="space-y-5">

          {/* Status card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 mb-1">Batch ID</p>
                <p className="font-mono text-sm text-zinc-300">{batchInfo.batchId}</p>
              </div>
              {statusBadge(batchInfo.status)}
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5 text-xs text-zinc-400">
                <span>Progress</span>
                <span>
                  {batchInfo.completed.toLocaleString()} / {batchInfo.total.toLocaleString()} rows
                  {batchInfo.failedCount > 0 && (
                    <span className="ml-2 text-red-400">· {batchInfo.failedCount.toLocaleString()} failed</span>
                  )}
                </span>
              </div>
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={[
                    'h-full rounded-full transition-all duration-500',
                    batchInfo.status === 'completed' ? 'bg-emerald-500' :
                    batchInfo.status === 'failed' ? 'bg-red-500' : 'bg-indigo-500',
                  ].join(' ')}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-zinc-500 text-right">{progressPct}%</p>
            </div>

            {/* Status details */}
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { label: 'Provider', value: PROVIDER_LABELS[batchInfo.provider] ?? batchInfo.provider },
                { label: 'Total rows', value: batchInfo.total.toLocaleString() },
                { label: 'Completed', value: batchInfo.completed.toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
                  <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
                  <p className="text-sm font-medium text-zinc-200">{value}</p>
                </div>
              ))}
            </div>

            {/* Polling note */}
            {(batchInfo.status === 'submitted' || batchInfo.status === 'queued' || batchInfo.status === 'processing') && (
              <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
                Auto-refreshing every 30 seconds
              </p>
            )}

            {/* Error banner */}
            {statusError && (
              <div className="rounded-lg border border-red-800 bg-red-950/30 px-3 py-2 flex items-center justify-between gap-3">
                <p className="text-xs text-red-300 truncate">{statusError}</p>
                <button
                  onClick={() => setStatusError('')}
                  className="text-xs text-red-400 hover:text-red-200 transition shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3">
              {batchInfo.status === 'completed' && (
                <>
                  <button
                    onClick={() => void handleDownload('raw')}
                    disabled={downloadMode !== null}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 disabled:opacity-40 px-4 py-2 text-sm font-medium text-white transition"
                  >
                    {downloadMode === 'raw' ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Downloading…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Download Raw
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => void handleDownload('merged')}
                    disabled={downloadMode !== null}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 hover:bg-emerald-950/40 active:bg-emerald-950/60 disabled:opacity-40 px-4 py-2 text-sm font-medium text-emerald-300 transition"
                  >
                    {downloadMode === 'merged' ? (
                      <>
                        <span className="w-4 h-4 border-2 border-emerald-300 border-t-transparent rounded-full animate-spin" />
                        Downloading…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Download Merged
                      </>
                    )}
                  </button>
                </>
              )}

              <button
                onClick={() => void handleRefreshStatus()}
                disabled={isRefreshing || batchInfo.status === 'completed' || batchInfo.status === 'failed'}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 hover:border-zinc-500 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 px-4 py-2 text-sm font-medium text-zinc-200 transition"
              >
                {isRefreshing ? (
                  <span className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                )}
                Refresh status
              </button>

              <button
                onClick={resetAll}
                className="text-sm text-zinc-500 hover:text-zinc-300 transition"
              >
                New batch
              </button>
            </div>
          </div>

          {/* Info box */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <p className="text-xs text-zinc-500">
              <strong className="text-zinc-400">Note:</strong> Batch results are stored in server memory for this session only.
              Results will be unavailable if the backend is restarted before download.
              Download your CSV as soon as the batch completes.
            </p>
          </div>

        </div>
      )}

    </div>
  )
}
