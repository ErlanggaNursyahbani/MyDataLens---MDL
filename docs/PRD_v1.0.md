# MyDataLens (MDL)
### Personal AI-Powered Data Analysis Tool

---

**Document Type:** Product Requirements Document (PRD)  
**Version:** v1.0.0 — Planning Phase  
**Date:** June 2026  
**Author:** Erlangga Nursyahbani  
**Status:** 🔴 Draft — Pre-Development  

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Objectives & Goals](#2-objectives--goals)
3. [Project Scope](#3-project-scope)
4. [Tech Stack](#4-tech-stack)
5. [Feature Requirements](#5-feature-requirements)
   - 5.1 [API Key & Provider Management](#51-api-key--provider-management)
   - 5.2 [File Upload & Parsing](#52-file-upload--parsing)
   - 5.3 [Dynamic AI Dashboard Generation](#53-dynamic-ai-dashboard-generation)
   - 5.4 [Natural Language Chatbot](#54-natural-language-chatbot)
   - 5.5 [Batch AI Processing](#55-batch-ai-processing)
6. [System Architecture](#6-system-architecture)
7. [Development Phases & Priorities](#7-development-phases--priorities)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Open Questions & Decisions Pending](#9-open-questions--decisions-pending)
10. [Glossary](#10-glossary)

---

## 1. Product Overview

**MyDataLens (MDL)** adalah personal data analysis tool berbasis web yang memungkinkan user untuk mengupload dataset apapun (CSV/Excel), mendapatkan dashboard analitik yang di-generate secara dinamis oleh AI, serta berinteraksi dengan data menggunakan natural language.

Tool ini juga menyediakan fitur **Batch AI Processing** untuk kebutuhan anotasi dan klasifikasi data dalam skala besar secara efisien dan hemat biaya.

**Target User:** Personal use — Data Analyst, BI Analyst, ML Engineer yang ingin analisis data cepat tanpa setup environment yang kompleks.

---

## 2. Objectives & Goals

- Menjadi personal data analysis toolkit all-in-one yang fleksibel untuk berbagai jenis dataset
- Meminimalkan biaya AI API melalui smart context management dan dukungan Batch API
- Mendukung multi-provider LLM (OpenAI, Anthropic, Gemini, Groq) agar user bebas memilih sesuai kebutuhan dan budget
- Migrasi arsitektur dari Streamlit ke modern web stack (Next.js + FastAPI) untuk skalabilitas dan UX yang lebih baik
- Deploy-ready sebagai personal self-hosted tool dengan API key management per user

---

## 3. Project Scope

### 3.1 In Scope

- Upload & parsing file CSV dan Excel secara dinamis
- AI-generated dynamic dashboard berdasarkan kolom dan tipe data file yang diupload
- Natural language chatbot untuk tanya jawab terhadap data
- Batch AI Processing untuk klasifikasi/anotasi ribuan baris data
- Multi-provider LLM support dengan API key input per user
- Free tier testing menggunakan Groq API
- Status tracker untuk Batch job dengan auto-polling dan manual check
- Download hasil Batch sebagai file CSV

### 3.2 Out of Scope (v1.0)

- Authentication system (login/register multi-user) — ini single user tool
- Database persistence antar session — data tidak disimpan di server
- Real-time collaboration
- Mobile app

---

## 4. Tech Stack

| Layer | Technology | Alasan |
|---|---|---|
| Frontend | Next.js (React) | Modern, SSR support, ecosystem luas, component-based |
| Backend | FastAPI (Python) | Async native, cocok untuk LLM API calls, Pandas ecosystem |
| Data Processing | Pandas | Standard untuk CSV/Excel processing di Python |
| Chart Library | Recharts / Chart.js | Kompatibel dengan React, ringan, customizable |
| LLM Provider | Multi-provider (pluggable) | OpenAI, Anthropic, Gemini, Groq — sesuai API key user |
| Free Tier Default | Groq API | Cloud-based, free tier, OpenAI-compatible SDK |
| Batch Processing | OpenAI Batch API / Anthropic Message Batches | 50% cost savings, async queue-based |
| Deployment (v1) | Local (localhost) | Personal tool, tidak perlu cloud di v1 |

---

## 5. Feature Requirements

### 5.1 API Key & Provider Management

User harus menginputkan API key sebelum dapat mengakses fitur utama aplikasi. Ini memastikan tidak ada API cost yang ditanggung developer ketika tool dideploy.

#### Provider Support

| Provider | Batch Support | Free Tier | Notes |
|---|---|---|---|
| OpenAI | ✅ Native Batch API | ❌ Paid | Primary batch provider, 50% cheaper |
| Anthropic (Claude) | ✅ Message Batches API | ❌ Paid | Up to 50% cheaper, async |
| Google Gemini | ⚠️ Terbatas | ✅ Free tier tersedia | Implementasi berbeda, butuh investigasi |
| Groq | ❌ Tidak ada batch | ✅ Free & fast | Default testing, rate-limited |

#### Behavior

- Halaman API Key Setup muncul pertama kali sebelum akses ke tool
- User pilih provider dari dropdown, lalu input API key
- API key disimpan di browser **session storage** (tidak dikirim ke server MDL)
- Groq tersedia sebagai default free option untuk testing tanpa biaya
- Fitur Batch Processing **hanya aktif** jika provider support batch (OpenAI / Anthropic)
- Jika provider tidak support batch → tombol Batch di-disable dengan tooltip informatif
- Semua kode backend menggunakan **abstraction layer** agar provider-agnostic

---

### 5.2 File Upload & Parsing

- Mendukung format: **CSV** (`.csv`) dan **Excel** (`.xlsx`, `.xls`)
- Auto-detect delimiter untuk CSV (comma, semicolon, tab)
- Auto-detect tipe data per kolom: `numeric`, `categorical`, `datetime`, `text`
- Preview tabel (10 baris pertama) setelah upload berhasil
- Validasi ukuran file — beri warning jika > 50MB
- Tidak ada template kolom yang wajib diikuti — **kolom apapun diterima**

---

### 5.3 Dynamic AI Dashboard Generation

Fitur inti MDL. Setelah file diupload, AI menganalisis schema (nama kolom + tipe data) dan secara otomatis memilih visualisasi yang paling relevan — tanpa user perlu konfigurasi manual apapun.

#### 5.3.1 AI Schema Analysis

- AI menerima input: daftar kolom beserta tipe data yang terdeteksi
- AI memutuskan: chart types yang relevan, kolom mana yang jadi axis, agregasi yang sesuai
- Jika data sedikit kolom atau sederhana, AI menyesuaikan dashboard secara proporsional
- **Prompt ke AI hanya menggunakan schema + sample minimal (max 20 baris) — BUKAN seluruh file** untuk efisiensi biaya

#### 5.3.2 Chart Types yang Didukung

| Chart | Use Case |
|---|---|
| Bar Chart | Perbandingan kategorikal |
| Line Chart | Tren waktu / sequential data |
| Pie / Donut Chart | Distribusi proporsi |
| Scatter Plot | Korelasi dua variabel numerik |
| Histogram | Distribusi satu variabel numerik |
| Summary Metric Card | Count, mean, median, min, max untuk kolom numerik |

#### 5.3.3 Cost Efficiency Strategy

- AI hanya menerima schema + sample (max 20 baris) untuk generate dashboard config
- Query chatbot menggunakan smart context: schema + aggregated summary, bukan raw data
- Chunking strategy untuk file besar: AI hanya memproses chunk yang relevan dengan pertanyaan user

---

### 5.4 Natural Language Chatbot

User dapat mengajukan pertanyaan bebas terhadap data yang diupload. AI menjawab berdasarkan konteks data aktual — bukan hanya summary statis.

- Pertanyaan bisa bebas sesuai konteks kolom yang ada di file user
- AI selalu **mengkonfirmasi pemahamannya** terhadap pertanyaan ambigu sebelum menjawab
- Konteks yang dikirim ke AI: schema kolom + aggregated stats + sample data — bukan seluruh file
- Chat history dipertahankan selama session aktif
- Jika pertanyaan butuh komputasi spesifik (misal: filter baris tertentu), backend FastAPI mengeksekusi Pandas, hasilnya baru dikirim ke AI untuk interpretasi

---

### 5.5 Batch AI Processing

Fitur untuk memproses ribuan baris data menggunakan AI secara efisien. Dirancang untuk use case seperti klasifikasi teks, labeling sentimen, ekstraksi informasi dari kolom teks, dll.

#### 5.5.1 User Flow

1. User upload file (CSV/Excel)
2. User pilih kolom input (kolom yang akan diproses AI)
3. User define task secara bebas — contoh: *"Klasifikasi teks ini sebagai: complaint / inquiry / compliment"*
4. **AI menampilkan konfirmasi pemahaman task sebelum eksekusi — user harus approve**
5. System submit batch request ke provider (OpenAI / Anthropic)
6. Status tracker menampilkan progress batch
7. Setelah selesai, hasil tersedia sebagai **file CSV yang bisa didownload** (dengan kolom output baru)

#### 5.5.2 Status Tracker

- Toggle button di UI untuk membuka panel status batch
- **Auto-polling** setiap 30 detik di background saat batch sedang berjalan
- Tombol manual **"Refresh Status"** tersedia untuk user yang ingin cek langsung
- **Notifikasi popup / banner** muncul otomatis ketika batch selesai
- Status yang ditampilkan: `Queued` → `Processing` → `Completed` / `Failed`
- Jika `Failed`: tampilkan error message yang informatif

#### 5.5.3 Provider Availability untuk Batch

| Provider | Status | Notes |
|---|---|---|
| OpenAI | ✅ Full support | Native Batch API, async queue, 50% cost savings |
| Anthropic | ✅ Full support | Message Batches API, up to 50% cheaper |
| Gemini | ⚠️ Investigasi | Fitur batch terbatas, mungkin butuh workaround |
| Groq | ❌ Tidak support | Tombol Batch disabled + tooltip informatif |

---

## 6. System Architecture

### 6.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js)                   │
│  API Key Setup │ File Upload │ Dashboard │ Chat │ Batch  │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP (REST)
┌───────────────────────────▼─────────────────────────────┐
│                    BACKEND (FastAPI)                      │
│                                                           │
│  ┌─────────────────────────────────────────────────┐     │
│  │            LLM Abstraction Layer                 │     │
│  │  generate_response() │ submit_batch()            │     │
│  │  check_batch_status()                            │     │
│  └──────┬──────────┬──────────┬──────────┬─────────┘     │
│         │          │          │          │                 │
│      OpenAI    Anthropic   Gemini      Groq               │
│                                                           │
│  ┌──────────────────┐   ┌──────────────────────────┐     │
│  │  Pandas Engine   │   │  Batch Job Store          │     │
│  │  (CSV/Excel)     │   │  (in-memory, local)       │     │
│  └──────────────────┘   └──────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### 6.2 LLM Abstraction Layer

Seluruh komunikasi ke LLM provider melalui satu abstraction layer di backend. Ketika user ganti provider, tidak ada perubahan logika di frontend maupun fitur lain.

```python
# Interface design (Strategy Pattern)
class LLMProvider:
    def generate_response(prompt, context, api_key) -> str
    def submit_batch(requests, api_key) -> batch_id
    def check_batch_status(batch_id, api_key) -> BatchStatus

# Implementations
class OpenAIProvider(LLMProvider): ...
class AnthropicProvider(LLMProvider): ...
class GeminiProvider(LLMProvider): ...
class GroqProvider(LLMProvider): ...
```

---

## 7. Development Phases & Priorities

| Phase | Fitur | Priority | Notes |
|---|---|---|---|
| Phase 1 | Frontend Migration (Next.js) + API Key Setup UI + File Upload | 🔴 High | Foundation — semua feature bergantung ini |
| Phase 2 | Dynamic Dashboard — AI Schema Analysis + Chart Generation | 🔴 High | Core feature MDL |
| Phase 3 | Natural Language Chatbot dengan smart context | 🟡 Medium | Upgrade dari static summary |
| Phase 4 | Batch AI Processing + Status Tracker | 🟡 Medium | Feature killer untuk heavy use case |
| Phase 5 | Multi-provider polish + Groq free tier + Error handling | 🟢 Low | Stabilisasi sebelum deploy |

---

## 8. Non-Functional Requirements

### 8.1 Performance

- File upload dan parsing < 5 detik untuk file hingga 10MB
- Dashboard generation (AI response) < 15 detik untuk schema analysis
- Chatbot response < 10 detik untuk pertanyaan normal

### 8.2 Cost Efficiency

- AI hanya menerima schema + sample data — bukan raw file — kecuali untuk Batch Processing
- Batch API digunakan untuk workload besar (> 100 baris yang butuh AI processing)
- Token usage diestimasi sebelum request dikirim untuk transparency ke user *(nice to have)*

### 8.3 Security

- API key **tidak pernah** disimpan di server MDL — hanya di browser session storage
- API key di-mask di UI (input type password)
- Tidak ada logging API key di backend

### 8.4 Usability

- Onboarding jelas: user tahu harus input API key dulu sebelum bisa mulai
- Error message yang informatif — bukan generic `500 Internal Server Error`
- AI selalu mengkonfirmasi sebelum aksi yang tidak bisa di-undo (misal: submit batch)

---

## 9. Open Questions & Decisions Pending

| # | Pertanyaan | Status |
|---|---|---|
| 1 | Chart library final: Recharts vs Chart.js vs D3? — Recharts direkomendasikan untuk integrasi Next.js | ⏳ Pending decision |
| 2 | Apakah perlu export dashboard sebagai PDF/PNG di v1? | ⏳ Pending — likely v2 |
| 3 | Gemini batch support — butuh investigasi teknis lebih lanjut saat implementasi Phase 4 | ⏳ Pending investigation |
| 4 | Apakah file diproses di memory saja atau ada temp storage lokal di backend? | ⏳ Pending — in-memory untuk v1 |
| 5 | Token usage estimator sebelum submit — implement di v1 atau v2? | ⏳ Pending — nice to have |

---

## 10. Glossary

| Term | Definisi |
|---|---|
| **Batch API** | Mekanisme pengiriman banyak request ke LLM sekaligus untuk diproses async di server provider, menghasilkan penghematan biaya hingga 50% |
| **Schema Analysis** | Proses AI membaca nama kolom dan tipe data untuk memutuskan visualisasi relevan tanpa melihat seluruh isi file |
| **Smart Context** | Strategi efisiensi: hanya mengirim schema + aggregated summary + sample kecil ke LLM, bukan raw data penuh |
| **LLM Abstraction Layer** | Interface Python tunggal yang membungkus semua provider LLM — memungkinkan ganti provider tanpa ubah logika bisnis |
| **MDL** | Singkatan dari MyDataLens |
| **Groq** | Provider LLM cloud dengan free tier yang kompatibel dengan OpenAI SDK — digunakan sebagai default testing option di MDL |

---

> **Note:** Dokumen ini adalah Planning Document — tidak ada implementasi yang dilakukan pada fase ini. Seluruh keputusan teknis yang masih pending akan dikonfirmasi sebelum development dimulai.
>
> **Next Step:** Review PRD ini → konfirmasi Open Questions di Section 9 → mulai Phase 1 development.
