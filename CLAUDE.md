# MyDataLens (MDL) — Claude Code Context

## Project Overview
Personal AI-powered data analysis tool. User upload CSV/Excel → AI generate dynamic dashboard + chatbot + batch processing.

## Tech Stack
- Frontend: Next.js (App Router)
- Backend: FastAPI (Python)
- Data Processing: Pandas 3.0.3
- Charts: Recharts
- LLM: Multi-provider (OpenAI, Anthropic, Gemini, Groq)
- Pydantic: v2.13.4

## Project Structure
mydatalens/
├── frontend/
│   └── app/
│       ├── dashboard/page.tsx      # Main page: 5 tabs (Overview, Dashboard, Batch, Merge, Transform)
│       ├── batch/page.tsx          # Redirects to /dashboard
│       ├── api-setup/page.tsx      # API key setup: provider select + API key + show/hide toggle
│       └── components/
│           ├── BatchPanel.tsx      # Batch processing panel (embedded in Dashboard → Batch tab)
│           ├── MergePanel.tsx      # Merge panel (embedded in Dashboard → Merge tab)
│           └── TransformPanel.tsx  # Transform panel (embedded in Dashboard → Transform tab)
├── backend/
│   └── app/
│       ├── main.py                 # FastAPI app, CORS, router registration
│       ├── services/               # Empty placeholder directory
│       ├── providers/              # LLM abstraction PACKAGE (not a single file)
│       │   ├── __init__.py         # Exports generate_dashboard() + chat_with_data() routers
│       │   ├── base.py             # Shared system prompts + parse_dashboard_json()
│       │   ├── openai_provider.py
│       │   ├── anthropic_provider.py
│       │   ├── gemini_provider.py
│       │   └── groq_provider.py
│       └── routers/
│           ├── upload.py           # POST /upload
│           ├── analyze.py          # POST /analyze, POST /analyze/top10
│           ├── chat.py             # POST /chat
│           ├── batch.py            # POST /batch/preview|submit|extract-column, GET /batch/status|download
│           ├── merge.py            # POST /merge/preview, POST /merge
│           └── transform.py        # POST /transform/preview, POST /transform/split
├── docs/                           # PRD and documentation (currently empty)
├── CLAUDE.md                       # This file
└── README.md

## Backend API Surface
| Method | Path                        | Auth | Description                              |
|--------|-----------------------------|------|------------------------------------------|
| POST   | /upload                     | –    | Parse CSV/Excel → schema + sample + rows |
| POST   | /analyze                    | key  | AI: generate 2-4 charts + 3-5 insights  |
| POST   | /analyze/top10              | –    | Pandas: up to 3 Top-10 ranked tables     |
| POST   | /chat                       | key  | AI: chatbot on dataset (with history)    |
| POST   | /batch/preview              | key  | AI preview on first 3 rows               |
| POST   | /batch/submit               | key  | Submit batch job (OpenAI/Anthropic only) |
| POST   | /batch/extract-column       | –    | Extract single column values from file   |
| GET    | /batch/status/{id}          | key* | Poll batch status (* key in query param) |
| GET    | /batch/download/{id}        | key* | Download CSV raw or merged               |
| POST   | /merge/preview              | –    | Pandas preview + dup warnings (5 rows)   |
| POST   | /merge                      | –    | Pandas merge → CSV download              |
| POST   | /transform/preview          | –    | Column select+rename preview (5 rows)    |
| POST   | /transform/split            | –    | Split + ZIP download                     |

## sessionStorage Keys
| Key                   | Value                        | Set by              |
|-----------------------|------------------------------|---------------------|
| mdl_api_key           | API key string               | api-setup page      |
| mdl_provider          | openai/anthropic/gemini/groq | api-setup page      |
| mdl_upload_result     | JSON UploadResult            | dashboard upload    |
| mdl_upload_filename   | filename string              | dashboard upload    |

## localStorage Keys
| Key                   | Value                        | Set by              |
|-----------------------|------------------------------|---------------------|
| mdl_batch_id          | batch job ID string          | BatchPanel submit   |
| mdl_batch_provider    | provider string              | BatchPanel submit   |

