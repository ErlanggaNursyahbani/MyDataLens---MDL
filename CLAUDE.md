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

## Current Phase
Phase 1 — Foundation:
- [ ] Next.js project setup
- [ ] FastAPI project setup
- [ ] API Key setup UI
- [ ] File upload & parsing

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