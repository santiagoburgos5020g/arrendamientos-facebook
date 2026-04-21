# Rental Search Valle de Aburrá — JSON Filtering Skill (Opus-Reviewed)

## Overview

This skill handles Mode 2 (JSON Filtering) of the rental search application. When the user selects existing raw JSON files in the UI, applies filter criteria, and clicks "Filtrar JSON", this skill picks up the `search-request.json` signal file and processes the posts through a multi-pass AI pipeline optimized for accuracy and speed on large datasets (999+ posts, 100K+ lines).

**Relationship to existing skill**: This skill REPLACES the JSON filtering logic in `rental-search-valle-aburra`. The existing skill should handle Mode 1 (Apify scraping) only. When `search-request.json` has `mode: "json_filter"`, this skill handles it.

## Purpose

Filter raw Apify Facebook Groups Scraper JSON output using a four-stage pipeline:
1. **Node.js mechanical preprocessing** — deterministic, free, instant
2. **Haiku coarse elimination** — parallel, cheap, fast — removes obvious mismatches
3. **Sonnet semantic extraction + filtering** — parallel, accurate — extracts data and applies all filters
4. **Opus validation** — final pass — removes false positives with geographic/semantic precision

## Trigger Conditions

- Auto-invoked when `search-request.json` appears at project root with `mode: "json_filter"`
- User-invocable via `/rental-search-valle-aburra-json`
- Frontmatter: `disable-model-invocation: false` (auto-invocation enabled)

## Startup Workflow

1. Check if port 3000 is in use:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null
   ```
   If returns 200 or any response → server is running.
   Alternatively on Windows: `netstat -ano | grep :3000` or `powershell -c "Test-NetConnection -ComputerName localhost -Port 3000"`

2. If not running: start `npm run dev` in background via Bash with `run_in_background: true`, then poll until port 3000 responds (max 30 seconds, check every 2 seconds).

3. Open browser to `http://localhost:3000/`:
   ```bash
   start http://localhost:3000/
   ```

4. Poll for `search-request.json` signal file at project root. When found:
   - Read its contents
   - Delete the file immediately (prevents re-processing)
   - Validate `mode === "json_filter"`
   - Extract all filter criteria and selected file list

## Signal File: search-request.json

Expected structure (written by the UI):
```json
{
  "mode": "json_filter",
  "timestamp": "2026-04-19T17:44:17Z",
  "facebookGroupUrls": [],
  "selectedJsonFiles": ["2026-04-19-17-44-17-raw.json"],
  "filters": {
    "tipoPropiedad": {
      "apartamentos": true,
      "apartaestudios": false,
      "habitaciones": true
    },
    "ubicacion": "belén",
    "distanciaMaxima": "2km",
    "presupuestoMaximo": 800000,
    "servicios": {
      "banoPrivado": false,
      "bano": true,
      "lavanderia": false,
      "serviciosPublicos": true
    },
    "fechaPublicacion": "ultima_semana",
    "numeroResultados": 15,
    "cantidadPostsPorGrupo": 100
  }
}
```

## Pipeline Architecture

### Stage 1: Node.js Preprocessing (`scripts/preprocess.js`)

A standalone script inside the skill directory. Run via:
```bash
node "${CLAUDE_SKILL_DIR}/scripts/preprocess.js" --files "results/file1-raw.json,results/file2-raw.json" --date-filter "ultima_semana" --output "results/{timestamp}-preprocessed.json"
```

**CLI Arguments**:
- `--files` — Comma-separated list of raw JSON file paths (relative to project root)
- `--date-filter` — Optional. One of: `ultimas_24h`, `ultimos_3_dias`, `ultima_semana`, `ultimas_2_semanas`, `ultimo_mes`, `ultimos_2_meses`, `cualquier_fecha`. If omitted or `cualquier_fecha`, no date filtering.
- `--output` — Output file path for preprocessed JSON