## Conventions
- Python: snake_case, type hints required, docstring for all functions
- TypeScript: camelCase, strict mode on, NO `any`
- Commit format: `type: description` (chore, feat, fix, refactor, docs)
- Branch format: `feature/nama-fitur`, `fix/nama-bug`

## Architecture Rules
- SEMUA komunikasi ke LLM harus melalui abstraction layer di backend (providers/ package)
- API key TIDAK BOLEH disimpan di server — hanya session/local storage browser
- AI hanya terima schema + max 20 baris sample — BUKAN full file (enforced in base.py)
- Batch hanya aktif untuk provider yang support: OpenAI, Anthropic
- Upload result (schema + all_rows) disimpan di sessionStorage (mdl_upload_result, mdl_upload_filename)
- Batch state (batch ID + provider) disimpan di localStorage agar survive page refresh
- Batch results disimpan IN-MEMORY di backend (_batch_store dict) — hilang kalau server restart
- Panels (Batch, Merge, Transform) embedded di Dashboard tab — bukan halaman terpisah
- BatchPanel menerima `initialUploadResult` + `initialFileName` props
- Merge + Transform panels menerima `initialUploadResult` prop
- Merge panel uploads second file via /upload endpoint (reuses parse logic)
- BatchPanel juga bisa upload file sendiri (fallback jika all_rows tidak tersedia)
- Overview tab data preview menampilkan 50 baris pertama (bukan 20)

## Hardcoded Models (Sprint 3 limitation)
Batch operations menggunakan model hardcoded — belum ada model selection:
- OpenAI batch: `gpt-4o-mini` (preview + submit)
- Anthropic batch: `claude-haiku-4-5-20251001` (preview + submit)
- Dashboard + Chat: model default per-provider (belum terdokumentasi per file)

## LLM Provider Package (providers/)
- `base.py` berisi:
  - `DASHBOARD_SYSTEM_PROMPT` — instruksi generate 2-4 charts (bar/line/pie) + 3-5 insights, raw JSON only
  - `CHAT_SYSTEM_PROMPT` — dataset-only chatbot, format angka dengan thousand separators
  - `build_user_prompt()` — schema + sample[:20] sebagai JSON
  - `build_chat_system_prompt()` — prepend schema + sample ke chat system prompt
  - `parse_dashboard_json()` — strips markdown fences dari LLM response sebelum parse
- `__init__.py` exports `generate_dashboard()` dan `chat_with_data()` yang route ke provider yang tepat

## Master Feature List

### Sprint 1 (Done):
- [x] Tab Navigation (Overview, Dashboard, Batch, Merge)
- [x] Chatbot floating button + slide panel
- [x] KPI cards (auto-detect revenue/price, product/name, month columns via regex)
- [x] State persist: upload result saved/restored via sessionStorage
- [x] Chatbot markdown rendering (react-markdown)
- [x] BatchPanel inline in Dashboard tab (refactored from separate page)

### Sprint 2 (Done):
- [x] Batch multi-column input (multi-select chips UI)
- [x] Batch identity column + dual download (raw/merged)
- [x] Batch preview output (3 sample rows before submit)
- [x] B1 — Change file button fixed (resets upload state)
- [x] B2 — Multi-select input columns (chips UI)
- [x] E1 — Custom output column name (default: ai_output)
- [x] E2 — Multiple output columns (always-expanded cards, one batch job, N output columns in CSV)
- [x] E3 — Role/persona optional field (collapsible, prepended to system prompt)
- [x] E4 — Top 10 tables in Dashboard (Pandas only, up to 3 tables, ranked list + bar)
- [x] E5 — Chatbot markdown polish (headers, em, blockquote, tables, inline/block code)

### Sprint 3 (In Progress):
- [x] Tab Merge — join 2 datasets + download CSV (MergePanel.tsx + /merge)
- [x] Tab Merge — preview step: 5 rows + before/after row & column counts (/merge/preview)
- [x] Tab Merge — duplicate key warning in preview banner (amber, non-blocking, shows examples)
- [x] Tab Transform — column select + rename + split by N rows + ZIP download
         (TransformPanel.tsx + /transform/preview + /transform/split)
