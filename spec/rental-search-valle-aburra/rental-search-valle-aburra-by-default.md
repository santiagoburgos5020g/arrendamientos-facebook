# Rental Search Valle de Aburrá — Skill Specification

## Overview

A Claude Code skill that builds and operates a Next.js application for searching rental properties (arriendos) in Valle de Aburrá, Colombia. The app scrapes Facebook groups via Apify and filters results using AI. The entire workflow is orchestrated through the Claude Code terminal.

## Architecture

- **Frontend**: Next.js app with Tailwind CSS, running on `localhost:3000`
- **Language**: Spanish-only UI
- **Communication**: File-based signaling between Next.js app and Claude terminal
  - `search-request.json` — written by Next.js when user clicks "Buscar" or "Filtrar JSON"
  - `stop-request.json` — written by Next.js when user clicks "Detener Búsqueda"
- **Browser interaction**: Claude uses Playwright MCP to open and interact with the browser
- **API Keys**: Stored in `.env`, readable by both Claude and Next.js
  - `APIFY_API_KEY`
- **Distance Calculations**: Use Claude's built-in geographic knowledge of Medellín and Valle de Aburrá (no external geocoding API needed)

## Two Modes of Operation

### Mode 1: Live Apify Scraping (checkbox NOT checked)

**Flow:**
1. Claude opens browser via Playwright MCP to `localhost:3000`
2. User fills the form fields
3. User clicks "Buscar" button
4. Next.js writes `search-request.json` to project root with all form data serialized
5. Claude detects the file, reads the filters, deletes the file
6. If user provided Facebook group URLs: use those directly
7. If user did NOT provide Facebook group URLs:
   - Claude uses Playwright MCP to search Google for relevant Facebook groups
   - Uses filters like location, property type to build the search query
   - Number of groups to find is user-defined (default: 10)
   - Claude presents found groups to the user in the terminal for confirmation before proceeding
8. Claude calls Apify Facebook Groups Scraper API with the group URLs and configuration
   - Applies "Fecha de Publicación" filter at scraper level if applicable
   - Uses "Cantidad de Posts por Grupo" setting
9. Claude waits for scraper to finish
10. Raw results are saved to `results/{YYYY-MM-DD-HH-mm-ss}-raw.json` (local time)
11. All progress and results are displayed in the Claude terminal

### Mode 2: Filter Existing JSON (checkbox IS checked)

**Flow:**
1. When checkbox is checked, the form:
   - Hides: "URLs de Grupos de Facebook" section, "Cantidad de Posts por Grupo" field
   - Shows: JSON file selector (multi-select from `results/` folder)
2. User selects one or more raw JSON files and fills the filter fields
3. User clicks "Filtrar JSON" button
4. Next.js writes `search-request.json` to project root with all form data + selected file names
5. Claude detects the file, reads the filters, deletes the file
6. Claude uses Sonnet 4.6 to apply search criteria to the raw JSON data
7. Filtered results are saved as `results/{YYYY-MM-DD-HH-mm-ss}-results.html` (local time)
8. HTML file opens automatically in the browser

## Form Fields

### Fuente de Datos
- **Buscar sobre archivos JSON existentes (sin llamar a Apify)** — Checkbox that toggles between Mode 1 and Mode 2

### URLs de Grupos de Facebook (Mode 1 only)
- Textarea for Facebook group URLs (one per line)
- Placeholder: example URLs
- If left empty, Claude searches Google for groups

### JSON File Selector (Mode 2 only)
- Multi-select list showing files from `results/` folder
- Supports Ctrl+click for multiple selection

### Tipo de Propiedad
- Checkboxes: Apartamentos, Apartaestudios, Habitaciones
- Can select all or some

### Filtros de Búsqueda
- **Ubicación**: Text input (e.g., belén, sabaneta, laureles) — locations within Valle de Aburrá
- **Distancia máxima desde la ubicación**: Dropdown (e.g., Sin límite de distancia, 500m, 1km, etc.)
- **Presupuesto Máximo (COP)**: Number input

