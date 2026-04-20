# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **rental property search application** targeting Valle de Aburrá, Colombia. It combines a Next.js frontend with Claude Code terminal-based backend processing. The app scrapes Facebook groups via Apify and filters results using AI models (Sonnet 4.6 for filtering, Opus 4.6 for validation). The application is fully implemented and operational.

## Technology Stack

- **Framework**: Next.js 16.2.4 (App Router), React 19.2.5, TypeScript 6.0.3
- **Styling**: Tailwind CSS 4.2.2 with PostCSS
- **External API**: Apify Facebook Groups Scraper
- **AI Filtering**: Sonnet 4.6 (initial filtering), Opus 4.6 (validation)
- **Communication**: File-based signaling (JSON files between UI and Claude terminal)

## Repository Structure

```
├── src/app/                  — Next.js App Router source code
│   ├── api/search/route.ts   — POST: writes search-request.json
│   ├── api/stop/route.ts     — POST: writes stop-request.json
│   ├── api/json-files/route.ts — GET: lists *-raw.json from results/
│   ├── page.tsx              — Main form UI (Spanish only)
│   ├── layout.tsx            — Root layout
│   └── globals.css           — Tailwind CSS import
├── .claude/skills/           — Claude Code skill definitions (SKILL.md files)
├── spec/                     — Project specifications (brainstorm-and-review workflow)
├── results/                  — Runtime output: raw JSON, filtered JSON, HTML tables
├── docs/                     — Documentation (APIFY_SETUP.md)
├── .env                      — APIFY_API_KEY (not committed)
└── .env.example              — Environment variable template
```

## Skills

| Skill | Invocation | Purpose |
|-------|-----------|---------|
| `rental-search-valle-aburra` | Auto or `/rental-search-valle-aburra` | Operate the rental search app: Apify scraping and AI filtering |
| `idea-to-skill` | `/idea-to-skill` only | Three-phase workflow: brainstorm → Opus review → generate SKILL.md |
| `idea-to-spec` | `/idea-to-spec` only | Two-phase workflow: brainstorm → Opus review → save spec |
| `create-custom-skill` | Auto or `/create-custom-skill` | Scaffold a new skill with guided input |

## Application Architecture

### Two Modes of Operation

1. **Mode 1 — Apify Scraping**: Scrapes Facebook groups via Apify API, saves raw JSON to `results/`
2. **Mode 2 — JSON Filtering**: Filters existing raw JSON using AI, outputs HTML tables to `results/`

### File-Based Signaling

Communication between the Next.js UI and Claude terminal uses signal files written to the project root:
- `search-request.json` — triggers a search/filter operation
- `stop-request.json` — cancels an in-progress operation
- `search-complete.json` — indicates operation completion

The authoritative spec is `spec/rental-search-valle-aburra/rental-search-valle-aburra-by-opus-4-6.md`.

## Development

- Port: `localhost:3000`
- Start dev server: `npm run dev`
- UI language: Spanish only
- Environment variables (`.env`): `APIFY_API_KEY`
- Datetime in filenames: `YYYY-MM-DD-HH-mm-ss` in local Colombia time (UTC-5)

## Filtering Rules

- **Fuzzy/semantic matching** for all fields EXCEPT price and distance
- **Price**: strict ≤ (user's budget is the ceiling)
- **Distance**: strict, using Claude's geographic knowledge of Medellín/Valle de Aburrá
- **Price is mandatory in results**: The AI must extract the price from every listing. If the price is mentioned anywhere in the post text or OCR text, it MUST appear in the final HTML results. Do not leave price as null/empty when the post contains price information — look carefully in the full text, OCR text, and any numeric patterns (e.g., "260 mil", "$700.000", "650", "1.150.000").
- **Phone numbers link to WhatsApp**: In the HTML results table, every phone number in the "Teléfono" column must be a clickable link to WhatsApp (`https://wa.me/57{digits}?text=...`). The pre-filled message must be: `Hola, vi tu publicación, sigue disponible? {post_url}` (URL-encoded). Strip non-digit chars from phone before building the wa.me URL.
