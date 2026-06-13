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
├── frontend/        # Next.js app
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

## Master Feature List

### Sprint 1 (Current):
- [ ] Tab Navigation (Overview, Dashboard, Batch, Merge)
- [ ] Chatbot floating button + slide panel
- [ ] KPI cards consistency fix (full dataset)

### Sprint 2:
- [ ] Batch multi-column input (multi-select)
- [ ] Batch identity column + dual download (raw/merged)
- [ ] Batch preview output (3-5 sample rows before submit)

### Sprint 3:
- [ ] Tab 4: Merge Your Data (join 2 datasets, zero AI cost)
- [ ] Model selection per provider
- [ ] Dynamic provider support (DeepSeek, Qwen, custom base URL)

### Sprint 4:
- [ ] Dark/Light mode toggle

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