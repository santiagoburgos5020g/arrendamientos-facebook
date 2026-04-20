---
name: rental-search-valle-aburra
description: Build and operate a Next.js rental property search app for Valle de Aburrá that scrapes Facebook groups via Apify and filters results with AI. Triggers on rental search, arriendos, Facebook scraping, Apify filtering tasks.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
  - WebFetch
  - mcp__chrome-devtools__*
---

# Rental Search Valle de Aburrá

Build and operate a Next.js application for searching rental properties (arriendos) in Valle de Aburrá, Colombia. The app scrapes Facebook groups via Apify and filters results using a two-pass AI pipeline: Sonnet 4.6 for initial filtering, then Opus 4.6 for validation and false-positive removal. The Next.js app is a form UI only — all processing runs through this Claude Code terminal.

## Workflow Overview

The app has **two modes**:

- **Mode 1 (Apify Scraping)**: User fills filters, clicks "Buscar" → Claude reads form data via file signal → scrapes Facebook groups via Apify → saves raw JSON
- **Mode 2 (JSON Filtering)**: User selects existing raw JSON files, fills filters, clicks "Filtrar JSON" → Claude reads form data → Sonnet 4.6 filters posts → Opus 4.6 validates and removes false positives → generates HTML results table

---

## Step 1 — Project Setup

1. Initialize a Next.js app (App Router) with TypeScript and Tailwind CSS in the current project directory if not already set up
2. Ensure the following structure exists:

```
project-root/
├── .env                              # APIFY_API_KEY
├── .env.example                      # Template with placeholder values
├── .gitignore                        # .env, search-request.json, stop-request.json, node_modules
├── results/                          # Raw JSON + filtered HTML outputs
├── docs/
│   └── APIFY_SETUP.md               # Step-by-step Apify API key guide
├── src/app/
│   ├── page.tsx                      # Main form UI
│   ├── layout.tsx                    # Root layout
│   └── api/
│       ├── search/route.ts           # POST: writes search-request.json
│       ├── stop/route.ts             # POST: writes stop-request.json
│       └── json-files/route.ts       # GET: lists *-raw.json files from results/
├── package.json
├── tailwind.config.ts
└── next.config.ts
```

3. Create `docs/APIFY_SETUP.md` with step-by-step instructions:
   - Creating an Apify account
   - Navigating to the Facebook Groups Scraper actor
   - Finding and copying the API key
   - Adding it to the `.env` file
   - Testing the key works

4. Create `.env.example`:
```
APIFY_API_KEY=your_apify_api_key_here
```

5. Before starting any operation, verify `.env` exists and contains `APIFY_API_KEY`. Warn the user if missing.

---

## Step 2 — Next.js Form UI (Spanish Only)

Build `src/app/page.tsx` with the following form. All labels, text, and placeholders in Spanish.

### Fuente de Datos (fieldset, light blue background)
- Checkbox: **"Buscar sobre archivos JSON existentes (sin llamar a Apify)"**
  - Unchecked (default) = Mode 1
  - Checked = Mode 2

### JSON File Selector (Mode 2 only — show when checkbox is checked)
- Label: "Selecciona uno o más archivos JSON (Ctrl+clic para seleccionar varios):"
- `<select multiple>` populated via `GET /api/json-files`
- Lists `*-raw.json` files from `results/`

### URLs de Grupos de Facebook (Mode 1 only — hide when checkbox is checked)
- Fieldset with legend "URLs de Grupos de Facebook"
- Label: "Ingresa las URLs de grupos públicos (una por línea). Si se deja vacío, se buscarán grupos en Google."
- `<textarea>` with placeholder example URLs

### Tipo de Propiedad (fieldset)
- Inline checkboxes: Apartamentos, Apartaestudios, Habitaciones

### Filtros de Búsqueda (fieldset)
- **Ubicación** (text input): placeholder "cerca de medellín"
  - Locations within Valle de Aburrá: Medellín, Bello, Itagüí, Envigado, Sabaneta, La Estrella, Caldas, Copacabana, Girardota, Barbosa, and their barrios