**Processing Steps**:
1. Parse all selected JSON files (each is an array of post objects)
2. Merge into single array
3. Remove duplicates by `url` field (keep first occurrence)
4. Remove empty posts: no `text` AND no `ocrText` in any attachment (or all `ocrText` are only Facebook auto-descriptions like "May be an image of..." with no rental info)
5. Apply date filter mechanically: compare each post's `time` field (ISO 8601) against cutoff date calculated from current date and `fechaPublicacion` value
6. Strip metadata — output ONLY these fields per post:
   - `text` — the post body
   - `ocrTexts` — array of all `ocrText` values from `attachments[]` (excluding pure Facebook auto-descriptions that contain no rental-relevant info like "May be an image of bedroom and text that says '...'" — keep the quoted text portion)
   - `url` — post permalink
   - `time` — ISO timestamp
   - `groupTitle` — Facebook group name
   - `userName` — from `user.name`
   - `index` — sequential index (0-based) for tracking through pipeline

**Output format** (`results/{YYYY-MM-DD-HH-mm-ss}-preprocessed.json`):
```json
{
  "metadata": {
    "totalRawPosts": 999,
    "afterDedup": 950,
    "afterEmptyRemoval": 920,
    "afterDateFilter": 850,
    "preprocessedAt": "2026-04-19T18:00:00-05:00"
  },
  "posts": [
    {
      "index": 0,
      "text": "Se renta Apartaestudio, ed. Estambul, Boston info wsp 3015819079",
      "ocrTexts": ["Se alquila apartaestudio en Boston con servicios incluidos, valor 820 info a 301 3015819079 o 300 7018460"],
      "url": "https://www.facebook.com/groups/.../permalink/123/",
      "time": "2026-04-19T16:28:12.000Z",
      "groupTitle": "Alquiler de habitaciones en Medellin",
      "userName": "Juan Camilo Cifuentes Villa"
    }
  ]
}
```

**OCR Text Handling**:
- Facebook generates auto-descriptions like: `"May be an image of bedroom and text that says 'SE ALQUILA HABITACIÓN...'"` 
- The script should extract the quoted text after "text that says" when present
- Pure descriptive OCR with no rental content (e.g., "May be an image of sliding door and indoors") should be discarded
- OCR text that IS actual text content should be kept as-is

**Expected reduction**: ~80% file size reduction (100K lines → ~5-10K lines of useful content)

**Error handling**: If a file can't be parsed, log warning and continue with remaining files. If ALL files fail, exit with error code 1 and error message to stderr.

### Stage 2: Haiku Coarse Elimination (Parallel Agents)

**Batch size**: 100 posts per agent
**Parallelism**: All batches spawned simultaneously via the Agent tool
**Model**: `haiku`

**Mechanism**: Use the `Agent` tool with `model: "haiku"` parameter. Spawn all batches in a single message (parallel tool calls).

**Each Haiku agent receives this prompt**:
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

RESPOND with a JSON array of indices to KEEP. Example: [0, 2, 5, 7, 8]
```

**Output per agent**: JSON array of indices (from the batch) to keep.

**Result collection**: After all Haiku agents complete, merge all "keep" indices. Map back to the global preprocessed post array.

**Expected elimination**: ~60-70% of posts removed.

### Stage 3: Sonnet Semantic Extraction + Filtering (Parallel Agents)

**Batch size**: 20-25 posts per agent
**Parallelism**: All batches spawned simultaneously via the Agent tool
**Model**: `sonnet`

**Each Sonnet agent receives this prompt**:
```
You are a rental property filter and data extractor for Valle de Aburrá, Colombia.

USER FILTERS (ALL must be satisfied — AND logic):
- Tipo de propiedad: {checked tipos, with fuzzy matching rules}
- Ubicación: "{ubicacion}" (accent-insensitive, partial matches, aliases)
- Distancia máxima: {distanciaMaxima} from "{ubicacion}"
- Presupuesto máximo: {presupuestoMaximo} COP {or "Sin límite" if null}
- Servicios requeridos: {list of checked servicios with synonym rules}
- Fecha de publicación: {fechaPublicacion} (already pre-filtered mechanically, but verify)