- [x] E4 bug fix — pandas 3.x robustness: pd.to_numeric coerce, dropna, DataFrame try/except
- [x] E4 bug fix — frontend: Top10State tracking, console.log trace, persistent "Top 10 Rankings" section
- [ ] Model selection per provider (Sprint 3 last item — NOT YET STARTED)

### Sprint 4 (Planned):
- [ ] Auto multi-batch from Transform tab (submit all chunks as one batch job)
- [ ] Multi-job status tracker UI
- [ ] Error handling for oversized batch requests

### Sprint 5+:
- [ ] Login / Auth system
- [ ] Admin dashboard (pre-deploy)

## Known Issues / Needs Verification
- **E4 top10 tables** — backend fix committed but NOT yet live-tested. Must restart backend
  then generate dashboard and check browser console for `[top10] response status:` log.
  If status is 200 but tables=0, the dataset has no string+numeric column pairs.
  If status ≠ 200, check `[top10] non-OK response:` log for the error body.
  If fetch fails, check `[top10] fetch error:` for network/CORS issue.
- **Top10 idle heading** — "Top 10 Rankings" h3 appears with no content beneath it when
  top10State is 'idle' (before first dashboard generate, if user switches to Dashboard tab).
  Minor UX issue — low priority.
- **Batch hardcoded models** — gpt-4o-mini (OpenAI) dan claude-haiku-4-5-20251001 (Anthropic)
  hardcoded di batch.py. User tidak bisa pilih model. Fix: Sprint 3 remaining (model selection).
- **Batch results in-memory only** — _batch_store dict di server. Download harus dilakukan
  sebelum backend restart. Sudah ada warning di UI. Tidak ada persistence ke disk.
- **API key di URL query params** — /batch/status dan /batch/download kirim api_key sebagai
  query param (bisa muncul di server logs). Long-term: pindah ke header. Low priority sekarang.

## Tomorrow — Priority Order
1. **Test E4 fix** (most urgent — been broken since initial implementation)
   - Start backend + frontend
   - Upload a dataset with clearly categorical columns (e.g. product, region) + numeric columns (e.g. sales, quantity)
   - Generate AI dashboard
   - Open browser DevTools → Console
   - Look for `[top10]` logs to trace what's happening
   - Expected: `[top10] tables received: 3 [...]`
   - If `tables received: 0`: dataset lacks string+numeric pairs or all categories have ≤1 unique group
   - If `response status: 4xx/5xx`: check error body, fix backend
   - Remove `console.log` lines once confirmed working

2. **Model selection per provider** (Sprint 3 completion)
   - Add a model dropdown to the api-setup page OR dashboard page next to provider selector
   - Config stored in sessionStorage as `mdl_model`
   - Backend: pass model name through providers/__init__.py + each provider file + batch.py
   - Suggested models per provider:
     - OpenAI: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo
     - Anthropic: claude-sonnet-4-6, claude-haiku-4-5, claude-opus-4-8
     - Gemini: gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash
     - Groq: llama3-70b-8192, llama3-8b-8192, mixtral-8x7b-32768

3. **Sprint 4 kickoff** — pick one:
   - Auto multi-batch from Transform: after split, user can submit all chunks as batch jobs
   - Or: error handling for oversized requests (payload > sessionStorage quota / chunking)

## Commands
```bash
# Frontend
cd frontend && npm run dev

# Backend
cd backend && venv/Scripts/uvicorn app.main:app --reload

# Install backend deps
cd backend && venv/Scripts/pip install -r requirements.txt
```

## Do NOT
- Jangan gunakan `any` di TypeScript
- Jangan expose API key di frontend ke backend MDL
- Jangan kirim full file content ke LLM — gunakan schema + sample
- Jangan pakai `sudo pip install` — selalu gunakan virtual environment
- Do NOT run dev server during Claude Code sessions
- WSL Linux environment only for git operations
