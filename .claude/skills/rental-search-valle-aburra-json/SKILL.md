---
name: rental-search-valle-aburra-json
description: Filter existing raw JSON files from Apify Facebook scraper using multi-pass AI pipeline (Haiku→Sonnet→Opus) for rental property search in Valle de Aburrá. Triggers on search-request.json with mode json_filter.
allowed-tools: Bash Agent Read Write Glob Grep
---

# Rental Search Valle de Aburrá — JSON Filtering

Filter raw Apify Facebook Groups Scraper JSON output using a four-stage pipeline optimized for accuracy on large datasets (999+ posts).

## Startup

1. Check if port 3000 is in use:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null
   ```
2. If not running: start `npm run dev` in background, poll until port responds (max 30s, check every 2s)
3. Open browser: `start http://localhost:3000/`
4. Poll for `search-request.json` at project root

## Signal File Consumption

When `search-request.json` appears with `"mode": "json_filter"`:
1. Read its contents
2. Delete it immediately
3. Extract: `selectedJsonFiles`, `filters` (tipoPropiedad, ubicacion, distanciaMaxima, presupuestoMaximo, servicios, fechaPublicacion, numeroResultados)

## Pipeline

### Stage 1: Node.js Preprocessing

Run the preprocessing script:
```bash
node "${CLAUDE_SKILL_DIR}/scripts/preprocess.js" --files "results/file1-raw.json,results/file2-raw.json" --date-filter "ultima_semana" --output "results/{timestamp}-preprocessed.json"
```

This script:
- Parses and merges all selected JSON files
- Removes duplicates by post URL
- Removes empty posts (no text AND no useful ocrText)
- Applies date filter mechanically using the `time` field
- Strips metadata, keeping ONLY: text, ocrTexts, url, time, groupTitle, userName, index
- Extracts quoted text from Facebook OCR auto-descriptions ("May be an image of text that says '...'")
- Discards pure descriptive OCR with no rental content

Write progress: `{"stage": "preprocessing", "message": "Preprocesando JSON... (eliminando metadatos)", "progress": 5}`
Then: `{"stage": "mechanical_filter", "message": "Filtro mecánico aplicado: {N} de {total} posts restantes", "progress": 10}`

### Stage 2: Haiku Coarse Elimination

Split preprocessed posts into batches of 100. Spawn ALL batches as parallel Agent calls with `model: "haiku"`.

Each Haiku agent prompt:
```
You are a fast binary classifier for rental property posts in Valle de Aburrá, Colombia.

FILTERS:
- Location: {ubicacion or "Valle de Aburrá" if empty}
- Property types accepted: {list of checked tipos}
- Must be OFFERING a rental (not seeking/looking for one)

TASK: For each post below, respond ONLY with the indices of posts to KEEP.
A post should be ELIMINATED only if it is CLEARLY and OBVIOUSLY:
- About a completely different city/region (not Valle de Aburrá / Medellín metro area)
- Seeking/looking for a rental instead of offering one
- A completely wrong property type (e.g., user wants habitación, post is clearly selling a house)
- Not a rental at all (selling furniture, advertising services, etc.)

CRITICAL RULE: When in doubt, KEEP the post. Only eliminate if you are 90%+ confident it is irrelevant.

POSTS:
{JSON array of posts in this batch}

RESPOND with ONLY a JSON array of indices to KEEP. Example: [0, 2, 5, 7, 8]
```

Haiku does NOT receive: price budget, distance limits, services/amenities.

Write progress: `{"stage": "haiku_filtering", "message": "Eliminación rápida con IA... (lote {X}/{Y})", "progress": 10 + (X/Y * 40)}`

After all agents return, merge keep-indices. Check for `stop-request.json`.

Write: `{"stage": "haiku_complete", "message": "Eliminación rápida completada: {N} posts restantes", "progress": 50}`

### Stage 3: Sonnet Semantic Extraction + Filtering

Split surviving posts into batches of 20-25. Spawn ALL batches as parallel Agent calls with `model: "sonnet"`.

Each Sonnet agent prompt:
```
You are a rental property filter and data extractor for Valle de Aburrá, Colombia.

USER FILTERS (ALL must be satisfied — AND logic):
- Tipo de propiedad: {checked tipos}
- Ubicación: "{ubicacion}" (accent-insensitive, partial matches, aliases)
- Distancia máxima: {distanciaMaxima} from "{ubicacion}"
- Presupuesto máximo: {presupuestoMaximo} COP (or "Sin límite" if null)
- Servicios requeridos: {checked servicios}
- Fecha de publicación: {fechaPublicacion}

FUZZY MATCHING RULES:
- Property types: "apto"="apartamento", "aparta"="apartaestudio", "cuarto"/"pieza"/"room"="habitación"
- Location: accent-insensitive, partial matches ("belen"="belén"="barrio Belén")
- Services:
  - "baño privado" → "baño propio", "baño independiente", "baño personal", "baño dentro de la habitación"
  - "baño" → "baño", "ducha", "sanitario"
  - "lavandería" → "lavadora", "lavado de ropa", "servicio de lavado"
  - "servicios públicos" → "servicios incluidos", "agua y luz incluidos", "libre de servicios", "todo incluido"

STRICT RULES:
- Price: MUST be ≤ {presupuestoMaximo} COP. If budget is set, posts WITHOUT extractable price = EXCLUDED.
- Distance: Use geographic knowledge of Medellín/Valle de Aburrá. Reference point: "{ubicacion}". Exclude if distance > {distanciaMaxima}.
- Price extraction: "260 mil"=260000, "$700.000"=700000, "750,000"=750000, "820"=820000, "1.150.000"=1150000

TASK: For matching posts, extract:
- price (number in COP)
- phone (string, digits only)
- description (1-2 sentence summary in Spanish)
- location (barrio/sector)
- propertyType ("apartamento"|"apartaestudio"|"habitación")
- services (array)
- matchReasoning (brief why this matches)

POSTS:
{JSON array of posts}

RESPOND with ONLY a JSON array of matching posts:
[{"index": 5, "price": 750000, "phone": "3015819079", "description": "...", "location": "Boston", "propertyType": "apartaestudio", "services": ["servicios públicos"], "matchReasoning": "..."}]
If NO posts match, respond: []
```

