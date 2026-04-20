# Rental Search Valle de Aburrá — Skill Specification (Opus 4.6 Reviewed)

## Overview

A Claude Code skill that builds and operates a Next.js application for searching rental properties (arriendos) in Valle de Aburrá, Colombia. The app has two modes: (1) Live scraping of Facebook groups via Apify, and (2) AI-powered filtering of previously scraped raw JSON files. The Next.js app serves as a form UI only — all processing, API calls, scraping, and filtering are orchestrated through the Claude Code terminal. Communication between the UI and Claude uses file-based signaling.

## Architecture

- **Frontend**: Next.js app (App Router) with Tailwind CSS, running on `localhost:3000`
- **Language**: Spanish-only UI
- **Communication**: File-based signaling between Next.js and Claude terminal
  - `search-request.json` — written by Next.js when user clicks "Buscar" or "Filtrar JSON"
  - `stop-request.json` — written by Next.js when user clicks "Detener Búsqueda"
  - Claude polls for these files, processes them, then deletes them
- **Browser interaction**: Claude uses Playwright MCP to open the browser and to search Google when needed
- **API Keys**: Stored in `.env` at project root, readable by both Claude (terminal) and Next.js (server-side via `process.env`)
  - `APIFY_API_KEY` — for Facebook Groups Scraper
- **Distance Calculations**: Claude uses built-in geographic knowledge of Medellín and Valle de Aburrá (no external geocoding API needed)
- **AI Filtering**: Sonnet 4.6 model for semantic/fuzzy analysis of scraped posts

---

## Two Modes of Operation

### Mode 1: Live Apify Scraping (checkbox NOT checked)

**Purpose**: Scrape Facebook groups and save raw results. This mode does NOT filter — it only collects data.

**Flow:**
1. Claude opens browser via Playwright MCP to `localhost:3000`
2. User fills the form fields (property type, location, budget, services, date range, etc.)
3. User optionally enters Facebook group URLs in the textarea (one per line)
4. User clicks "Buscar" button
5. Next.js `POST /api/search` endpoint serializes all form data and writes `search-request.json` to project root
6. Claude detects the file, reads the filters, deletes `search-request.json`
7. **If user provided Facebook group URLs**: use those directly
8. **If user did NOT provide Facebook group URLs**:
   a. Claude uses Playwright MCP to open Google and search for relevant Facebook groups
   b. Search query is constructed from the filters: e.g., `"grupos facebook arriendos apartamentos belén medellín valle de aburrá"`
   c. Claude scrapes the Google results page for Facebook group links
   d. Number of groups to find: user-defined via "Número de Resultados" field (default: 10)
   e. Claude presents the found groups in the terminal and **waits for user confirmation** before proceeding
   f. User can approve all, remove some, or add additional URLs
9. Claude calls the Apify Facebook Groups Scraper API:
   - Actor: `apify/facebook-groups-scraper`
   - Input: group URLs, post count per group ("Cantidad de Posts por Grupo", default 100)
   - Applies "Fecha de Publicación" filter at the scraper level if the Apify actor supports date filtering
10. Claude waits for the Apify actor run to complete (polls the run status endpoint)
11. Claude downloads the results from the Apify dataset
12. Raw results (all posts, unfiltered) are saved to `results/{YYYY-MM-DD-HH-mm-ss}-raw.json` (local time)
13. All progress is displayed in the Claude terminal — no status updates in the browser UI

**After Mode 1**: The user switches to Mode 2 (checks the checkbox) to filter the newly scraped data.

### Mode 2: Filter Existing JSON (checkbox IS checked)

**Purpose**: Filter previously scraped raw JSON files using AI-powered semantic analysis.

**Flow:**
1. When the checkbox is checked, the form dynamically:
   - **Hides**: "URLs de Grupos de Facebook" textarea, "Cantidad de Posts por Grupo" field
   - **Shows**: JSON file multi-select list (populated from `results/` folder via `GET /api/json-files`)
