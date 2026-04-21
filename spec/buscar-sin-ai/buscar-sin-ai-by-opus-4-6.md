# Buscar sin AI — Keyword-Based Rental Search Specification

## Overview

A client-side keyword search feature for the rental property search app at `localhost:3000`. A "Buscar sin AI" button lets users filter existing raw JSON files using regex and synonym-based matching — no AI API calls, no cost, instant results. Results display inline below the search form as an HTML table matching the existing AI-filtered results format.

## Goals

- Provide a fast, free alternative to AI-based filtering
- Use smart keyword/regex matching with a pre-built Spanish synonym dictionary
- Run entirely client-side in the browser (zero server-side filtering logic)
- Display results inline on the same page with identical table format to AI results

## UI Changes

### "Buscar sin AI" Button

- **Placement**: immediately to the right of the existing "Filtrar JSON" / "Buscar" button, in the same `flex gap-4` button row
- **Always visible** on the page regardless of mode
- **Disabled** (grayed out, `cursor-not-allowed`, reduced opacity) when the "Buscar sobre archivos JSON existentes" checkbox is **unchecked**
- **Enabled** when the checkbox is **checked**
- **Validation**: if clicked with no JSON files selected in the dropdown, show inline status message: `"Selecciona al menos un archivo JSON"`
- **Styling**: visually distinct from the AI search button (e.g., `bg-blue-500 hover:bg-blue-600` to differentiate from the green AI button), with `opacity-50 cursor-not-allowed` when disabled
- **Loading state**: while processing, the button text changes to `"Buscando..."` and is disabled; the status area shows `"Filtrando posts localmente..."`

### Results Display

- Results render **below the status bar**, inline on the same page
- Uses the **exact same five columns** as the existing AI-filtered HTML results:

| Teléfono | Descripción | Costo | Grupo | Enlace |
|----------|-------------|-------|-------|--------|

- **Teléfono**: clickable WhatsApp link with pre-filled message
- **Descripción**: a concise summary extracted from the post text (first ~200 characters of the combined text, or the full text if shorter)
- **Costo**: the extracted price formatted in Colombian style (e.g., `$800.000`)
- **Grupo**: the `groupTitle` field from the post
- **Enlace**: a clickable "Ver publicación" link to the Facebook post URL
- Results sorted by **post date, newest first**
- Default limit: **40 results** if "Número de Resultados" is empty; otherwise respects the user's value as a maximum cap
- If no matches found, display: `"No se encontraron resultados que coincidan con los filtros."`
- Show a count header above the table: `"Se encontraron X resultados"` (or `"Mostrando X de Y resultados"` if capped)

### Fields Behavior with "Buscar sin AI"

- **Distancia máxima**: silently ignored (no AI for geographic reasoning)
- **Cantidad de Posts por Grupo**: not applicable, silently ignored
- **All other filters**: applied with AND logic — only filled/checked fields are evaluated, but phone number presence is **always required**
- **Número de Resultados**: default 40 if empty, otherwise uses user's value as maximum cap

## Data Sources

### JSON Structure

Posts are read from raw JSON files in the `results/` folder. Each post object contains:

```typescript
interface RawPost {
  url: string;                    // Facebook post permalink (used for dedup + WhatsApp link)
  time: string;                   // ISO datetime (e.g., "2026-04-19T17:27:56.000Z")
  text: string;                   // Main post text (may be empty)
  user: { id: string; name: string };
  attachments?: Array<{
    ocrText?: string;             // OCR-extracted text from images
    // ... other attachment fields
  }>;
  groupTitle: string;             // Facebook group name
  // ... other fields not needed for filtering
}
```

### Searchable Text

For each post, combine into a single searchable string:
1. The `text` field
2. All `ocrText` values from `attachments[]`

Joined with a space separator. This combined string is used for **all** text-based filters (property type, location, amenities, phone extraction, seeking/offering detection).

### Multi-File Support

- Fetches and merges all selected JSON files into a single post array
- **Deduplicates by `url`** — if the same post URL appears in multiple files, keep only the first occurrence
- Processing order: files are processed in selection order; within each file, posts retain their original order (dedup keeps the first seen)