FUZZY MATCHING RULES:
- Property types: "apto"="apartamento", "aparta"="apartaestudio", "cuarto"/"pieza"/"room"="habitación"
- Location: accent-insensitive, partial matches ("belen"="belén"="barrio Belén"="cerca de Belén")
- Services:
  - "baño privado" → "baño propio", "baño independiente", "baño personal", "baño dentro de la habitación"
  - "baño" → "baño", "ducha", "sanitario"
  - "lavandería" → "lavadora", "lavado de ropa", "servicio de lavado"
  - "servicios públicos" → "servicios incluidos", "agua y luz incluidos", "libre de servicios"

STRICT RULES:
- Price: MUST be ≤ {presupuestoMaximo} COP. If budget is set, posts WITHOUT an extractable price are EXCLUDED.
- Distance: Use your geographic knowledge of Medellín/Valle de Aburrá. The reference point is "{ubicacion}". Exclude posts where estimated distance exceeds {distanciaMaxima}.
- Price extraction: Look carefully in ALL text fields. "260 mil"=260000, "$700.000"=700000, "650"=650000 (context-dependent), "1.150.000"=1150000, "820"=820000.

TASK: For each post, determine if it matches ALL filters. For matching posts, extract:
1. price (number in COP, null only if presupuestoMaximo is not set)
2. phone (string, all digits found — may be multiple separated by " / ")
3. description (1-2 sentence summary in Spanish)
4. location (barrio/sector detected)
5. propertyType ("apartamento" | "apartaestudio" | "habitación")
6. services (array of detected services)
7. matchReasoning (brief explanation of why this matches)

POSTS:
{JSON array of posts in this batch}

RESPOND with a JSON array of matching posts:
[
  {
    "index": 5,
    "price": 750000,
    "phone": "3015819079",
    "description": "Apartaestudio amoblado en Boston, servicios incluidos",
    "location": "Boston",
    "propertyType": "apartaestudio",
    "services": ["servicios públicos"],
    "matchReasoning": "Matches: apartaestudio in Boston (~1km from UdeA), price 820K ≤ budget, services included"
  }
]