2. User selects one or more `*-raw.json` files (Ctrl+click for multi-select)
3. User fills the filter fields (property type, location, budget, services, date, etc.)
4. User clicks "Filtrar JSON" button
5. Next.js writes `search-request.json` with all form data + selected JSON file names
6. Claude detects the file, reads it, deletes `search-request.json`
7. Claude loads and merges the selected raw JSON files into a single dataset (concatenates the post arrays, removes exact duplicates by post URL/ID)
8. Claude constructs an AI filtering prompt for Sonnet 4.6 with:
   - The merged post data
   - All user-specified filters (see Filtering Logic section)
   - Instructions for fuzzy/semantic matching vs. strict matching
9. Sonnet 4.6 processes the data and returns matching posts
10. Claude generates `results/{YYYY-MM-DD-HH-mm-ss}-results.html` (local time) with a basic HTML table
11. Claude opens the HTML file automatically in the browser via Playwright MCP

---

## search-request.json Schema

```json
{
  "mode": "apify" | "json_filter",
  "timestamp": "2026-04-19T17:44:17",
  "facebookGroupUrls": ["https://www.facebook.com/groups/example1"],
  "selectedJsonFiles": ["2026-04-19-17-44-17-raw.json"],
  "filters": {
    "tipoPropiedad": {
      "apartamentos": true,
      "apartaestudios": false,
      "habitaciones": true
    },
    "ubicacion": "belén",
    "distanciaMaxima": "500m" | "1km" | "2km" | "5km" | "10km" | "sin_limite",
    "presupuestoMaximo": 1500000,
    "servicios": {
      "banoPrivado": false,
      "bano": true,
      "lavanderia": false,
      "serviciosPublicos": true
    },
    "fechaPublicacion": "cualquier_fecha" | "ultimas_24h" | "1_dia" | "2_dias" | "3_dias" | "4_dias" | "5_dias" | "6_dias" | "1_semana" | "2_semanas" | "3_semanas" | "1_mes" | "2_meses",
    "numeroResultados": 10,
    "cantidadPostsPorGrupo": 100
  }
}
```

- `mode`: `"apify"` when checkbox is unchecked, `"json_filter"` when checked
- `facebookGroupUrls`: only present in `"apify"` mode; empty array if user didn't provide any
- `selectedJsonFiles`: only present in `"json_filter"` mode; array of file names from `results/`
- `cantidadPostsPorGrupo`: only relevant in `"apify"` mode

## stop-request.json Schema

```json
{
  "action": "stop",
  "timestamp": "2026-04-19T17:50:00"
}
```

Claude detects this file, cancels the current operation (aborts Apify run or stops filtering), and deletes the file.

---

## Form Fields — Complete Specification

### Fuente de Datos (fieldset, light blue background)
- **Buscar sobre archivos JSON existentes (sin llamar a Apify)** — Checkbox
  - Unchecked (default): Mode 1 (Apify scraping)
  - Checked: Mode 2 (JSON filtering)

### JSON File Selector (Mode 2 only, shown when checkbox is checked)
- Label: "Selecciona uno o más archivos JSON (Ctrl+clic para seleccionar varios):"
- Multi-select `<select multiple>` element
- Populated via `GET /api/json-files` which reads `results/` folder for `*-raw.json` files
- Files displayed with their full datetime filename

### URLs de Grupos de Facebook (Mode 1 only, hidden when checkbox is checked)
- Fieldset with legend "URLs de Grupos de Facebook"
- Label: "Ingresa las URLs de grupos públicos (una por línea). Si se deja vacío, se buscarán grupos en Google."
- `<textarea>` with placeholder showing example URLs
- Each URL on a separate line

### Tipo de Propiedad (fieldset)
- Checkboxes (inline):
  - Apartamentos
  - Apartaestudios
  - Habitaciones
- User can select any combination (all, some, or none)

### Filtros de Búsqueda (fieldset)
- **Ubicación** (ej: belén, sabaneta, laureles):
  - Text input
  - Placeholder: "cerca de medellín"
  - Locations within Valle de Aburrá (municipalities: Medellín, Bello, Itagüí, Envigado, Sabaneta, La Estrella, Caldas, Copacabana, Girardota, Barbosa; and their barrios/neighborhoods)