### New API Endpoint Required

The existing `/api/json-files` endpoint only lists file names. A new endpoint is needed to serve file contents:

**`GET /api/json-files/[filename]/route.ts`**
- Accepts a filename parameter (e.g., `2026-04-19T17-44-17-raw.json`)
- Validates the filename matches the pattern `*-raw.json` to prevent path traversal
- Returns the JSON file contents from `results/` directory
- Returns 404 if file not found

Alternatively, a single endpoint that accepts multiple filenames:

**`POST /api/json-files/content`**
- Body: `{ files: ["file1-raw.json", "file2-raw.json"] }`
- Returns: `{ data: { "file1-raw.json": [...posts], "file2-raw.json": [...posts] } }`
- Validates each filename matches `*-raw.json`

Either approach works; the key requirement is that the client can fetch the actual JSON content.

## Filtering Logic

All filters use **AND logic**. Only filled/checked fields are applied as filter criteria. Phone number presence is **always required** regardless of other filters.

Filter execution order (optimized for early elimination):
1. Phone number extraction (always — discard posts with no phone)
2. Exclude "seeking" posts (always — cheap string check)
3. Publication date (if set — timestamp comparison)
4. Property type (if any checked)
5. Location (if filled)
6. Price (if filled)
7. Amenities (if any checked)

### 1. Property Type (Tipo de Propiedad)

Matches checked property types using synonym expansion. If **multiple types are checked**, any match satisfies this filter (**OR** within property types).

Synonym dictionary:

| User Selection | Matches (case/accent insensitive) |
|---|---|
| Habitaciones | habitación, habitaciones, habitacion, cuarto, cuartos, pieza, piezas, alcoba, alcobas |
| Apartaestudios | apartaestudio, apartaestudios, aparta estudio, aparta-estudio, aparta estudios, studio, estudio (when preceded by "aparta") |
| Apartamentos | apartamento, apartamentos, apto, aptos, apto. |

**Important**: The word "estudio" alone should NOT match apartaestudio — it must be preceded by "aparta" or similar context. The word "habitación" in "se busca habitación" is handled by the seeking filter (step 2), not here.

### 2. Exclude "Seeking" Posts (Always Active)

Automatically exclude posts where the poster is **seeking** a rental, not **offering** one. This filter runs on the combined text.

**Exclusion patterns** (regex, case-insensitive):
- `\bbusco\b` — "busco apartamento", "busco habitación"
- `\bnecesito\b` — "necesito habitación"
- `\bse\s+busca\b` — "se busca roomie", "se busca compañera"
- `\bbuscando\b` — "estoy buscando"
- `\bme\s+interesa\b` — "me interesa un cuarto"
- `\balguien\s+(que\s+)?arriende\b` — "alguien que arriende"
- `\brecomendaci[oó]n\b` — "alguna recomendación de..."

**Do NOT exclude** posts that contain offer verbs even if they also mention "busco" in a different context. However, for simplicity, any post containing a seeking pattern should be excluded — false negatives (missing a few valid offers) are acceptable to avoid showing irrelevant demand posts.

### 3. Location (Ubicación)

Keyword matching with a pre-built synonym dictionary for Valle de Aburrá locations. The user's input text is looked up in the dictionary to find all matching synonyms, then the post's combined text is searched for any of those synonyms.

If the user's location input doesn't exactly match a dictionary key, perform a **substring match** against all dictionary keys and their synonyms (e.g., user types "antioquia" → matches "universidad de antioquia" entry).

All matching is **case-insensitive and accent-insensitive** (normalize both input and text by removing accents before comparison).

**Location Synonym Dictionary:**