Write progress: `{"stage": "sonnet_filtering", "message": "Extracción y filtrado semántico... (lote {X}/{Y})", "progress": 50 + (X/Y * 30)}`

After all agents return, merge results. Check for `stop-request.json`.

Write: `{"stage": "sonnet_complete", "message": "Extracción completada: {N} candidatos encontrados", "progress": 80}`

### Stage 4: Opus Validation

Process all Sonnet candidates directly (this is the main Claude instance, NOT a spawned agent). If >50 candidates, split into 2 sequential passes.

For each candidate, include the original preprocessed post text for verification.

Validate:
- **Location relevance**: Does detected location actually match ubicación within distanciaMaxima?
- **Property type**: Is it genuinely the detected type? (not a full apartment mentioning "habitación principal")
- **Price accuracy**: Is extracted price the actual monthly rent? (not phone number, deposit, admin fee)
- **Offer vs demand**: Is post OFFERING, not seeking?
- **Distance**: Using detailed geographic knowledge of Valle de Aburrá
- **Services**: Are claimed services actually mentioned in the source text?

Correct any extraction errors. Remove false positives.

After validation, apply `numeroResultados` as hard cap. Sort by:
1. Data completeness (price + phone + location all present)
2. Lower price (if budget was set)
3. Recency (newer first)

Write: `{"stage": "opus_validation", "message": "Validación final... ({N} candidatos)", "progress": 85}`

## HTML Output

Generate: `results/{YYYY-MM-DD-HH-mm-ss}-results.html`

Table columns: Teléfono | Descripción | Costo | Grupo | Enlace

**WhatsApp links**:
- Format: `https://wa.me/57{digits}?text=Hola%2C%20vi%20tu%20publicaci%C3%B3n%2C%20sigue%20disponible%3F%20{post_url}`
- Strip non-digit chars from phone
- 10-digit mobile starting with 3: use as-is
- 7-digit landline: prepend 604
- Multiple phones: first gets link, all shown separated by " / "
- No phone: show "N/A"

**Price display**: Format as "$750.000" (period as thousands separator). Null → "No especificado"

**Empty results**: Show "No se encontraron resultados que coincidan con los filtros aplicados."

Auto-open in browser: `start "results/{timestamp}-results.html"`

## Signal File Output

Write `search-complete.json`:
```json
{
  "status": "complete",
  "timestamp": "2026-04-19T18:30:00-05:00",
  "summary": {
    "totalRawPosts": 999,
    "afterPreprocessing": 850,
    "afterHaiku": 320,
    "afterSonnet": 45,
    "afterOpus": 12,
    "resultsFile": "results/2026-04-19-18-30-00-results.html"
  }
}
```

After writing, delete `search-progress.json`.

## Stop Detection

Check for `stop-request.json` between phases:
- After preprocessing
- After all Haiku agents return
- After all Sonnet agents return
- Before Opus

When stopped:
- If after Sonnet: run quick Opus validation on available candidates, generate HTML
- If after Haiku but before Sonnet: report "Detenido. No hay resultados parciales disponibles."
- Write `search-complete.json` with `"status": "stopped"`
- Delete `stop-request.json`

## Error Handling

Write error to `search-progress.json`:
```json
{"stage": "error", "message": "Error: {description}", "progress": 0, "error": {"code": "FILE_READ_ERROR", "detail": "..."}}
```

Error codes: `FILE_READ_ERROR`, `INVALID_JSON`, `NO_POSTS_REMAINING`, `AGENT_FAILURE`, `PREPROCESS_FAILED`

Then write `search-complete.json` with `"status": "error"`.

If individual agents fail within a batch: log, continue with successful agents. Only full error if ALL agents in a stage fail.

## Geographic Reference Distances (from Universidad de Antioquia)

- Torres de la Fuente/Faro del Río/Paseo de Sevilla: <200m
- Sevilla/Jesús Nazareno/San Germán: <500m
- Estación Metro Hospital: ~300m
- Boston: ~2km
- Robledo: ~3km
- Laureles/Estadio: ~3km
- Belén: ~6km
- El Poblado: ~7km
- Bello centro: ~7km
- Itagüí centro: ~8km
- Envigado centro: ~10km
- Sabaneta centro: ~14km

When uncertain, err on side of inclusion.

## Datetime Convention

All filenames: local Colombia time (UTC-5), format `YYYY-MM-DD-HH-mm-ss`