If NO posts match, respond with an empty array: []
```

**Output per agent**: JSON array of matching post objects with extracted data.

**Result collection**: After all Sonnet agents complete, merge all result arrays into one candidate list. Remove any duplicates by `index` (shouldn't happen, but defensive).

### Stage 4: Opus Validation (1-2 passes)

**Batch size**: All candidates from Sonnet (typically ~30-80 posts). If >50 candidates, split into 2 batches.
**Model**: Opus 4.6 (the main Claude instance itself — NOT spawned as a separate agent)

**Task**: False positive removal with strict validation.

**Opus receives all Sonnet candidates plus the original preprocessed post text** for each candidate (so Opus can verify extractions against source).

**Opus validates each candidate**:
- **Location relevance**: Does the detected location actually match the user's ubicación within the specified distance? Use detailed geographic knowledge. Example: "Belén" is ~6km from UdeA — if max distance is 2km, this fails.
- **Property type accuracy**: Is the post genuinely offering the detected property type? A post about a full apartment that mentions "habitación principal" as a feature is NOT a "habitación" listing.
- **Price verification**: Is the extracted price the actual monthly rent? Not a phone number, not an admin fee, not a deposit, not a property value.
- **Offer vs demand (final check)**: Is the post OFFERING a rental, not seeking a roommate or looking for a place?
- **Distance verification**: Using known distances between barrios/landmarks in Valle de Aburrá.
- **Service verification**: Are claimed services actually mentioned in the post?

**Opus can correct extracted data**: If price, phone, or location was slightly wrong in Sonnet's extraction, Opus corrects it.

**Output**: Final array of validated posts with corrected data. Posts that fail validation are removed with a brief reason logged.

**Result limiting**: After Opus validation, if results exceed `numeroResultados`, sort by relevance (best match reasoning + most complete data) and take only the top N.

## Progress Indicator

The skill writes/updates `search-progress.json` at the project root. The UI polls this file.

**Lifecycle**:
- Created at the start of processing
- Updated at each stage transition and within-stage progress
- Deleted after `search-complete.json` is written (cleanup)

**Structure**:
```json
{
  "stage": "haiku_filtering",
  "message": "Eliminación rápida con IA... (lote 3/10)",
  "progress": 30,
  "postsRemaining": 850,
  "startedAt": "2026-04-19T18:00:00-05:00"
}
```

**Stage progression**:

| Stage | Message | Progress |
|-------|---------|----------|
| `preprocessing` | "Preprocesando JSON... (eliminando metadatos)" | 5 |
| `mechanical_filter` | "Filtro mecánico aplicado: {N} de {total} posts restantes" | 10 |
| `haiku_filtering` | "Eliminación rápida con IA... (lote {X}/{Y})" | 10 + (X/Y * 40) |
| `haiku_complete` | "Eliminación rápida completada: {N} posts restantes" | 50 |
| `sonnet_filtering` | "Extracción y filtrado semántico... (lote {X}/{Y})" | 50 + (X/Y * 30) |
| `sonnet_complete` | "Extracción completada: {N} candidatos encontrados" | 80 |
| `opus_validation` | "Validación final... ({N} candidatos)" | 85 |
| `generating_html` | "Generando resultados HTML..." | 95 |
| `completed` | "Completado: {N} resultados encontrados" | 100 |
| `error` | "Error: {description}" | current progress at time of error |

**Error state structure**:
```json
{
  "stage": "error",
  "message": "Error: no se pudo leer el archivo JSON",
  "progress": 5,
  "postsRemaining": 0,
  "error": {
    "code": "FILE_READ_ERROR",
    "detail": "File results/2026-04-19-raw.json not found"
  }
}
```

**Error codes**:
- `FILE_READ_ERROR` — Raw JSON file can't be read or doesn't exist
- `INVALID_JSON` — File is not valid JSON
- `NO_POSTS_REMAINING` — All posts eliminated (not truly an error, but reported)
- `AGENT_FAILURE` — One or more AI agents failed to respond
- `PREPROCESS_FAILED` — Preprocessing script exited with error

## Stop Detection

Check for `stop-request.json` at these points:
- After preprocessing completes
- After ALL Haiku agents return (not between individual agents, since they run in parallel)
- After ALL Sonnet agents return
- Before Opus validation

**Behavior when stopped**:
1. Set progress stage to `"stopped"`
2. If stopped after Sonnet: run quick Opus validation on available Sonnet candidates, then generate HTML
3. If stopped after Haiku but before Sonnet: report "Detenido. No hay resultados parciales disponibles (filtrado semántico no completado)."
4. If stopped during preprocessing: report "Detenido antes de iniciar filtrado."
5. Write `search-complete.json` with `"status": "stopped"` and whatever partial summary is available

## Output

### HTML Results File

Generated at: `results/{YYYY-MM-DD-HH-mm-ss}-results.html`

Same format as existing `rental-search-valle-aburra` skill:

| Column | Content |
|--------|---------|
| Teléfono | WhatsApp link (clickable) |
| Descripción | Short description of the listing |
| Costo | Price formatted in COP (e.g., "$750.000") |
| Grupo | Facebook group name |
| Enlace | Link to original Facebook post |

**WhatsApp link format**:
```
https://wa.me/57{digits}?text=Hola%2C%20vi%20tu%20publicaci%C3%B3n%2C%20sigue%20disponible%3F%20{post_url}
```

**Phone number rules**:
- Strip all non-digit characters
- Colombian mobile numbers are 10 digits starting with 3 (e.g., 3015819079)
- If number is 10 digits starting with 3: use as-is after 57 country code
- If number is 7 digits (local landline): prepend 604 (Medellín area code) → becomes `57604XXXXXXX`
- If multiple phones found: first one gets the WhatsApp link, all shown in cell separated by " / "
- If no phone: show "N/A" (plain text, no link)

**Price display**:
- Format as Colombian currency: "$750.000", "$1.200.000"
- Use period as thousands separator
- If price is null (only possible when presupuestoMaximo is not set): show "No especificado"

**Auto-open**: After generating the HTML file, open it in the default browser:
```bash
start "results/{timestamp}-results.html"
```

**Empty results**: If Opus returns 0 validated posts, generate HTML with a single row spanning all columns: "No se encontraron resultados que coincidan con los filtros aplicados."

### Signal Files

**`search-complete.json`** — written when pipeline finishes (success, stopped, or error):
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

For stopped state:
```json
{
  "status": "stopped",
  "timestamp": "2026-04-19T18:25:00-05:00",
  "summary": {
    "totalRawPosts": 999,
    "stoppedAtStage": "sonnet_filtering",
    "partialResults": 8,
    "resultsFile": "results/2026-04-19-18-25-00-results.html"
  }
}
```

For error state:
```json
{
  "status": "error",
  "timestamp": "2026-04-19T18:05:00-05:00",
  "error": {
    "code": "FILE_READ_ERROR",
    "message": "Could not read results/nonexistent-raw.json"
  }
}
```

**Cleanup**: After writing `search-complete.json`, delete `search-progress.json`.

## Filtering Rules

### Fuzzy/Semantic Matching (applied by Sonnet)

- **Tipo de Propiedad**:
  - "apto", "apartamento", "apar" → apartamento
  - "aparta", "apartaestudio", "estudio" → apartaestudio
  - "cuarto", "pieza", "room", "habitación", "hab" → habitación
  - Multiple types checked = OR logic (post matches if it's any of the selected types)

- **Ubicación**: Accent-insensitive, partial matches, neighborhood aliases
  - "belen" = "belén" = "barrio Belén" = "cerca de Belén" = "Belén Rincón" = "Belén La Palma"
  - "laureles" = "Laureles" = "barrio Laureles" = "cerca a Laureles"
  - Empty ubicación = any location in Valle de Aburrá is valid

- **Servicios y Amenidades** (each checked = mandatory requirement):
  - "Incluye baño privado" → "baño propio", "baño privado", "baño independiente", "baño personal", "baño dentro de la habitación", "baño interno"
  - "Incluye baño" → "baño", "ducha", "sanitario", "WC"
  - "Incluir servicio de lavandería" → "lavandería", "lavadora", "lavado de ropa", "servicio de lavado", "zona de lavado"
  - "Incluir servicios públicos" → "servicios incluidos", "servicios públicos incluidos", "agua y luz incluidos", "libre de servicios", "todo incluido", "all included"
  - Unchecked services = NOT required (post may or may not have them)

### Strict Matching

- **Presupuesto Máximo (COP)**:
  - When set (not null): extracted price MUST be ≤ this value
  - Posts WITHOUT an extractable price = ALWAYS EXCLUDED when budget is set
  - When NOT set (null): posts without price ARE allowed through
  - Price extraction patterns: "750mil"=750000, "$750.000"=750000, "750,000"=750000, "setecientos cincuenta"=750000, "820"=820000 (contextual — rental prices in Colombia are typically 200K-5M)
  - "servicios incluidos" or "todo incluido" after a price → price includes utilities
  - "sin servicios" or "+ servicios" → additional cost for utilities (still compare base price to budget)

- **Distancia máxima**:
  - Uses Claude's geographic knowledge of Medellín / Valle de Aburrá
  - Reference point: the user's `ubicacion` field
  - Key reference distances (approximate from Universidad de Antioquia):
    - Torres de la Fuente/Faro del Río/Paseo de Sevilla: <200m
    - Sevilla/Jesús Nazareno/San Germán: <500m
    - Estación Metro Hospital: ~300m
    - Boston: ~2km
    - Robledo: ~3km
    - Laureles/Estadio: ~3km
    - Belén: ~6km
    - El Poblado: ~7km
    - Envigado centro: ~10km
    - Sabaneta centro: ~14km
    - Itagüí centro: ~8km
    - Bello centro: ~7km
  - "sin_limite" = no distance filter applied
  - When uncertain about exact distance, err on side of inclusion with note

- **Número de resultados**: Hard cap applied AFTER Opus validation. If more results than requested, sort by:
  1. Completeness of data (price + phone + location all present)
  2. Price (lower is better, if budget was set)
  3. Recency (newer posts first)

## Edge Cases

- **Empty text + empty/useless OCR**: Eliminated during preprocessing
- **OCR with only Facebook auto-descriptions**: "May be an image of bedroom and indoors" with no text content → eliminate in preprocessing
- **OCR with embedded text**: "May be an image of text that says 'SE ALQUILA...'" → extract the quoted portion
- **Multiple prices in one post**: Extract price most likely to be the monthly rent for the filtered property type (not deposit, not admin fee)
- **Multiple phone numbers**: Use first for WhatsApp link, show all in cell separated by " / "
- **No results after all filtering**: Generate HTML with empty results message
- **Agent failure mid-pipeline**: Log error in progress, continue with results from successful agents. Only report full error if ALL agents in a stage fail.
- **All posts eliminated by Haiku**: Skip Sonnet/Opus, write progress as completed with 0 results, generate empty HTML
- **All posts eliminated by Sonnet**: Skip Opus, same as above
- **Concurrent requests**: If a new `search-request.json` appears while processing, ignore it (the current pipeline takes priority). The UI should show "processing" state and prevent re-submission.
- **Very large files (>2000 posts)**: The preprocessing script handles this fine. Haiku batches scale linearly (20 batches of 100). Sonnet may have more batches but still parallel.
- **Posts without time field**: Skip date filter for those posts (keep them)
- **Timeout**: If any individual agent doesn't respond within 120 seconds, consider it failed and proceed without its batch. Log the failure.

## Preprocessed File Cleanup

The `results/{timestamp}-preprocessed.json` file is kept after processing (useful for debugging). It's relatively small (~5-10K lines) and can be manually deleted.

## Frontmatter Settings

```yaml
name: rental-search-valle-aburra-json
description: Filter existing raw JSON files from Apify Facebook scraper using multi-pass AI pipeline (Haiku→Sonnet→Opus) for rental property search in Valle de Aburrá. Triggers on search-request.json with mode json_filter.
allowed-tools: Bash Agent Read Write Glob Grep
```

Notes:
- `user-invocable` defaults to `true` — omitted
- `disable-model-invocation` defaults to `false` — omitted
- `allowed-tools` includes `Grep` for file searching and `Agent` for spawning sub-agents

## File Structure

```
.claude/skills/rental-search-valle-aburra-json/
├── SKILL.md                    — Main skill instructions
└── scripts/
    └── preprocess.js           — Node.js preprocessing script