```
"centro de medellín" → centro de medellín, centro de medellin, centro medellín, centro medellin, av la playa, la playa, parque berrio, parque berrío, san antonio (centro), la candelaria, junín, maracaibo, el hueco
"el poblado" → el poblado, poblado, milla de oro, ciudad del río, ciudad del rio, provenza, lleras
"laureles" → laureles, la 70, carrera 70, estadio, la setenta, segundo parque de laureles, primer parque de laureles, circular
"belén" → belén, belen, la mota, los molinos, fátima, fatima, belén malibú, belen malibu
"envigado" → envigado, la frontera, zuniga, zúñiga
"sabaneta" → sabaneta, la estrella (near sabaneta)
"itagüí" → itagüí, itagui, ditaires
"bello" → bello, niquia, niquía
"boston" → boston, buenos aires, bombona, bomboná
"san joaquín" → san joaquín, san joaquin
"robledo" → robledo, palenque
"aranjuez" → aranjuez, manrique, campo valdés, campo valdes
"la américa" → la américa, la america, simón bolívar, simon bolivar
"calasanz" → calasanz, la floresta, santa lucía, santa lucia
"castilla" → castilla, caribe, tricentenario
"prado" → prado, hospital, chagualo
"la candelaria" → la candelaria, villanueva, san benito
"copacabana" → copacabana
"barbosa" → barbosa
"girardota" → girardota
"caldas" → caldas
"la estrella" → la estrella

"universidad de antioquia" → universidad de antioquia, udea, u de a, u. de a., alma mater
"universidad pontificia bolivariana" → universidad pontificia bolivariana, upb, pontificia, bolivariana
"universidad nacional" → universidad nacional, unal, u nacional, u. nacional, minas (campus)
"universidad de medellín" → universidad de medellín, universidad de medellin, udem
"eafit" → eafit, universidad eafit
"ITM" → ITM, instituto tecnológico metropolitano

"metro" stations can be used as location hints:
"estación hospital" → hospital, near UdeA
"estación universidad" → universidad, near UdeA/Unal
"estación suramericana" → suramericana, near laureles
"estación estadio" → estadio, near laureles
"estación poblado" → poblado
"estación aguacatala" → aguacatala
"estación envigado" → envigado
"estación itagüí" → itagüí, itagui
"estación sabaneta" → sabaneta
"estación niquia" → bello, niquía
"estación caribe" → caribe, near castilla
"estación gardel" → gardel, manrique
```

### 4. Price (Presupuesto Máximo)

**Strict ≤ matching** — the extracted price must be ≤ the user's budget.

If the user leaves the price field **empty**, this filter is **skipped entirely** (posts without prices are allowed through).

If the user fills in a budget, only posts where a price can be extracted AND that price ≤ budget are included. Posts where no price can be extracted are **excluded** when a budget filter is active.

**Price extraction regex** must handle all common Colombian formats. Process in this priority order:

1. **Dot-separated thousands** (most common): `\$?\d{1,3}(?:\.\d{3})+` → remove dots, parse as integer
   - `800.000` → 800000
   - `$1.150.000` → 1150000
   - `1'200.000` → 1200000 (handle apostrophe as thousands sep)

2. **"mil" suffix**: `(\d+)\s*mil` → multiply by 1000
   - `260 mil` → 260000
   - `800mil` → 800000

3. **"k" suffix**: `(\d+)\s*k\b` → multiply by 1000
   - `800k` → 800000

4. **Comma-separated thousands**: `\$?\d{1,3}(?:,\d{3})+` → remove commas, parse
   - `$1,200,000` → 1200000

5. **Bare number in rental-price range** (200-2000, implying thousands): `\b(\d{3,4})\b` where value is between 200 and 2000 → multiply by 1000
   - `650` → 650000
   - `820` → 820000
   - BUT `3053795061` (phone number) should NOT be interpreted as price — only apply this rule when the number appears near price-context words like "precio", "valor", "mensual", "mes", "arriendo", "alquiler", "canon", "$"

6. **Explicit currency with no separators**: `\$\s*(\d{6,7})` → parse as-is
   - `$800000` → 800000

If multiple prices are found in a post, use the **lowest price** that appears in a rental-price context (this handles posts listing multiple room options — the cheapest is the most relevant for budget filtering).

### 5. Amenities (Servicios y Amenidades)

Each checked amenity is matched independently. **All checked amenities must match** (AND logic within amenities).