- **Distancia máxima desde la ubicación** (dropdown):
  - Options: Sin límite de distancia (default), 500 metros, 1 km, 2 km, 5 km, 10 km, 20 km
- **Presupuesto Máximo (COP)** (number input): placeholder "1500000"

### Servicios y Amenidades (fieldset)
- Inline checkboxes: Incluye baño privado, Incluye baño, Incluir servicio de lavandería, Incluir servicios públicos

### Opciones de Búsqueda (fieldset)
- **Fecha de Publicación** (dropdown): Cualquier fecha (default), Últimas 24 horas, Hace 1 día, Hace 2 días, Hace 3 días, Hace 4 días, Hace 5 días, Hace 6 días, Hace 1 semana, Hace 2 semanas, Hace 3 semanas, Hace 1 mes, Hace 2 meses
- **Número de Resultados** (number input, default 10)
- **Cantidad de Posts por Grupo** (number input, default 100) — Mode 1 only, hide when checkbox checked

### Buttons
- **Buscar** (Mode 1) / **Filtrar JSON** (Mode 2): green button, text toggles with mode
- **Detener Búsqueda**: gray button, always visible

---

## Step 3 — API Routes

### `POST /api/search`
Serialize all form data into `search-request.json` at project root:

```json
{
  "mode": "apify | json_filter",
  "timestamp": "2026-04-19T17:44:17",
  "facebookGroupUrls": ["..."],
  "selectedJsonFiles": ["..."],
  "filters": {
    "tipoPropiedad": { "apartamentos": true, "apartaestudios": false, "habitaciones": true },
    "ubicacion": "belén",
    "distanciaMaxima": "500m",
    "presupuestoMaximo": 1500000,
    "servicios": { "banoPrivado": false, "bano": true, "lavanderia": false, "serviciosPublicos": true },
    "fechaPublicacion": "cualquier_fecha",
    "numeroResultados": 10,
    "cantidadPostsPorGrupo": 100
  }
}
```

### `POST /api/stop`
Write `stop-request.json` to project root:
```json
{ "action": "stop", "timestamp": "2026-04-19T17:50:00" }
```

### `GET /api/json-files`
Read `results/` directory, return `{ "files": ["2026-04-19-17-44-17-raw.json", ...] }` listing only `*-raw.json` files.

---

## Step 4 — File-Based Signaling

Communication between the Next.js app and Claude uses temporary JSON files:

1. **search-request.json**: Written by Next.js on form submit. Claude polls for this file, reads it, processes the request, then deletes it.
2. **stop-request.json**: Written by Next.js on "Detener Búsqueda" click. Claude detects it during processing, cancels the operation, and deletes the file.

---

## Step 5 — Mode 1: Live Apify Scraping

When Claude detects `search-request.json` with `"mode": "apify"`:

1. Read and delete `search-request.json`
2. Check if `facebookGroupUrls` has URLs:
   - **If yes**: use those directly
   - **If no (empty array)**:
     a. Use Playwright MCP to open Google
     b. Search: `"grupos facebook arriendos {tipoPropiedad} {ubicacion} valle de aburrá"`
     c. Scrape Facebook group links from results
     d. Collect up to N groups (N = `numeroResultados`, default 10)
     e. Present found groups in the terminal to the user:
        ```
        Grupos de Facebook encontrados:
        1. [Group Name] - https://facebook.com/groups/...
        2. [Group Name] - https://facebook.com/groups/...
        ¿Desea proceder con estos grupos? (sí/no/editar)
        ```
     f. Wait for user confirmation before proceeding
3. Call Apify Facebook Groups Scraper:
   - Actor: `apify/facebook-groups-scraper`
   - Run: `POST https://api.apify.com/v2/acts/apify~facebook-groups-scraper/runs?token={APIFY_API_KEY}`
   - Input: `{ "startUrls": [{"url": "..."}], "maxPosts": {cantidadPostsPorGrupo} }`
   - Apply date filter at scraper level if supported
4. Poll run status until complete (check for `stop-request.json` during polling)
5. Download dataset items from completed run
6. Save all posts to `results/{YYYY-MM-DD-HH-mm-ss}-raw.json` (local time, Colombia UTC-5)
7. Report completion in the terminal

