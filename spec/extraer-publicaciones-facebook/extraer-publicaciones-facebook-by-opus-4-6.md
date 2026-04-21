# Extraer Publicaciones de Facebook — Specification (Reviewed)

## Overview

Add a new button "Extraer publicaciones de facebook" to the rental search app UI that triggers Apify's Facebook Groups Scraper to extract raw posts from Facebook groups and save them as JSON — **without any AI filtering step**. This is a scrape-only operation. The resulting raw JSON files can later be used with "Buscar sin AI" (keyword filtering) or "Filtrar JSON" (AI filtering).

## Goals

- Allow the user to extract raw Facebook group posts independently from the filtering workflow
- Save raw posts to `results/` as JSON for later use (e.g., "Buscar sin AI" or "Filtrar JSON")
- Reuse existing form fields for Facebook group URLs, property type, location, and posts-per-group configuration
- Keep the Apify free-tier budget in mind (default 100 posts/group)

---

## UI Changes

### New Button

- **Label**: `"Extraer publicaciones de facebook"`
- **Placement**: Alongside the existing "Buscar", "Buscar sin AI", and "Detener Búsqueda" buttons in the button row
- **Color/Style**: Distinct from the green "Buscar" and blue "Buscar sin AI" — use **orange/amber** (`bg-amber-500 hover:bg-amber-600 text-white`) to visually differentiate it as a data-extraction action rather than a search/filter action
- **Disabled states**:
  - Disabled when "Buscar sobre archivos JSON existentes" is **checked** (scraping doesn't apply to existing files)
  - Disabled while a scraping operation is already in progress (prevent double-submission)
- **Loading state**: Button text changes to `"Extrayendo..."` while the request is being sent

### Restored Field: Cantidad de Posts por Grupo

- **Bring back** the "Cantidad de Posts por Grupo" number input field
- **Default value**: `100`
- **Visibility**: Only shown when "Buscar sobre archivos JSON existentes" is **unchecked**
- **Maps to**: Apify's `maxPosts` parameter (posts scraped per group)
- **Shared**: This field is used by both the "Buscar" button (apify mode) and the "Extraer publicaciones de facebook" button (scraper_only mode)

---

## Signal File

When the user clicks "Extraer publicaciones de facebook", the app writes `search-request.json` to the project root with the following structure:

```json
{
  "mode": "scraper_only",
  "timestamp": "2026-04-21T17:44:17",
  "facebookGroupUrls": [
    "https://www.facebook.com/groups/example1",
    "https://www.facebook.com/groups/example2"
  ],
  "filters": {
    "tipoPropiedad": {
      "apartamentos": true,
      "apartaestudios": false,
      "habitaciones": true
    },
    "ubicacion": "belén",
    "cantidadPostsPorGrupo": 100
  }
}
```

### Fields Included

| Field | Purpose | Required |
|-------|---------|----------|
| `mode` | `"scraper_only"` — differentiates from `"apify"` (scrape+filter) and `"json_filter"` | Yes |
| `timestamp` | ISO timestamp of the request | Yes |
| `facebookGroupUrls` | Array of Facebook group URLs to scrape | No (empty array = auto-discover via Google) |
| `filters.tipoPropiedad` | Property type checkboxes — used for Google group discovery when no URLs provided | Yes |
| `filters.ubicacion` | Location text — used for Google group discovery when no URLs provided | Yes |
| `filters.cantidadPostsPorGrupo` | Number of posts to scrape per group (Apify `maxPosts`), default 100 | Yes |

### Fields NOT Included

The following fields are **not sent** in `scraper_only` mode because they are only relevant to filtering:

- `presupuestoMaximo`
- `distanciaMaxima`
- `servicios` (banoPrivado, bano, lavanderia, serviciosPublicos)
- `fechaPublicacion`
- `numeroResultados`
- `selectedJsonFiles`

---

## Backend Flow (Next.js API Route — fully automatic)

The "Extraer publicaciones de facebook" button calls `POST /api/extract` directly. The entire scraping flow runs server-side in the Next.js backend — **no file-based signaling, no Claude terminal required**.

The route uses **Server-Sent Events (SSE)** to stream real-time status updates to the UI status bar.

### Step 1 — Group URL Resolution

- **If `facebookGroupUrls` has URLs**: use those directly
- **If empty array**:
  a. Call Apify **Google Search Scraper** (`apify/google-search-scraper`) with query: `"grupos facebook arriendos {tipoPropiedad} {ubicacion} valle de aburrá"`
  b. Extract Facebook group URLs from organic search results
  c. Proceed automatically (no manual confirmation needed)

### Step 2 — Apify Scraping

- Actor: `apify/facebook-groups-scraper`
- API: `POST https://api.apify.com/v2/acts/apify~facebook-groups-scraper/runs?token={APIFY_API_KEY}`
- Input:
  ```json
  {
    "startUrls": [{"url": "https://www.facebook.com/groups/..."}, ...],
    "maxPosts": 100,
    "maxComments": 0
  }
  ```
- `maxPosts` comes from `filters.cantidadPostsPorGrupo` (default 100)
- `maxComments` is always hardcoded to `0`

### Step 3 — Poll and Save

- Poll run status until `"SUCCEEDED"` or error/timeout (max 5 minutes)
- On success: download dataset items
- Save all posts to `results/{YYYY-MM-DD-HH-mm-ss}-raw.json` (local Colombia time, UTC-5)
- **Stop here** — no AI filtering, no HTML generation, no preprocessing

### SSE Status Messages (streamed to UI)

| Step | Message |
|------|---------|
| Discovering groups | `"Buscando grupos de Facebook en Google..."` |
| Groups found | `"{N} grupos encontrados"` |
| Scraping | `"Extrayendo publicaciones de {N} grupo(s)..."` |
| Polling | `"Esperando resultados de Apify..."` |
| Downloading | `"Descargando publicaciones..."` |
| Complete | `"Extracción completada. {N} publicaciones guardadas."` |
| Error | Error message from Apify or network |

---

## Interaction with Existing Buttons

| Button | Signal Mode | When Available | What It Does |
|--------|------------|----------------|--------------|
| **Buscar** | `"apify"` or `"json_filter"` | Always | Scrape + AI filter (apify mode), or filter existing JSON (json_filter mode) |
| **Buscar sin AI** | (client-side only) | When "JSON existentes" is checked | Local keyword filter on existing JSON — no signal file |
| **Extraer publicaciones de facebook** | `"scraper_only"` | When "JSON existentes" is **unchecked** | Scrape only → save raw JSON, no filtering |
| **Detener Búsqueda** | writes `stop-request.json` | Always | Cancels any in-progress operation |

### Behavior of "Buscar" button (apify mode)

The existing "Buscar" button in apify mode should also send `cantidadPostsPorGrupo` in its payload now that the field is restored. This ensures both buttons use the same maxPosts value.

---

## Budget Considerations

- Free Apify plan: **$5 USD/month** in platform credits
- Facebook Groups Scraper costs roughly **$0.25–$0.50 per 1,000 posts** scraped
- Default: 100 posts/group × 10 groups = ~1,000 posts per run
- Estimated **10–20 runs per month** on the free tier
- User can increase `cantidadPostsPorGrupo` but should be mindful of credit consumption
- No in-app warning for budget — user manages this via their Apify dashboard

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `APIFY_API_KEY` not set in `.env` | API returns 500 error; UI shows "APIFY_API_KEY no configurada en .env" |
| Apify run fails (`FAILED`/`TIMED-OUT`/`ABORTED`) | SSE streams error message to UI status bar |
| No Facebook groups found on Google | UI shows "No se encontraron grupos de Facebook. Intenta agregar URLs manualmente." |
| Empty scraper results (0 posts) | Saves empty array to raw JSON, reports "0 publicaciones guardadas" |
| Network error calling Apify API | SSE streams error message to UI |

---

## Stop Behavior

The existing "Detener Búsqueda" button works identically for `scraper_only` mode:
- Writes `stop-request.json` to project root
- Claude detects the file during polling, aborts the Apify run: `POST https://api.apify.com/v2/actor-runs/{runId}/abort?token={APIFY_API_KEY}`
- Deletes `stop-request.json`
- Reports cancellation in terminal

---

## Files Affected

| File | Change |
|------|--------|
| `src/app/page.tsx` | Add "Extraer publicaciones de facebook" button, restore `cantidadPostsPorGrupo` state + field, add `handleExtract` handler with SSE streaming |
| `src/app/api/extract/route.ts` | **New file** — handles full Apify scraping flow server-side (Google Search Scraper for group discovery + Facebook Groups Scraper for post extraction) with SSE streaming |
| `.claude/skills/rental-search-valle-aburra/SKILL.md` | Document Mode 3 (scraper_only), `POST /api/extract` route, and updated button list |
