'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import BatchPanel from '../components/BatchPanel'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

// ── Types ──────────────────────────────────────────────────────────────────────

type ColumnInfo = {
  name: string
  dtype: string
}

type UploadResult = {
  columns: ColumnInfo[]
  sample: Record<string, string | number | boolean | null>[]
  all_rows: Record<string, string | number | boolean | null>[]
  row_count: number
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

type ChartConfig = {
  type: 'bar' | 'line' | 'pie'
  title: string
  data: Record<string, string | number>[]
  x_key?: string
  y_keys?: string[]
  name_key?: string
  value_key?: string
}

type DashboardResult = {
  charts: ChartConfig[]
  insights: string[]
}

type DashboardState = 'idle' | 'generating' | 'done' | 'error'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type ChatState = 'idle' | 'loading' | 'error'

type ActiveTab = 'overview' | 'dashboard' | 'batch' | 'merge'

// ── Constants ──────────────────────────────────────────────────────────────────

const ACCEPTED = '.csv,.xlsx,.xls'

const CHART_COLORS = ['#6366f1', '#22d3ee', '#a78bfa', '#34d399', '#f59e0b', '#f472b6']

const TOOLTIP_STYLE = {
  background: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '8px',
  color: '#f4f4f5',
  fontSize: 12,
}

const TABS: { id: ActiveTab; label: string }[] = [
  { id: 'overview',  label: 'Overview' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'batch',     label: 'Batch' },
  { id: 'merge',     label: 'Merge' },
]

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

function renderChart(chart: ChartConfig) {
  if (chart.type === 'bar' && chart.x_key && chart.y_keys?.length) {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chart.data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey={chart.x_key}
            tick={{ fill: '#a1a1aa', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#3f3f46' }}
          />
          <YAxis
            tick={{ fill: '#a1a1aa', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#27272a' }} />
          {chart.y_keys.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
          )}
          {chart.y_keys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (chart.type === 'line' && chart.x_key && chart.y_keys?.length) {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chart.data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey={chart.x_key}
            tick={{ fill: '#a1a1aa', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#3f3f46' }}
          />
          <YAxis
            tick={{ fill: '#a1a1aa', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          {chart.y_keys.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
          )}
          {chart.y_keys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  if (chart.type === 'pie' && chart.name_key && chart.value_key) {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={chart.data}
            dataKey={chart.value_key}
            nameKey={chart.name_key}
            cx="50%"
            cy="50%"
            outerRadius={95}
            label={({ name, percent }: { name?: string; percent?: number }) =>
              `${String(name ?? '').slice(0, 12)} ${((percent ?? 0) * 100).toFixed(0)}%`
            }
            labelLine={false}
          >
            {chart.data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  return (
    <p className="text-sm text-zinc-500 italic py-8 text-center">
      Unsupported chart type: {chart.type}
    </p>
  )
}

// ── KPI Helpers ────────────────────────────────────────────────────────────────

function computeKPIs(result: UploadResult) {
  const colNames = result.columns.map(c => c.name)
  const rows = result.all_rows

  const revenueCol = colNames.find(c => /revenue|price/i.test(c)) ?? null
  const productCol = colNames.find(c => /product|name/i.test(c)) ?? null
  const monthCol = colNames.find(c => /month/i.test(c)) ?? null

  const totalRevenue = revenueCol
    ? rows.reduce((sum, row) => sum + (Number(row[revenueCol]) || 0), 0)
    : null

  let topProduct: string | null = null
  if (productCol) {
    const sums: Record<string, number> = {}
    for (const row of rows) {
      const key = String(row[productCol] ?? '')
      sums[key] = (sums[key] ?? 0) + (revenueCol ? (Number(row[revenueCol]) || 0) : 1)
    }
    const top = Object.entries(sums).sort((a, b) => b[1] - a[1])[0]
    topProduct = top?.[0] ?? null
  }

  let topMonth: string | null = null
  if (monthCol) {
    const sums: Record<string, number> = {}
    for (const row of rows) {
      const key = String(row[monthCol] ?? '')
      sums[key] = (sums[key] ?? 0) + (revenueCol ? (Number(row[revenueCol]) || 0) : 1)
    }
    const top = Object.entries(sums).sort((a, b) => b[1] - a[1])[0]
    topMonth = top?.[0] ?? null
  }

  const totalTransactions = result.row_count
  const avgOrderValue =
    totalRevenue !== null && totalTransactions > 0
      ? totalRevenue / totalTransactions
      : null

  return { totalRevenue, topProduct, topMonth, totalTransactions, avgOrderValue }
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  const [state, setState] = useState<UploadState>('idle')
  const [result, setResult] = useState<UploadResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [isChatOpen, setIsChatOpen] = useState(false)

  const [dashboardState, setDashboardState] = useState<DashboardState>('idle')
  const [dashboardResult, setDashboardResult] = useState<DashboardResult | null>(null)
  const [dashboardError, setDashboardError] = useState('')

  const kpis = useMemo(() => (result ? computeKPIs(result) : null), [result])

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatState, setChatState] = useState<ChatState>('idle')
  const [chatError, setChatError] = useState('')

  useEffect(() => {
    if (!sessionStorage.getItem('mdl_api_key')) {
      router.replace('/api-setup')
      return
    }
    const saved = sessionStorage.getItem('mdl_upload_result')
    const savedName = sessionStorage.getItem('mdl_upload_filename')
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as UploadResult
        setResult(parsed)
        setFileName(savedName ?? '')
        setState('success')
      } catch {
        sessionStorage.removeItem('mdl_upload_result')
        sessionStorage.removeItem('mdl_upload_filename')
      }
    }
  }, [router])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  const uploadFile = useCallback(async (file: File) => {
    setState('uploading')
    setResult(null)
    setErrorMsg('')
    setFileName(file.name)
    setDashboardState('idle')
    setDashboardResult(null)
    setDashboardError('')
    setActiveTab('overview')
    setIsChatOpen(false)

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
      sessionStorage.setItem('mdl_upload_result', JSON.stringify(data))
      sessionStorage.setItem('mdl_upload_filename', file.name)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Upload failed')
      setState('error')
    }
  }, [])

  async function generateDashboard() {
    if (!result) return
    const apiKey = sessionStorage.getItem('mdl_api_key') ?? ''
    const provider = sessionStorage.getItem('mdl_provider') ?? 'openai'

    setDashboardState('generating')
    setDashboardError('')

    try {
      const res = await fetch('http://localhost:8000/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: result.columns,
          sample: result.sample,
          api_key: apiKey,
          provider,
        }),
      })
      if (!res.ok) {
        const err = await res.json() as { detail?: string }
        throw new Error(err.detail ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as DashboardResult
      setDashboardResult(data)
      setDashboardState('done')
    } catch (e) {
      setDashboardError(e instanceof Error ? e.message : 'Failed to generate dashboard')
      setDashboardState('error')
    }
  }

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

  async function sendChat(e: React.FormEvent) {
    e.preventDefault()
    if (!result || !chatInput.trim() || chatState === 'loading') return

    const apiKey = sessionStorage.getItem('mdl_api_key') ?? ''
    const provider = sessionStorage.getItem('mdl_provider') ?? 'openai'
    const userMessage = chatInput.trim()

    setChatInput('')
    setChatError('')
    setChatState('loading')

    const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: userMessage }]
    setChatHistory(newHistory)

    try {
      const res = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          columns: result.columns,
          sample: result.sample,
          history: chatHistory,
          provider,
          api_key: apiKey,
        }),
      })
      if (!res.ok) {
        const err = await res.json() as { detail?: string }
        throw new Error(err.detail ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { reply: string }
      setChatHistory([...newHistory, { role: 'assistant', content: data.reply }])
      setChatState('idle')
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Failed to get response')
      setChatState('error')
    }
  }

  function reset() {
    setState('idle')
    setResult(null)
    setErrorMsg('')
    setFileName('')
    setDashboardState('idle')
    setDashboardResult(null)
    setDashboardError('')
    setChatHistory([])
    setChatInput('')
    setChatState('idle')
    setChatError('')
    setActiveTab('overview')
    setIsChatOpen(false)
    sessionStorage.removeItem('mdl_upload_result')
    sessionStorage.removeItem('mdl_upload_filename')
    if (inputRef.current) inputRef.current.value = ''
  }

  const previewRows = result ? result.all_rows.slice(0, 50) : []

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
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

        {/* ── Upload zone ──────────────────────────────────────────────────── */}
        {state !== 'success' && (
          <>
            <div className="mb-8">
              <h2 className="text-xl font-semibold">Upload Dataset</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Upload a CSV or Excel file to begin analysis
              </p>
            </div>

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
          </>
        )}

        {/* ── Upload error ──────────────────────────────────────────────────── */}
        {state === 'error' && (
          <div className="mt-4 rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 flex items-start gap-3">
            <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
            </svg>
            <p className="flex-1 text-sm text-red-300">{errorMsg}</p>
            <button onClick={reset} className="text-xs text-red-400 hover:text-red-200 transition">Try again</button>
          </div>
        )}

        {/* ── Success view ──────────────────────────────────────────────────── */}
        {state === 'success' && result && (
          <div>

            {/* File info bar */}
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 mb-0">
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

            {/* Tab bar */}
            <div className="flex border-b border-zinc-800 mt-6">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={[
                    'px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
                    activeTab === id
                      ? 'border-indigo-500 text-zinc-100'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Overview tab ─────────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <div className="mt-6 space-y-6">

                {/* Column schema */}
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
                    <span className="text-zinc-500 font-normal">(first {previewRows.length} rows)</span>
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-zinc-800">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-900">
                          {result.columns.map((col) => (
                            <th key={col.name} className="px-4 py-2.5 text-left text-xs font-medium whitespace-nowrap">
                              <div className="text-zinc-200">{col.name}</div>
                              <div className={`font-mono font-normal ${dtypeColor(col.dtype)}`}>{col.dtype}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i} className={`border-b border-zinc-800/50 ${i % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/40'}`}>
                            {result.columns.map((col) => {
                              const val = row[col.name]
                              return (
                                <td
                                  key={col.name}
                                  className="px-4 py-2 text-zinc-300 whitespace-nowrap max-w-[200px] truncate"
                                  title={val === null || val === undefined ? '' : String(val)}
                                >
                                  {val === null || val === undefined
                                    ? <span className="text-zinc-600 italic text-xs">null</span>
                                    : String(val)}
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

            {/* ── Dashboard tab ─────────────────────────────────────────────── */}
            {activeTab === 'dashboard' && (
              <div className="mt-6 space-y-6">

                {/* AI Dashboard */}
                <div>
                  {dashboardState === 'idle' && (
                    <div className="flex flex-col items-center gap-3 py-8">
                      <p className="text-sm text-zinc-400">Let AI analyse your data and generate interactive charts</p>
                      <button
                        onClick={() => void generateDashboard()}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 px-5 py-2.5 text-sm font-medium text-white transition"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                        </svg>
                        Generate AI Dashboard
                      </button>
                    </div>
                  )}

                  {dashboardState === 'generating' && (
                    <div className="flex flex-col items-center gap-3 py-12">
                      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-zinc-400">AI is analysing your data…</p>
                    </div>
                  )}

                  {dashboardState === 'error' && (
                    <div className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 flex items-start gap-3">
                      <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
                      </svg>
                      <p className="flex-1 text-sm text-red-300">{dashboardError}</p>
                      <button
                        onClick={() => void generateDashboard()}
                        className="text-xs text-red-400 hover:text-red-200 transition"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {dashboardState === 'done' && dashboardResult && (
                    <div className="space-y-5">

                      {/* KPI Cards — shown only after AI generates */}
                      {kpis && (
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                          {[
                            {
                              label: 'Total Revenue',
                              value: kpis.totalRevenue !== null
                                ? kpis.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })
                                : 'N/A',
                            },
                            { label: 'Top Product', value: kpis.topProduct ?? 'N/A' },
                            { label: 'Top Month', value: kpis.topMonth ?? 'N/A' },
                            { label: 'Total Transactions', value: kpis.totalTransactions.toLocaleString() },
                            {
                              label: 'Avg Order Value',
                              value: kpis.avgOrderValue !== null
                                ? kpis.avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                : 'N/A',
                            },
                          ].map(({ label, value }) => (
                            <div key={label} className="rounded-lg bg-zinc-800 px-4 py-3">
                              <p className="text-lg font-bold text-white truncate">{value}</p>
                              <p className="text-xs text-zinc-400 mt-1">{label}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-zinc-200">AI Dashboard</h3>
                        <button
                          onClick={() => void generateDashboard()}
                          className="text-xs text-zinc-500 hover:text-zinc-300 transition"
                        >
                          Regenerate
                        </button>
                      </div>

                      {/* Charts grid */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {dashboardResult.charts.map((chart, i) => (
                          <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                            <h4 className="text-sm font-medium text-zinc-200 mb-4">{chart.title}</h4>
                            {renderChart(chart)}
                          </div>
                        ))}
                      </div>

                      {/* Insights */}
                      {dashboardResult.insights.length > 0 && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                          <h4 className="text-sm font-medium text-zinc-200 mb-3">Key Insights</h4>
                          <ul className="space-y-2.5">
                            {dashboardResult.insights.map((insight, i) => (
                              <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300">
                                <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
                                {insight}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Secondary chat entry point */}
                <div className="flex justify-center pt-2 pb-4">
                  <button
                    onClick={() => setIsChatOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 text-sm text-zinc-300 hover:text-zinc-100 transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-indigo-400">
                      <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 0 0 6 21.75a6.721 6.721 0 0 0 3.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 0 1-.814 1.686.75.75 0 0 0 .44 1.223ZM8.25 10.875a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25ZM10.875 12a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Zm4.875-1.125a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25Z" clipRule="evenodd" />
                    </svg>
                    Chat with your data
                  </button>
                </div>

              </div>
            )}

            {/* ── Batch tab ─────────────────────────────────────────────────── */}
            {activeTab === 'batch' && (
              <div className="mt-6">
                <BatchPanel initialUploadResult={result} initialFileName={fileName} />
              </div>
            )}

            {/* ── Merge tab ─────────────────────────────────────────────────── */}
            {activeTab === 'merge' && (
              <div className="mt-6 flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-zinc-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                </div>
                <p className="text-base font-medium text-zinc-300">Merge Your Data</p>
                <p className="text-sm text-zinc-500">Coming soon — join 2 datasets without AI cost</p>
              </div>
            )}

          </div>
        )}
      </main>

      {/* ── Floating chat button ──────────────────────────────────────────────── */}
      {state === 'success' && (
        <button
          onClick={() => setIsChatOpen(true)}
          aria-label="Open chat"
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 flex items-center justify-center shadow-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white">
            <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 0 0 6 21.75a6.721 6.721 0 0 0 3.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 0 1-.814 1.686.75.75 0 0 0 .44 1.223ZM8.25 10.875a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25ZM10.875 12a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Zm4.875-1.125a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25Z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {/* ── Chat overlay backdrop ─────────────────────────────────────────────── */}
      {state === 'success' && isChatOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setIsChatOpen(false)}
        />
      )}

      {/* ── Chat slide panel ──────────────────────────────────────────────────── */}
      {state === 'success' && (
        <div
          className={[
            'fixed inset-y-0 right-0 z-50 w-[400px] bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out',
            isChatOpen ? 'translate-x-0' : 'translate-x-full',
          ].join(' ')}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
            <h2 className="text-sm font-semibold text-zinc-100">Chat with your data</h2>
            <button
              onClick={() => setIsChatOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 transition"
              aria-label="Close chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>

          {/* Message history */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatHistory.length === 0 && (
              <p className="text-sm text-zinc-500 italic text-center mt-8">
                Ask anything about your dataset — trends, outliers, statistics…
              </p>
            )}
            {chatHistory.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={[
                    'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-zinc-800 text-zinc-100 rounded-bl-sm',
                  ].join(' ')}
                >
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>,
                        li: ({ children }) => <li>{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        code: ({ children }) => <code className="font-mono text-xs bg-zinc-700 px-1 py-0.5 rounded">{children}</code>,
                        pre: ({ children }) => <pre className="font-mono text-xs bg-zinc-700 p-2 rounded my-1 overflow-x-auto">{children}</pre>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            {chatState === 'loading' && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Error banner */}
          {chatState === 'error' && (
            <div className="px-4 py-2 border-t border-zinc-800 bg-red-950/30 flex items-center justify-between gap-3 shrink-0">
              <p className="text-xs text-red-300 truncate">{chatError}</p>
              <button
                onClick={() => setChatState('idle')}
                className="text-xs text-red-400 hover:text-red-200 transition shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Input row */}
          <form
            onSubmit={(e) => void sendChat(e)}
            className="border-t border-zinc-800 p-3 flex gap-2 shrink-0"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask a question about your data…"
              disabled={chatState === 'loading'}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || chatState === 'loading'}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 px-4 py-2 text-sm font-medium text-white transition"
            >
              Send
            </button>
          </form>
        </div>
      )}

    </div>
  )
}
