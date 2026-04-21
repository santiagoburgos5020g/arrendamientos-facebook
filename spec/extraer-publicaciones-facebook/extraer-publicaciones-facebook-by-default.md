# Extraer Publicaciones de Facebook — Specification

## Overview

Add a new button "Extraer publicaciones de facebook" to the rental search app UI that triggers Apify's Facebook Groups Scraper to extract raw posts from Facebook groups and save them as JSON — **without any AI filtering step**. This is a scrape-only operation.

## Goals

- Allow the user to extract raw Facebook group posts independently from the filtering workflow
- Save raw posts to `results/` as JSON for later use (e.g., "Buscar sin AI" or "Filtrar JSON")
- Reuse existing form fields for Facebook group URLs, property type, location, and posts-per-group configuration

## UI Changes

### New Button

- **Label**: "Extraer publicaciones de facebook"
- **Placement**: Alongside the existing "Buscar" and "Buscar sin AI" buttons in the button row
- **Visibility**: Always visible (not dependent on the "Buscar sobre archivos JSON existentes" checkbox)
- **Disabled state**: When "Buscar sobre archivos JSON existentes" is checked (since scraping doesn't apply when using existing JSON files)

### Restored Field: Cantidad de Posts por Grupo

- **Bring back** the "Cantidad de Posts por Grupo" number input field
- **Default value**: 100
- **Visibility**: Only shown when "Buscar sobre archivos JSON existentes" is **unchecked**
- **Maps to**: Apify's `maxPosts` parameter (posts scraped per group)

## Signal File

When the user clicks "Extraer publicaciones de facebook", the app writes `search-request.json` with the following structure:

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
| `facebookGroupUrls` | Array of Facebook group URLs to scrape | No (empty = auto-discover) |
| `filters.tipoPropiedad` | Property type checkboxes — used for Google group discovery when no URLs provided | Yes |
| `filters.ubicacion` | Location text — used for Google group discovery when no URLs provided | Yes |
| `filters.cantidadPostsPorGrupo` | Number of posts to scrape per group (maxPosts), default 100 | Yes |

### Fields NOT Included

The following fields are **not sent** in `scraper_only` mode because they are only relevant to filtering:

- `presupuestoMaximo`
- `distanciaMaxima`
- `servicios` (banoPrivado, bano, lavanderia, serviciosPublicos)
- `fechaPublicacion`
- `numeroResultados`
- `selectedJsonFiles`

## Backend Flow (Claude Terminal)

Claude detects `search-request.json` with `mode: "scraper_only"` and executes:

### 1. Group URL Resolution

- **If `facebookGroupUrls` has URLs**: use those directly
- **If empty array**:
  a. Use Playwright MCP to open Google
  b. Search: `"grupos facebook arriendos {tipoPropiedad} {ubicacion} valle de aburrá"`
  c. Scrape Facebook group links from results
  d. Present found groups in the terminal for user confirmation
  e. Wait for user approval before proceeding

### 2. Apify Scraping

- Actor: `apify/facebook-groups-scraper`
- API: `POST https://api.apify.com/v2/acts/apify~facebook-groups-scraper/runs?token={APIFY_API_KEY}`
- Input:
  ```json
  {
    "startUrls": [{"url": "..."}, ...],
    "maxPosts": 100,
    "maxComments": 0
  }
  ```
- `maxPosts` comes from `filters.cantidadPostsPorGrupo`
- `maxComments` is always 0

### 3. Poll and Save

- Poll run status until `SUCCEEDED` (check for `stop-request.json` during polling)
- Download dataset items from completed run
- Save all posts to `results/{YYYY-MM-DD-HH-mm-ss}-raw.json` (local Colombia time, UTC-5)
- **Stop here** — no AI filtering, no HTML generation

### 4. Status Update

- Write `search-complete.json` to signal completion
- UI shows: "Búsqueda enviada. Revisa la terminal de Claude." (current behavior)

## Budget Considerations

- Free Apify plan: $5 USD/month in credits
- ~$0.25–$0.50 per 1,000 posts scraped
- Default 100 posts/group × 10 groups = ~1,000 posts per run
- ~10–20 runs per month on free tier
- User can adjust `cantidadPostsPorGrupo` but should be aware of credit usage

## Interaction with Existing Buttons

| Button | Mode | When Available | What It Does |
|--------|------|----------------|--------------|
| **Buscar** | `apify` or `json_filter` | Always | Scrape + AI filter, or filter existing JSON |
| **Buscar sin AI** | (client-side) | When "JSON existentes" checked | Local keyword filter on existing JSON |
| **Extraer publicaciones de facebook** | `scraper_only` | When "JSON existentes" unchecked | Scrape only, save raw JSON, no filtering |

## Stop Behavior

The existing "Detener Búsqueda" button works the same:
- Writes `stop-request.json`
- Claude aborts the Apify run if in progress