- **Distancia máxima desde la ubicación**:
  - Dropdown `<select>` with options:
    - Sin límite de distancia (default)
    - 500 metros
    - 1 km
    - 2 km
    - 5 km
    - 10 km
    - 20 km

- **Presupuesto Máximo (COP)**:
  - Number input
  - Placeholder: "1500000"

### Servicios y Amenidades (fieldset)
- Checkboxes (inline, wrapping):
  - Incluye baño privado
  - Incluye baño
  - Incluir servicio de lavandería
  - Incluir servicios públicos

### Opciones de Búsqueda (fieldset)
- **Fecha de Publicación**:
  - Dropdown `<select>` with options:
    - Cualquier fecha (default)
    - Últimas 24 horas
    - Hace 1 día
    - Hace 2 días
    - Hace 3 días
    - Hace 4 días
    - Hace 5 días
    - Hace 6 días
    - Hace 1 semana
    - Hace 2 semanas
    - Hace 3 semanas
    - Hace 1 mes
    - Hace 2 meses

- **Número de Resultados**:
  - Number input (default: 10)
  - In Mode 1: also used as the number of Google groups to find (when no URLs provided)

- **Cantidad de Posts por Grupo** (Mode 1 only, hidden when checkbox is checked):
  - Number input (default: 100)

### Buttons
- **Buscar** (Mode 1) / **Filtrar JSON** (Mode 2):
  - Green button (`bg-green-500` or similar)
  - Text changes dynamically based on mode
- **Detener Búsqueda**:
  - Gray button (`bg-gray-400` or similar)
  - Always visible regardless of mode

---

## Filtering Logic

### Matching Strategy by Field

| Field | Matching Type | Details |
|-------|--------------|---------|
| Tipo de Propiedad | Fuzzy/Semantic | "apto" = "apartamento", "aparta"/"apartaestudio", "cuarto"/"pieza"/"room" = "habitación" |
| Ubicación | Fuzzy/Semantic | Accent-insensitive, partial matches, neighborhood aliases (e.g., "belen" = "belén" = "barrio Belén" = "cerca de Belén") |
| Distancia máxima | **Strict** | Calculated using Claude's built-in geographic knowledge of Medellín/Valle de Aburrá: identify user's reference location → identify post's mentioned location → estimate distance based on known barrio/landmark positions → exclude if > max distance |
| Presupuesto Máximo | **Strict** | Post cost must be ≤ budget. Posts with NO price mentioned are **EXCLUDED** when budget filter is set |
| Servicios y Amenidades | Fuzzy/Semantic (mandatory if checked) | Each enabled checkbox = mandatory requirement. Post MUST mention something related. "baño propio"/"baño independiente" = "baño privado"; "lavadora"/"lavado de ropa" = "lavandería"; "servicios incluidos"/"libre de servicios" = "servicios públicos". Unchecked = not required. |
| Fecha de Publicación | Fuzzy/Semantic | AI interprets post dates relative to current date; applied at both Apify scraper level (if supported) and during AI filtering |
| Número de Resultados | **Strict** | Hard limit on number of results returned |
| Cantidad de Posts por Grupo | **Strict** | Passed directly to Apify scraper configuration |

### AI Filtering Prompt Structure

When Claude invokes Sonnet 4.6 for filtering, the prompt should include:
1. The complete list of user filters with their values
2. Clear instructions distinguishing fuzzy/semantic vs. strict fields
3. The raw JSON post data to analyze
4. Instructions to return ONLY posts that satisfy ALL specified filters (filters are mandatory, not optional)
5. For each matching post, extract: teléfono, descripción, costo, grupo, enlace
6. If a field cannot be extracted (e.g., no phone number), leave it as "N/A"

### Distance Calculation (Geographic Knowledge)

Claude uses built-in knowledge of Medellín and Valle de Aburrá geography to estimate distances:

1. Identify the user's reference location (barrio, landmark, university, metro station)
2. For each post, identify the mentioned location from the text/OCR
3. Estimate approximate distance based on known geographic relationships between neighborhoods, landmarks, metro stations, and universities in Valle de Aburrá
4. Exclude posts where estimated distance > user's "Distancia máxima"
5. If a post doesn't mention a recognizable location and distance filter is active, exclude it
6. Key reference points (approximate distances from common landmarks):
   - UdeA campus: Calle 67/Carrera 53 — Torres de la Fuente, Faro del Río, Paseo de Sevilla are <200m; Sevilla/Jesús Nazareno <500m; Boston ~2km; Robledo ~3km; Laureles ~3km; Belén ~6km
   - Metro stations provide good distance anchors between neighborhoods
   - When uncertain, err on inclusion and note uncertainty in the exclusion table

---

## HTML Output Format

Basic raw HTML table. No external CSS frameworks — inline styles or minimal `<style>` block only.

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Resultados de Búsqueda - {datetime}</title>
</head>
<body>
  <h1>Resultados de Búsqueda de Arriendos</h1>
  <p>Fecha: {datetime} | Filtros aplicados: {summary of filters}</p>
  <table border="1">
    <thead>
      <tr>
        <th>Teléfono</th>
        <th>Descripción</th>
        <th>Costo</th>
        <th>Grupo</th>
        <th>Enlace</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>{phone or "N/A"}</td>
        <td>{post description}</td>
        <td>{rental cost in COP}</td>
        <td>{Facebook group name}</td>
        <td><a href="{post URL}" target="_blank">Ver publicación</a></td>
      </tr>
      <!-- ... more rows ... -->
    </tbody>
  </table>
</body>
</html>
```

The HTML file opens automatically in the browser after generation via Playwright MCP.

---

## Next.js API Routes

### `POST /api/search`
- Receives form data from the frontend
- Writes `search-request.json` to the project root
- Returns `{ success: true }`

### `POST /api/stop`
- Writes `stop-request.json` to the project root
- Returns `{ success: true }`

### `GET /api/json-files`
- Reads the `results/` directory
- Returns a list of `*-raw.json` filenames for the file selector
- Returns `{ files: ["2026-04-19-17-44-17-raw.json", ...] }`

---

## File Structure

```
project-root/
├── .env                              # APIFY_API_KEY
├── .env.example                      # Template with placeholder values
├── .gitignore                        # Includes .env, search-request.json, stop-request.json
├── search-request.json               # Temporary signaling file (created/deleted at runtime)
├── stop-request.json                 # Temporary signaling file (created/deleted at runtime)
├── results/
│   ├── {datetime}-raw.json           # Raw Apify scraper output (all posts)
│   └── {datetime}-results.html       # AI-filtered results table
├── docs/
│   └── APIFY_SETUP.md               # Step-by-step guide for getting Apify API key
├── src/
│   └── app/
│       ├── page.tsx                  # Main form UI
│       ├── layout.tsx                # Root layout
│       └── api/
│           ├── search/route.ts       # POST: write search-request.json
│           ├── stop/route.ts         # POST: write stop-request.json
│           └── json-files/route.ts   # GET: list raw JSON files
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.ts
```

## Datetime Format

All datetime strings in filenames use **local time** (Colombia, UTC-5) in the format:
```
YYYY-MM-DD-HH-mm-ss
```
Example: `2026-04-19-17-44-17-raw.json`

---

## Stop/Cancel Behavior

1. User clicks "Detener Búsqueda" in the UI
2. Next.js `POST /api/stop` writes `stop-request.json` to project root
3. Claude detects `stop-request.json` during its polling/processing loop
4. Claude cancels the current operation:
   - **If Apify scraper is running**: abort the actor run via Apify API
   - **If AI filtering is in progress**: stop processing and discard partial results
5. Claude deletes `stop-request.json`
6. Claude reports the cancellation in the terminal

---

## Error Handling

- **Apify API failure**: Claude reports the error in the terminal and suggests the user check their API key or try again
- **No Facebook groups found on Google**: Claude reports that no groups were found and suggests the user provide URLs manually
- **Empty scraper results**: Claude reports that no posts were found in the scraped groups
- **No matching posts after filtering**: Claude generates the HTML file with an empty table and a message "No se encontraron resultados que coincidan con los filtros"
- **Missing .env keys**: Claude checks for required environment variables before starting and warns if any are missing
- **Invalid JSON files**: Claude reports which file(s) couldn't be parsed and continues with the valid ones

---

## Google Search for Facebook Groups (Mode 1, no URLs provided)

When the user doesn't provide Facebook group URLs, Claude:

1. Opens Google via Playwright MCP
2. Constructs a search query combining the user's filters:
   - Base: `"grupos facebook arriendos"`
   - Add property types: `"apartamentos"` / `"apartaestudios"` / `"habitaciones"`
   - Add location: user's ubicación value + `"valle de aburrá"` or `"medellín"`
   - Example: `grupos facebook arriendos apartamentos belén medellín`
3. Navigates through search results looking for `facebook.com/groups/` links
4. Collects up to N groups (N = user's "Número de Resultados" value, default 10)
5. Presents the list to the user in the terminal:
   ```
   Grupos de Facebook encontrados:
   1. [Arriendos Medellín] - https://facebook.com/groups/...
   2. [Apartamentos Belén] - https://facebook.com/groups/...
   ...
   ¿Desea proceder con estos grupos? (sí/no/editar)
   ```
6. Waits for user confirmation before calling Apify

---

## Apify Integration Details

### API Endpoint
- Actor: `apify/facebook-groups-scraper`
- Run actor: `POST https://api.apify.com/v2/acts/apify~facebook-groups-scraper/runs?token={APIFY_API_KEY}`
- Check run status: `GET https://api.apify.com/v2/actor-runs/{runId}?token={APIFY_API_KEY}`
- Get dataset items: `GET https://api.apify.com/v2/datasets/{datasetId}/items?token={APIFY_API_KEY}`

