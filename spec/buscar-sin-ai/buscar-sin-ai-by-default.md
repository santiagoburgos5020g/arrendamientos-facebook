# Buscar sin AI — Keyword-Based Rental Search Specification

## Overview

A new client-side keyword search feature for the rental property search app at `localhost:3000`. A "Buscar sin AI" button allows users to filter existing raw JSON files using regex and synonym-based matching — no AI API calls needed. Results display inline below the search form as an HTML table with the same columns as the existing AI-filtered results.

## Goals

- Provide a fast, free alternative to AI-based filtering
- Use smart keyword/regex matching with a pre-built Spanish synonym dictionary
- Run entirely client-side in the browser
- Display results inline on the same page

## UI Changes

### "Buscar sin AI" Button

- Placement: right next to the existing search button (side by side)
- Always visible on the page
- **Disabled** (grayed out) when the "Buscar sobre archivos JSON existentes" checkbox is unchecked
- **Enabled** when the checkbox is checked
- If clicked with no JSON files selected, show validation message: "Selecciona al menos un archivo JSON"
- Shows a loading indicator ("...loading") while processing

### Results Display

- Results render inline below the search form on the same page
- Uses the exact same table columns as the existing AI-filtered HTML results
- Phone numbers in the "Teléfono" column are clickable WhatsApp links: `https://wa.me/57{digits}?text=Hola%2C%20vi%20tu%20publicaci%C3%B3n%2C%20sigue%20disponible%3F%20{post_url}`
- Results sorted by post date, newest first
- Default limit: 40 results if "Número de Resultados" is empty; otherwise respects the user's input (100, 1000, or more)

### Fields Behavior with "Buscar sin AI"

- **Distancia máxima**: silently ignored (no AI for geographic reasoning)
- **All other filters**: applied with AND logic — only filled fields are checked, but phone number is always required
- **Número de Resultados**: default 40 if empty, otherwise uses user's value as maximum cap

## Data Sources

### JSON Structure

Posts are read from raw JSON files in the `results/` folder. Each post has:

- `text` — main post text
- `time` — ISO datetime string (e.g., `"2026-04-19T17:27:56.000Z"`)
- `url` — Facebook post permalink
- `user.name` — poster's name
- `attachments[].ocrText` — OCR-extracted text from images

### Searchable Text

All filters search across **both** the `text` field and all `ocrText` fields in attachments. These are combined into a single searchable string per post.

### Multi-File Support

- Searches across all selected JSON files combined
- Deduplicates by post URL — only unique URLs appear in results

## Filtering Logic

All filters use AND logic. Only filled/checked fields are applied. Phone number presence is always required.

### 1. Property Type (Tipo de Propiedad)

Matches checked property types using synonym expansion:

- **habitación** → habitaciones, cuarto, cuartos, pieza, alcoba
- **apartaestudio** → apartaestudios, aparta estudio, aparta-estudio, studio
- **apartamento** → apartamentos, apto, aptos

If multiple types are checked, any match satisfies this filter (OR within property types).

### 2. Exclude "Seeking" Posts

Automatically exclude posts where the person is **looking for** a rental (demand), not **offering** one. Exclude posts matching patterns like:

- "busco" (apartamento, habitación, etc.)
- "necesito"
- "se busca roomie"
- "busco compañera/compañero"

Only show supply/offer posts (e.g., "se alquila", "se arrienda", "se renta", "disponible").

### 3. Location (Ubicación)

Keyword matching with a pre-built synonym dictionary for Valle de Aburrá locations:

**Universities:**
- "universidad de antioquia" → UdeA, U de A, universidad de antioquia
- "universidad pontificia bolivariana" → UPB, pontificia bolivariana
- "universidad nacional" → Unal, U Nacional

**Neighborhoods/Areas:**
- "centro de medellín" → centro, centro de medellín, av la playa, la playa
- "el poblado" → poblado
- "laureles" → laureles, la 70, carrera 70
- "belén" → belen, belén
- "envigado" → envigado
- "sabaneta" → sabaneta
- "itagüí" → itagui, itagüí
- "bello" → bello
- "boston" → boston
- "san joaquín" → san joaquin
- etc. (comprehensive Valle de Aburrá coverage)