### Servicios y Amenidades
- Checkboxes: Incluye baño privado, Incluye baño, Incluir servicio de lavandería, Incluir servicios públicos

### Opciones de Búsqueda
- **Fecha de Publicación**: Dropdown with options:
  - Cualquier fecha, Últimas 24 horas, Hace 1 día, Hace 2 días, Hace 3 días, Hace 4 días, Hace 5 días, Hace 6 días, Hace 1 semana, Hace 2 semanas, Hace 3 semanas, Hace 1 mes, Hace 2 meses
- **Número de Resultados**: Number input (default: 10)
- **Cantidad de Posts por Grupo**: Number input (default: 100) — Mode 1 only

### Buttons
- **Buscar** (Mode 1) / **Filtrar JSON** (Mode 2) — Green button
- **Detener Búsqueda** — Gray button, writes `stop-request.json` for Claude to detect

## Filtering Logic

### Matching Strategy
- **Fuzzy/semantic matching** for ALL text fields, checkboxes, and dropdowns:
  - Ubicación: "belen" = "belén" = "cerca de belén" = "barrio Belén"
  - Tipo de Propiedad: "apto" = "apartamento", "aparta" = "apartaestudio", "cuarto"/"pieza" = "habitación"
  - Servicios: Each enabled checkbox is a **mandatory inclusion requirement** — the post must mention something semantically related. Equivalences: "baño propio"/"baño independiente" = "baño privado"; "lavadora"/"lavado de ropa" = "lavandería"; "servicios incluidos"/"libre de servicios" = "servicios públicos". Unchecked checkboxes are not required.
  - Fecha de Publicación: semantic matching on post dates
- **Strict matching** for:
  - **Presupuesto Máximo**: Less than or equal to the specified amount. Posts without a price are EXCLUDED when budget filter is set.
  - **Distancia máxima**: Calculated using Claude's geographic knowledge of Medellín/Valle de Aburrá. Claude identifies the user's reference location and the post's mentioned location, estimates distance based on known barrio/landmark positions, and excludes posts beyond max. Example: "Boston is ~2km from UdeA, so excluded for 500m filter"
  - **Número de Resultados**: Hard limit on output count
  - **Cantidad de Posts por Grupo**: Apify configuration

### AI Filtering
- All filtering is done by AI prompt (Sonnet 4.6)
- Filters are mandatory — all specified filters must be satisfied
- The AI reads the raw JSON and applies the semantic/strict criteria

## HTML Output Format

Basic raw HTML table with columns:
| Teléfono | Descripción | Costo | Grupo | Enlace |
|----------|-------------|-------|-------|--------|
- **Teléfono**: Contact phone from the post
- **Descripción**: Post description
- **Costo**: Rental cost
- **Grupo**: Facebook group name
- **Enlace**: Direct link to the post

The HTML file opens automatically in the browser after generation.

## File Structure

```
project-root/
├── .env                          # APIFY_API_KEY
├── search-request.json           # Temporary file for form data signaling
├── stop-request.json             # Temporary file for stop signaling
├── results/
│   ├── {datetime}-raw.json       # Raw Apify scraper output
│   └── {datetime}-results.html   # AI-filtered results table
├── docs/
│   └── APIFY_SETUP.md            # Step-by-step guide for getting Apify API key
└── (Next.js app files)
```

## Stop/Cancel Behavior

- "Detener Búsqueda" button writes `stop-request.json` to project root
- Claude detects the file and cancels the current operation (Apify scraper or filtering)
- Claude deletes the `stop-request.json` after processing

## Environment & APIs

- **Apify Facebook Groups Scraper**: https://apify.com/apify/facebook-groups-scraper
- **Distance calculations**: Claude uses built-in geographic knowledge of Medellín and Valle de Aburrá (barrios, landmarks, metro stations, universities) — no external API required
- Valle de Aburrá reference: https://es.wikipedia.org/wiki/Valle_de_Aburr%C3%A1

## Documentation

- `docs/APIFY_SETUP.md` — Step-by-step guide on how to get an Apify API key
