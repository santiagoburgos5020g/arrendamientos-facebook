# Rental Search Valle de Aburrá — JSON Filtering Skill

## Overview

This skill handles Mode 2 (JSON Filtering) of the rental search application. When the user selects existing raw JSON files in the UI, applies filter criteria, and clicks "Filtrar JSON", this skill picks up the `search-request.json` signal file and processes the posts through a multi-pass AI pipeline optimized for accuracy and speed on large datasets (999+ posts, 100K+ lines).

## Purpose

Filter raw Apify Facebook Groups Scraper JSON output using a four-stage pipeline:
1. Node.js mechanical preprocessing (deterministic, free, instant)
2. Haiku coarse elimination (parallel, cheap, fast — removes obvious mismatches)
3. Sonnet semantic extraction + filtering (parallel, accurate — extracts data and applies filters)
4. Opus validation (final pass — removes false positives with geographic/semantic precision)

## Trigger Conditions

- Auto-invoked when `search-request.json` appears at project root with `mode: "json_filter"`
- User-invocable via `/rental-search-valle-aburra-json`
- Frontmatter: `disable-model-invocation: false` (auto-invocation enabled)

## Startup Workflow

1. Check if port 3000 is in use
2. If not running: start `npm run dev` in background, wait for ready
3. Open browser to `http://localhost:3000/`
4. Wait for `search-request.json` signal file

## Pipeline Architecture

### Stage 1: Node.js Preprocessing (`scripts/preprocess.js`)

A standalone script inside the skill directory. Run via:
```
node ${CLAUDE_SKILL_DIR}/scripts/preprocess.js <file1> [file2] [file3] ...
```

**Input**: One or more raw JSON files from `results/` directory

**Processing**:
- Parse all selected JSON files
- Merge into single array
- Remove duplicates by post URL
- Remove empty posts (no `text` AND no `ocrText` in any attachment)
- Apply date filter mechanically if `fechaPublicacion` is set and `time` field is available
- Strip metadata bloat — keep ONLY:
  - `text`
  - All `ocrText` values from `attachments[]`
  - `url`
  - `time`
  - `groupTitle`
  - `user.name`

**Output**: `results/{YYYY-MM-DD-HH-mm-ss}-preprocessed.json` — a slim JSON array of posts with only relevant fields.

**Expected reduction**: ~80% file size reduction (100K lines → ~5K lines of actual content)

### Stage 2: Haiku Coarse Elimination (Parallel Agents)

**Batch size**: 100 posts per agent
**Parallelism**: ~10 agents simultaneously (for 999 posts)
**Model**: Haiku

**Task**: Binary classification ONLY — "Is this post CLEARLY irrelevant?"

**Haiku receives**:
- The batch of preprocessed posts
- Simplified filter criteria (ONLY):
  - Location (city/region level — "is this clearly about a different city?")
  - Property type (apartment vs room vs apartaestudio)
  - Offer vs demand detection ("is this person SEEKING, not offering?")

**Haiku does NOT receive**: price budget, distance limits, services/amenities

**Rule**: "When in doubt, KEEP the post" — minimize false negatives

**Output**: Array of post indices to KEEP (not eliminate)

**Expected elimination**: ~60-70% of posts removed

### Stage 3: Sonnet Semantic Extraction + Filtering (Parallel Agents)

**Batch size**: 20-25 posts per agent
**Parallelism**: ~12-15 agents simultaneously
**Model**: Sonnet 4.6

**Task**: Full data extraction AND semantic filter matching

**Sonnet receives**:
- The batch of surviving posts (full preprocessed text)
- ALL user filter criteria:
  - Tipo de propiedad (with fuzzy matching rules)
  - Ubicación (with accent-insensitive, partial match rules)
  - Distancia máxima (using geographic knowledge)
  - Presupuesto máximo (strict ≤, must extract price)
  - Servicios/amenidades (semantic matching)
  - Fecha de publicación (relative date interpretation)
  - Número de resultados (awareness of limit)

**Sonnet extracts per matching post**:
- Price (COP) — fuzzy extraction: "750mil" = "$750.000" = "750,000"
- Phone number(s)
- Short description
- Detected location/barrio
- Property type detected
- Services/amenities found
- Match reasoning

**Filtering rules**:
- Fuzzy/semantic matching for all fields EXCEPT price and distance
- Price: strict ≤ presupuestoMaximo. If budget is set, posts WITHOUT extractable price are EXCLUDED
- Distance: strict, using geographic knowledge of Medellín/Valle de Aburrá
- All specified filters must be satisfied (AND logic)

**Output**: Array of candidate posts with extracted data

### Stage 4: Opus Validation (1-2 passes)

**Batch size**: All candidates (~30-80 posts)
**Model**: Opus 4.6

**Task**: False positive removal with strict validation

**Opus validates**:
- **Location relevance**: Does post location actually match user's ubicación? (e.g., "Belén" is NOT "Universidad de Antioquia")
- **Property type**: Is it genuinely the requested type? (not a full apartment that mentions "habitación principal")
- **Price accuracy**: Is extracted price the actual rent, not a phone number/address/admin fee?
- **Offer vs demand**: Final check — is post OFFERING a rental, not SEEKING one?
- **Distance verification**: Using detailed geographic knowledge of Valle de Aburrá