---

## Step 6 — Mode 2: Filter Existing JSON (Two-Pass AI Pipeline)

When Claude detects `search-request.json` with `"mode": "json_filter"`:

1. Read and delete `search-request.json`
2. Load selected raw JSON files from `results/` folder
3. Merge post arrays from all selected files, removing exact duplicates by post URL/ID

### Pass 1 — Sonnet 4.6 Initial Filtering
4. Construct an AI filtering prompt for **Sonnet 4.6** with:
   - The merged post data (in batches if needed)
   - All user-specified filters
   - Clear instructions for matching strategy (see Step 7)
   - Ask Sonnet to return candidate posts as structured JSON with: post index, extracted price, extracted phone, short description, detected location, and match reasoning
5. Process with Sonnet 4.6 to get candidate list

### Pass 2 — Opus 4.6 Validation (False Positive Removal)
6. Send the candidate list from Pass 1 to **Opus 4.6** for strict validation:
   - Provide the original filter criteria
   - For each candidate, Opus must verify:
     a. **Location relevance**: Does the post's location actually match the user's ubicación? (e.g., "Belén" is NOT "Universidad de Antioquia" — different neighborhoods ~8km apart)
     b. **Property type**: Is it genuinely offering the requested property type? (not a full apartment listing that just mentions "habitación principal con baño privado")
     c. **Price accuracy**: Is the extracted price the actual rent for the unit, not an unrelated number (phone, address, admin fee)?
     d. **Offer vs. demand**: Is the post OFFERING a rental, not SEEKING one?
   - Opus returns only validated posts, flagging and removing false positives with explanation
7. Generate `results/{YYYY-MM-DD-HH-mm-ss}-results.html` (local time) from validated results only
8. Open the HTML file automatically in the browser via Playwright MCP

---

## Step 7 — Filtering Logic (Critical Rules)

### Fuzzy/Semantic Matching (AI prompt-based)
Apply to ALL fields except price and distance:

- **Tipo de Propiedad**: "apto" = "apartamento", "aparta" = "apartaestudio", "cuarto"/"pieza"/"room" = "habitación"
- **Ubicación**: Accent-insensitive, partial matches, aliases. "belen" = "belén" = "barrio Belén" = "cerca de Belén"
- **Servicios y Amenidades**: Each enabled checkbox is a **mandatory inclusion requirement** — the post MUST mention something semantically related to that service somewhere in the text or OCR. Fuzzy/semantic equivalences:
    - "Incluye baño privado" ✓ → "baño propio", "baño privado", "baño independiente", "baño personal", "baño dentro de la habitación"
    - "Incluye baño" ✓ → "baño", "ducha", "sanitario" (any bathroom mention)
    - "Incluir servicio de lavandería" ✓ → "lavandería", "lavadora", "lavado de ropa", "servicio de lavado"
    - "Incluir servicios públicos" ✓ → "servicios incluidos", "servicios públicos incluidos", "agua y luz incluidos", "libre de servicios"
    - If a checkbox is NOT checked, that service is not required (posts without it are still valid)
- **Fecha de Publicación**: AI interprets post dates relative to current date. Applied at both Apify scraper level (if supported) AND during AI filtering.

### Strict Matching
- **Presupuesto Máximo (COP)**: When the budget filter is set (presupuestoMaximo is not null):
  - Every result **MUST** have a clearly extractable price. Posts with NO identifiable price are **ALWAYS EXCLUDED** — no exceptions, no "Consultar" entries.
  - The extracted post price must be strictly ≤ presupuestoMaximo. 
  - Price extraction uses fuzzy/semantic matching: "750mil" = "$750.000" = "750,000" = "setecientos cincuenta mil pesos"
  - If a post mentions multiple prices (e.g., "baño privado $700.000 / baño compartido $650.000"), extract the price corresponding to the filtered property type
  - When the budget filter is NOT set (null): posts without price ARE allowed in results.