```

## Datetime Convention

All filenames use local Colombia time (UTC-5) format: `YYYY-MM-DD-HH-mm-ss`

Example: `2026-04-19-18-30-00-results.html`

## Complete Workflow (Step by Step)

1. **Startup**: Check port 3000, start server if needed, open browser
2. **Wait**: Poll for `search-request.json`
3. **Consume signal**: Read and delete `search-request.json`
4. **Write progress**: `{"stage": "preprocessing", ...}`
5. **Run preprocess.js**: Pass selected files, date filter, output path
6. **Write progress**: `{"stage": "mechanical_filter", ...}`
7. **Check stop**: Look for `stop-request.json`
8. **Read preprocessed JSON**: Load the slim output
9. **Split into Haiku batches**: Chunks of 100 posts
10. **Spawn Haiku agents**: All in one parallel message, model: haiku
11. **Write progress**: Update as agents complete
12. **Collect Haiku results**: Merge keep-indices
13. **Write progress**: `{"stage": "haiku_complete", ...}`
14. **Check stop**: Look for `stop-request.json`
15. **Filter posts to survivors**: Keep only posts with indices in Haiku's keep list
16. **Split into Sonnet batches**: Chunks of 20-25 posts
17. **Spawn Sonnet agents**: All in one parallel message, model: sonnet
18. **Write progress**: Update as agents complete
19. **Collect Sonnet results**: Merge candidate arrays
20. **Write progress**: `{"stage": "sonnet_complete", ...}`
21. **Check stop**: Look for `stop-request.json`
22. **Opus validation**: Process all candidates (split to 2 batches if >50)
23. **Write progress**: `{"stage": "opus_validation", ...}`
24. **Apply `numeroResultados` limit**: Sort and cap
25. **Generate HTML**: Write results table to `results/{timestamp}-results.html`
26. **Write progress**: `{"stage": "completed", ...}`
27. **Write `search-complete.json`**: With full summary
28. **Delete `search-progress.json`**: Cleanup
29. **Open HTML in browser**: `start results/{timestamp}-results.html`