**Output**: Final validated posts with any corrections to extracted data

## Progress Indicator

The skill writes `search-progress.json` at the project root, polled by the UI:

```json
{
  "stage": "haiku_filtering",
  "message": "Eliminación rápida con IA... (lote 3/10)",
  "progress": 30,
  "postsRemaining": 850
}
```

**Stages**:
1. `"preprocessing"` — "Preprocesando JSON... (eliminando metadatos)"
2. `"mechanical_filter"` — "Filtro mecánico aplicado: 850 de 999 posts restantes"
3. `"haiku_filtering"` — "Eliminación rápida con IA... (lote 3/10)"
4. `"haiku_complete"` — "Eliminación rápida completada: 320 posts restantes"
5. `"sonnet_filtering"` — "Extracción y filtrado semántico... (lote 5/15)"
6. `"opus_validation"` — "Validación final... (28 candidatos)"
7. `"generating_html"` — "Generando resultados HTML..."
8. `"completed"` — "Completado: 12 resultados encontrados"
9. `"error"` — "Error: {description}"

**Error states**:
- File can't be read
- All posts eliminated before reaching Opus
- Agent failure
- Invalid JSON format

## Stop Detection

Check for `stop-request.json` between each phase:
- After preprocessing
- After each Haiku batch completes
- Between Sonnet batches
- Before Opus

**Behavior when stopped**:
- Cancel remaining batches
- Generate partial results from whatever has been validated so far
- If stopped before Opus: run quick Opus validation on Sonnet candidates available so far
- Write `search-complete.json` indicating partial results

## Output

### HTML Results File

Generated at: `results/{YYYY-MM-DD-HH-mm-ss}-results.html`

Same format as existing `rental-search-valle-aburra` skill:

| Column | Content |
|--------|---------|
| Teléfono | WhatsApp link: `https://wa.me/57{digits}?text=Hola, vi tu publicación, sigue disponible? {post_url}` |
| Descripción | Short description of the listing |
| Costo | Price in COP |
| Grupo | Facebook group name |
| Enlace | Link to original post |

**WhatsApp link rules**:
- Strip all non-digit characters from phone
- Pre-filled message: `Hola, vi tu publicación, sigue disponible? {post_url}` (URL-encoded)
- If no phone: show "N/A" (no link)

**Auto-open**: The HTML file is opened in the browser automatically after generation.

### Signal Files

**`search-complete.json`** — written when done:
```json
{
  "status": "complete",
  "timestamp": "2026-04-19T18:30:00Z",
  "summary": {
    "totalPosts": 999,
    "afterPreprocessing": 850,
    "afterHaiku": 320,
    "afterSonnet": 45,
    "afterOpus": 12,
    "resultsFile": "results/2026-04-19-18-30-00-results.html"
  }
}
```

## Filtering Rules (Same as Existing Skill)

### Fuzzy/Semantic Matching

- **Tipo de Propiedad**: "apto" = "apartamento", "aparta" = "apartaestudio", "cuarto"/"pieza"/"room" = "habitación"
- **Ubicación**: Accent-insensitive, partial matches, aliases ("belen" = "belén" = "barrio Belén")
- **Servicios**: 
  - "Incluye baño privado" → "baño propio", "baño independiente", "baño dentro de la habitación"
  - "Incluye baño" → "baño", "ducha", "sanitario"
  - "Lavandería" → "lavadora", "lavado de ropa", "servicio de lavado"
  - "Servicios públicos" → "servicios incluidos", "agua y luz incluidos"

### Strict Matching

- **Price**: Strictly ≤ presupuestoMaximo. If budget set, posts without extractable price = EXCLUDED
- **Distance**: Uses geographic knowledge of Medellín/Valle de Aburrá. Strict enforcement.
- **Price extraction**: Must look in text AND all ocrText fields. "260 mil", "$700.000", "650", "1.150.000" all valid.

## Edge Cases

- **Empty text + empty OCR**: Eliminated during preprocessing
- **Multiple prices in one post**: Extract price for the filtered property type
- **Multiple phone numbers**: Use first for WhatsApp link, show all in cell
- **No results after all filtering**: Show table with "No se encontraron resultados que coincidan con los filtros."
- **Agent failure mid-pipeline**: Log error, continue with remaining batches, report in progress
- **All posts eliminated by Haiku**: Skip Sonnet/Opus, report "0 results" with appropriate message
- **Número de resultados limit**: Apply as hard cap on final output count (after Opus)

## Frontmatter Settings

```yaml
name: rental-search-valle-aburra-json
description: Filter existing raw JSON files from Apify Facebook scraper using multi-pass AI pipeline (Haiku→Sonnet→Opus) for rental property search in Valle de Aburrá. Triggers on search-request.json with mode json_filter.
user-invocable: true
disable-model-invocation: false
allowed-tools: Bash Agent Read Write Glob
```

## File Structure

```
.claude/skills/rental-search-valle-aburra-json/
├── SKILL.md                    — Main skill instructions
└── scripts/
    └── preprocess.js           — Node.js preprocessing script
```

## Datetime Convention

All filenames use local Colombia time (UTC-5): `YYYY-MM-DD-HH-mm-ss`