- **Distancia máxima**: Calculated using Claude's built-in geographic knowledge of Medellín and Valle de Aburrá:
  1. Identify the user's reference location (e.g., "Universidad de Antioquia" → Calle 67/Carrera 53)
  2. For each post, identify the mentioned barrio/landmark/location
  3. Use known geographic relationships and approximate distances between barrios, landmarks, metro stations, and universities in Valle de Aburrá to determine if the post's location falls within the maximum distance
  4. Exclude posts where estimated distance > max
  5. Key reference distances (approximate):
     - UdeA to Torres de la Fuente/Faro del Río/Paseo de Sevilla: <200m (directly across)
     - UdeA to Sevilla/Jesús Nazareno/San Germán: <500m
     - UdeA to Estación Metro Hospital: ~300m
     - UdeA to Boston: ~2km
     - UdeA to Robledo: ~3km
     - UdeA to Laureles/Estadio: ~3km
     - UdeA to Belén: ~6km
     - UdeA to El Poblado: ~7km
  6. When uncertain about a distance, err on the side of inclusion and note the uncertainty
- **Número de Resultados**: Hard limit on output count
- **Cantidad de Posts por Grupo**: Passed directly to Apify configuration

### Mandatory Filters
ALL specified filters must be satisfied. A post must match every active filter to be included in results.

---

## Step 8 — HTML Output

Generate a basic raw HTML table (no CSS frameworks, minimal inline styles):

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Resultados de Búsqueda - {datetime}</title>
</head>
<body>
  <h1>Resultados de Búsqueda de Arriendos</h1>
  <p>Fecha: {datetime} | Filtros: {summary}</p>
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
      <!-- one row per matching post -->
      <tr>
        <td><a href="https://wa.me/57{phone}?text={encodeURIComponent('Hola, vi tu publicación, sigue disponible? {post_url}')}" target="_blank">{phone}</a></td>
        <td>{description}</td>
        <td>{cost in COP}</td>
        <td>{group name}</td>
        <td><a href="{url}" target="_blank">Ver publicación</a></td>
      </tr>
    </tbody>
  </table>
</body>
</html>
```

### Phone → WhatsApp Link Rules
- Each phone number in the "Teléfono" column MUST be a clickable WhatsApp link
- Format: `https://wa.me/57{phone_digits_only}?text={encoded_message}`
- The pre-filled message must be: `Hola, vi tu publicación, sigue disponible? {post_url}` (where `{post_url}` is the Facebook post link for that row)
- Strip all non-digit characters from the phone before building the URL (spaces, dots, dashes, emojis)
- If a post has multiple phone numbers, use the first one for the link and show all in the cell
- If no phone is found, show "N/A" (no link)

If no posts match: show empty table with message "No se encontraron resultados que coincidan con los filtros."

Open the file automatically in the browser after generation.

---

## Step 9 — Stop/Cancel

1. User clicks "Detener Búsqueda" → Next.js writes `stop-request.json`
2. Claude detects the file during processing
3. Cancel current operation:
   - Apify running → abort actor run via API
   - AI filtering → stop and discard partial results
4. Delete `stop-request.json`
5. Report cancellation in terminal

---

## Error Handling

- **Missing .env keys**: Check before any operation; warn user with instructions
- **Apify API failure**: Report error in terminal, suggest checking API key
- **No Facebook groups found on Google**: Report and suggest providing URLs manually
- **Empty scraper results**: Report no posts found
- **Invalid/corrupt JSON files**: Report which files failed, continue with valid ones
- **No matching posts after filtering**: Generate HTML with empty table and "No se encontraron resultados" message

---

## Important Notes

- All progress and results are displayed in the Claude terminal — the browser UI shows no status updates
- Datetime format in filenames: `YYYY-MM-DD-HH-mm-ss` in local time (Colombia UTC-5)
- The Next.js app runs on `localhost:3000`
- The UI is Spanish-only, styled with Tailwind CSS matching the design in the screenshots (fieldsets, light blue backgrounds for Fuente de Datos, clean form layout)
- Never store API keys in code — always read from `.env`
- The `search-request.json` and `stop-request.json` files are temporary and must be deleted after processing
