# MyDataLens (MDL) — Claude Code Context

## Project Overview
Personal AI-powered data analysis tool. User upload CSV/Excel → AI generate dynamic dashboard + chatbot + batch processing.

## Tech Stack
- Frontend: Next.js (App Router)
- Backend: FastAPI (Python)
- Data Processing: Pandas
- Charts: Recharts
- LLM: Multi-provider (OpenAI, Anthropic, Gemini, Groq)

## Project Structure
mydatalens/
├── frontend/
│   └── app/
│       ├── dashboard/page.tsx      # Main page: tabs (Overview, Dashboard, Batch, Merge)
│       ├── batch/page.tsx          # Redirects to /dashboard
│       ├── api-setup/page.tsx      # API key setup
│       └── components/
│           └── BatchPanel.tsx      # Batch processing panel (embedded in Dashboard Batch tab)
├── backend/         # FastAPI app
├── docs/            # PRD and documentation
├── CLAUDE.md        # This file
└── README.md

## Conventions
- Python: snake_case, type hints wajib, docstring untuk semua function
- TypeScript: camelCase, strict mode on, no `any`
- Commit format: `type: description` (chore, feat, fix, refactor, docs)
- Branch format: `feature/nama-fitur`, `fix/nama-bug`

## Architecture Rules
- SEMUA komunikasi ke LLM harus melalui abstraction layer di backend
- API key TIDAK BOLEH disimpan di server — hanya session storage browser
- AI hanya terima schema + max 20 baris sample — BUKAN full file
- Batch hanya aktif untuk provider yang support (OpenAI, Anthropic)
- Upload result (schema + all_rows) disimpan di sessionStorage (mdl_upload_result, mdl_upload_filename)
- Batch panel embedded di Dashboard tab, bukan halaman terpisah — /batch redirect ke /dashboard
- BatchPanel menerima initialUploadResult prop; extract kolom dari all_rows (client-side) jika tersedia

## Master Feature List

### Sprint 1 (Done):
- [x] Tab Navigation (Overview, Dashboard, Batch, Merge)
- [x] Chatbot floating button + slide panel
- [x] KPI cards consistency fix (full dataset)
- [x] State persist: upload result saved/restored via sessionStorage
- [x] Chatbot markdown rendering (react-markdown)
- [x] BatchPanel inline in Dashboard tab (refactored from separate page)

### Sprint 2 (In Progress):
- [x] Batch multi-column input (multi-select chips UI)
- [x] Batch identity column + dual download (raw/merged)
- [x] Batch preview output (3 sample rows before submit)
- [x] B1 — Change file button fixed (resets upload state)
- [x] B2 — Multi-select input columns (chips UI)
- [x] E1 — Custom output column name (default: ai_output)
- [x] E2 — Multiple output columns (always-expanded cards, one batch job, N output columns in CSV)
- [ ] E3 — Role/persona optional field (next)
- [ ] E4 — Top 10 tables in Dashboard
- [ ] E5 — Chatbot markdown polish

### Sprint 3 (Planned):
- [ ] Tab Merge — join 2 datasets + download CSV
- [ ] Tab Transform — column config + split by N rows + download chunks
- [ ] Model selection per provider

### Sprint 4 (Planned):
- [ ] Auto multi-batch from Transform tab (submit all chunks at once)
- [ ] Multi-job status tracker UI
- [ ] Error handling for oversized batch requests

### Sprint 5+:
- [ ] Login / Auth system
- [ ] Admin dashboard (pre-deploy)

## Commands
# Frontend
cd frontend && npm run dev

# Backend
cd backend && venv/Scripts/uvicorn app.main:app --reload

# Install backend deps
cd backend && venv/Scripts/pip install -r requirements.txt

## Do NOT
- Jangan gunakan `any` di TypeScript
- Jangan expose API key di frontend ke backend MDL
- Jangan kirim full file content ke LLM — gunakan schema + sample
- Jangan pakai `sudo pip install` — selalu gunakan virtual environment