| Amenity Checkbox | Synonym Matches (case/accent insensitive) |
|---|---|
| Incluye baño privado | baño privado, bano privado, baño interno, bano interno, baño propio, bano propio, baño independiente, bano independiente, baño dentro, bano dentro, baño en la habitación, baño en la habitacion, baño en el cuarto |
| Incluye baño | baño, bano (matches any mention of bathroom — this is a superset) |
| Incluir servicio de lavandería | lavandería, lavanderia, lavadora, servicio de lavandería, zona de lavado, zona de ropas |
| Incluir servicios públicos | servicios incluidos, servicios públicos, servicios publicos, todos los servicios, todo incluido, servicios incluidos en el precio |

### 6. Publication Date (Fecha de Publicación)

**Primary check**: Compare the post's `time` field (ISO datetime) against a computed cutoff date.

The cutoff is calculated as: `now - selected_duration`. A post passes if `post.time >= cutoff`.

| Option Value | Duration |
|---|---|
| `cualquier_fecha` | No filter (skip) |
| `ultimas_24h` | 24 hours |
| `1_dia` | 1 day (24 hours) |
| `2_dias` | 2 days |
| `3_dias` | 3 days |
| `4_dias` | 4 days |
| `5_dias` | 5 days |
| `6_dias` | 6 days |
| `1_semana` | 7 days |
| `2_semanas` | 14 days |
| `3_semanas` | 21 days |
| `1_mes` | 30 days |
| `2_meses` | 60 days |

**Secondary check (text-based)**: Also parse relative date mentions in the post text as supporting context. Look for patterns like:
- `"hace \d+ (días|horas|semanas|meses)"` in post text
- If the post's `time` field is missing or null, fall back to text-based date estimation

This is a best-effort secondary signal — the `time` field is the authoritative source.

### 7. Phone Number Extraction (Always Required)

Every returned result **must** have at least one extractable phone number. Posts without any detectable phone number are **excluded**.

**Extraction sources** (in priority order):
1. `text` field
2. All `ocrText` values in `attachments[]`

**Phone regex patterns** (applied to combined text):

```regex
// WhatsApp URLs — highest confidence
wa\.me\/(?:57)?(\d{10})

// Explicit phone labels followed by number
(?:tel[eé]fono|cel|celular|m[oó]vil|info(?:rmaci[oó]n)?|wsp|whatsapp|whatssapp|escribeme|contacto|llamar|llama)\s*:?\s*(?:\+?57\s*)?(\d[\d\s\-]{8,12}\d)

// Colombian mobile pattern: 10 digits starting with 3
(?<!\d)(?:\+?57\s*)?([3]\d{2}[\s\-]?\d{3}[\s\-]?\d{4})(?!\d)

// Formatted with spaces: "301 5819079", "320 529 9813"
(?<!\d)([3]\d{2}\s\d{3,4}\s?\d{3,4})(?!\d)
```

**Post-processing**:
- Strip all non-digit characters
- If starts with `57` and has 12 digits, remove the `57` prefix
- Final result must be exactly 10 digits starting with `3`
- If multiple valid numbers found, use the **first one**

**WhatsApp link format**:
```
https://wa.me/57{10digits}?text=Hola%2C%20vi%20tu%20publicaci%C3%B3n%2C%20sigue%20disponible%3F%20{url_encoded_post_url}
```

### 8. Number of Results

- If "Número de Resultados" field is **empty**: default to **40**
- If the field has a value: use that value as the **maximum** number of results to display
- Display all matches up to the limit
- The count header shows whether results were capped: `"Mostrando 40 de 127 resultados"` vs `"Se encontraron 12 resultados"`

## Synonym Dictionary Architecture

The dictionary is a TypeScript module (`src/lib/synonyms.ts` or similar) exporting lookup structures:

```typescript
interface SynonymDictionary {
  propertyTypes: Record<string, string[]>;
  locations: Record<string, string[]>;
  amenities: Record<string, string[]>;
  seekingPatterns: RegExp[];
}
```