### Actor Input Configuration
```json
{
  "startUrls": [
    { "url": "https://www.facebook.com/groups/example1" },
    { "url": "https://www.facebook.com/groups/example2" }
  ],
  "maxPosts": 100,
  "maxComments": 0
}
```

- `maxPosts`: from "Cantidad de Posts por Grupo" form field
- Date filtering: applied at Apify level if the actor supports it; otherwise Claude filters by date after receiving results

---

## Environment & External References

- **Apify Facebook Groups Scraper**: https://apify.com/apify/facebook-groups-scraper
- **Distance calculations**: Claude uses built-in geographic knowledge of Medellín and Valle de Aburrá (barrios, landmarks, metro stations, universities) — no external geocoding API required
- **Valle de Aburrá municipalities**: Medellín, Bello, Itagüí, Envigado, Sabaneta, La Estrella, Caldas, Copacabana, Girardota, Barbosa (reference: https://es.wikipedia.org/wiki/Valle_de_Aburr%C3%A1)

## Documentation to Generate

- `docs/APIFY_SETUP.md` — Step-by-step guide covering:
  1. Creating an Apify account
  2. Navigating to the Facebook Groups Scraper actor
  3. Finding and copying the API key
  4. Adding it to the `.env` file
  5. Testing the key works

---

## Summary of Key Design Decisions

1. **File-based signaling** over WebSocket/SSE — simpler, reliable for Claude terminal integration
2. **Two separate modes** — Mode 1 scrapes only, Mode 2 filters only. User scrapes first, then filters.
3. **AI-powered filtering** via Sonnet 4.6 prompt — fuzzy/semantic for text, strict for price and distance
4. **Geographic knowledge** for distance calculations — strict distance filtering using Claude's built-in knowledge of Medellín/Valle de Aburrá (no external API needed)
5. **Playwright MCP for Google search** — when user doesn't provide Facebook group URLs
6. **User confirmation before scraping** — Claude shows found groups and waits for approval
7. **All progress in terminal** — no real-time status updates in the browser UI
8. **Raw HTML output** — basic table, opens automatically in browser