Matching is case-insensitive and accent-insensitive.

### 4. Price (Presupuesto Máximo)

**Strict ≤ matching** — the extracted price must be less than or equal to the user's budget.

Price extraction regex must handle all Colombian formats:
- `800.000` → 800000
- `$700.000` → 700000
- `1.150.000` → 1150000
- `260 mil` → 260000
- `650` (bare number in hundreds, infer thousands) → 650000
- `800k` → 800000
- `1'200.000` → 1200000
- `$1,200,000` → 1200000

If the user leaves the price field empty, this filter is skipped.

### 5. Amenities (Servicios y Amenidades)

Synonym-based matching for each checked amenity:

- **Baño privado** → baño privado, baño interno, baño propio, baño independiente, baño dentro
- **Baño** → baño, bathroom
- **Lavandería** → lavandería, lavadora, servicio de lavandería, zona de lavado
- **Servicios públicos** → servicios incluidos, servicios públicos, todos los servicios, all services included

### 6. Publication Date (Fecha de Publicación)

Two-step verification:
1. Check the post's `time` field against the selected date range
2. Also parse relative date mentions in the post text as a secondary signal

Date range options map to time windows from "now":
- `ultimas_24h` → 24 hours
- `1_dia` → 1 day
- `2_dias` → 2 days
- ... up to `2_meses` → 2 months

### 7. Phone Number Extraction (Always Required)

Every returned result **must** have a phone number. Extract from both `text` and `ocrText`.

Phone regex patterns:
- Colombian mobile: 10-digit starting with 3 (e.g., `3053795061`)
- With country code: `+57 3053795061`, `573053795061`
- Formatted: `301 5819079`, `320 5299813`
- WhatsApp URLs: `wa.me/573215596100`
- With labels: "info", "wsp", "WhatsApp", "información", "escribeme"

Strip all non-digit characters. If country code 57 is present, remove it. Store the 10-digit number.

Format as WhatsApp link in results: `https://wa.me/57{digits}?text=Hola%2C%20vi%20tu%20publicaci%C3%B3n%2C%20sigue%20disponible%3F%20{post_url}`

### 8. Number of Results

- Default: 40 if field is empty
- Otherwise: show up to the user's specified number
- Show as many matches as found, up to the limit

## Synonym Dictionary

Pre-built, Spanish-only dictionary covering:

1. **Property types** (see section above)
2. **Locations** in Valle de Aburrá (universities, neighborhoods, landmarks, common abbreviations)
3. **Amenities** (bathroom, laundry, utilities synonyms)
4. **Seeking/offering** verbs (to filter out demand posts)

All matching is:
- Case-insensitive
- Accent-insensitive (e.g., "habitación" matches "habitacion")
- Fuzzy on word boundaries (e.g., "baño privado" matches "baño interno" via synonyms)

## Architecture

### Entirely Client-Side

- No AI API calls
- No server-side processing
- JSON files are fetched via the existing `/api/json-files` endpoint (for file listing) and a new endpoint or direct fetch for file contents
- All filtering/matching runs in the browser

### Data Flow

1. User checks "Buscar sobre archivos JSON existentes"
2. User selects one or more raw JSON files
3. User fills in filters
4. User clicks "Buscar sin AI"
5. App fetches selected JSON file contents
6. Client-side filtering engine processes all posts
7. Results render inline below the form as a table
8. Loading indicator shown during processing

## Edge Cases

- Post with no text but has ocrText with all matching criteria → should be included
- Post with price in ocrText but not in text → price should be extracted from ocrText
- Multiple phone numbers in a single post → use the first one found
- Post appears in multiple selected JSON files → deduplicate by URL, show only once
- No matches found → show message like "No se encontraron resultados"
- Very large JSON files → loading indicator keeps the user informed