All matching is:
- **Case-insensitive**: normalize to lowercase before comparison
- **Accent-insensitive**: strip diacritics (á→a, é→e, í→i, ó→o, ú→u, ñ→n, ü→u) before comparison
- **Word-boundary aware** where appropriate (e.g., "apto" shouldn't match "rapto")

## Architecture

### Entirely Client-Side

- No AI API calls
- Filtering/matching logic runs 100% in the browser
- JSON files are fetched via API endpoint (file listing + content serving)
- No signal files written (unlike the AI flow that writes `search-request.json`)

### New API Endpoint

**`GET /api/json-files/[filename]`** (dynamic route)
- Serves the contents of a specific raw JSON file from `results/`
- Security: validate filename matches `/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-raw\.json$/`
- Returns 400 for invalid filenames, 404 for missing files
- Returns the parsed JSON array directly

### Client-Side Module

**`src/lib/keywordFilter.ts`** — the core filtering engine:

```typescript
interface FilterParams {
  tipoPropiedad: { apartamentos: boolean; apartaestudios: boolean; habitaciones: boolean };
  ubicacion: string;
  presupuestoMaximo: number | null;
  servicios: { banoPrivado: boolean; bano: boolean; lavanderia: boolean; serviciosPublicos: boolean };
  fechaPublicacion: string;
  numeroResultados: number;
}

interface FilteredResult {
  phone: string;
  description: string;
  price: string;
  group: string;
  postUrl: string;
  time: string;
}

function filterPosts(posts: RawPost[], params: FilterParams): FilteredResult[];
```

### Data Flow

1. User checks "Buscar sobre archivos JSON existentes"
2. User selects one or more raw JSON files from the dropdown
3. User fills in desired filters
4. User clicks "Buscar sin AI"
5. Button shows loading state
6. App fetches each selected JSON file via `/api/json-files/[filename]`
7. Posts are merged and deduplicated by URL
8. Client-side filtering engine applies all active filters
9. Results are sorted by date (newest first) and capped at the result limit
10. Results table renders inline below the form
11. Loading state clears; result count is shown

### Performance Considerations

- JSON files can be large (thousands of posts). Fetching happens in parallel for multiple files.
- Filtering is synchronous but fast (regex matching on strings). For files with 10,000+ posts, consider using `requestAnimationFrame` or `setTimeout` chunking to avoid UI blocking, though this is unlikely to be needed for typical file sizes.
- The combined text string per post should be computed once and reused across all filter checks.

## Results Table Specification

The table matches the exact format of existing AI-filtered results:

```html
<table border="1" cellpadding="6" cellspacing="0">
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
      <td><a href="https://wa.me/57{phone}?text=..." target="_blank">{phone}</a></td>
      <td>{description text}</td>
      <td>${formatted_price}</td>
      <td>{groupTitle}</td>
      <td><a href="{post_url}" target="_blank">Ver publicación</a></td>
    </tr>
  </tbody>
</table>
```

**Description column**: Use the first 300 characters of the combined text (text + ocrText), trimmed. If truncated, append "...". Replace newlines with spaces for cleaner table display.

**Price column**: Format the extracted numeric price in Colombian style with dots as thousands separator and a `$` prefix (e.g., `$800.000`). If the price filter is not active and no price was found, show `"No especificado"`.

## Edge Cases

| Scenario | Behavior |
|---|---|
| Post with empty `text` but matching `ocrText` | Include — ocrText is a full search source |
| Post with price only in `ocrText` | Extract price from ocrText |
| Multiple phone numbers in one post | Use the first valid one found |
| Same post URL in multiple JSON files | Deduplicate — show only once (first occurrence) |
| No matches found | Show: "No se encontraron resultados que coincidan con los filtros." |
| User clicks "Buscar sin AI" without selecting files | Show: "Selecciona al menos un archivo JSON" |
| "Buscar sin AI" clicked while checkbox unchecked | Button is disabled — no action |
| Post has no `time` field | Place at the end of results (lowest sort priority) |
| Post text contains both "busco" and "se alquila" | Exclude (seeking patterns take precedence for safety) |
| Price field empty + post has no price | Include (price filter is not active) |
| Price field filled + post has no extractable price | Exclude (can't verify budget compliance) |
| Very large JSON files (10,000+ posts) | Loading indicator keeps user informed; consider chunked processing |
| Network error fetching JSON file | Show error: "Error al cargar el archivo: {filename}" |
| Post with "650" that could be a price or random number | Only treat as price if near price-context words |
| Multiple prices in one post (e.g., "$460.000, $590.000, $650.000") | Use the lowest price for budget comparison |
