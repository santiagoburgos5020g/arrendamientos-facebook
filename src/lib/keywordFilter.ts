import {
  normalize,
  PROPERTY_TYPE_SYNONYMS,
  LOCATION_SYNONYMS,
  AMENITY_SYNONYMS,
  SEEKING_PATTERNS,
  PRICE_CONTEXT_WORDS,
} from "./synonyms";

export interface RawPost {
  url: string;
  time: string;
  text: string;
  user: { id: string; name: string };
  attachments?: Array<{ ocrText?: string; [key: string]: unknown }>;
  groupTitle: string;
  price?: string;
  location?: string;
  title?: string;
  [key: string]: unknown;
}

export interface FilterParams {
  tipoPropiedad: {
    apartamentos: boolean;
    apartaestudios: boolean;
    habitaciones: boolean;
  };
  ubicacion: string;
  presupuestoMaximo: number | null;
  servicios: {
    banoPrivado: boolean;
    bano: boolean;
    lavanderia: boolean;
    serviciosPublicos: boolean;
  };
  fechaPublicacion: string;
  numeroResultados: number;
}

export interface FilteredResult {
  phone: string;
  description: string;
  price: string;
  priceNumeric: number | null;
  group: string;
  postUrl: string;
  whatsappUrl: string;
  time: string;
}

export interface FilterResult {
  results: FilteredResult[];
  totalMatches: number;
}

function getCombinedText(post: RawPost): string {
  const parts: string[] = [];
  if (post.text) parts.push(post.text);
  if (post.title) parts.push(post.title);
  if (post.attachments) {
    for (const att of post.attachments) {
      if (att.ocrText) parts.push(att.ocrText);
    }
  }
  return parts.join(" ");
}

function extractPhone(text: string): string | null {
  // Priority 1: WhatsApp URLs
  const waMatch = text.match(/wa\.me\/(?:57)?(\d{10})/);
  if (waMatch && waMatch[1].startsWith("3")) return waMatch[1];

  // Priority 2: Phone labels followed by number
  const labelPattern =
    /(?:tel[eé]fono|cel|celular|m[oó]vil|info(?:rmaci[oó]n)?|wsp|whatsapp|whatssapp|escribeme|contacto|llamar|llama)\s*:?\s*(?:\+?57\s*)?(\d[\d\s\-]{8,12}\d)/i;
  const labelMatch = text.match(labelPattern);
  if (labelMatch) {
    const digits = labelMatch[1].replace(/[\s\-]/g, "");
    const clean = digits.startsWith("57") && digits.length === 12
      ? digits.slice(2)
      : digits;
    if (clean.length === 10 && clean.startsWith("3")) return clean;
  }

  // Priority 3: Colombian mobile pattern (10 digits starting with 3)
  const mobilePattern = /(?<!\d)(?:\+?57\s*)?([3]\d{2}[\s\-]?\d{3}[\s\-]?\d{4})(?!\d)/g;
  let match;
  while ((match = mobilePattern.exec(text)) !== null) {
    const digits = match[1].replace(/[\s\-]/g, "");
    if (digits.length === 10 && digits.startsWith("3")) return digits;
  }

  // Priority 4: Formatted with spaces
  const formattedPattern = /(?<!\d)([3]\d{2}\s\d{3,4}\s?\d{3,4})(?!\d)/g;
  while ((match = formattedPattern.exec(text)) !== null) {
    const digits = match[1].replace(/\s/g, "");
    if (digits.length === 10 && digits.startsWith("3")) return digits;
  }

  return null;
}

function isSeeking(normalizedText: string): boolean {
  return SEEKING_PATTERNS.some((pattern) => pattern.test(normalizedText));
}

function getDateCutoff(fechaPublicacion: string): number | null {
  const durations: Record<string, number> = {
    ultimas_24h: 24 * 60 * 60 * 1000,
    "1_dia": 24 * 60 * 60 * 1000,
    "2_dias": 2 * 24 * 60 * 60 * 1000,
    "3_dias": 3 * 24 * 60 * 60 * 1000,
    "4_dias": 4 * 24 * 60 * 60 * 1000,
    "5_dias": 5 * 24 * 60 * 60 * 1000,
    "6_dias": 6 * 24 * 60 * 60 * 1000,
    "1_semana": 7 * 24 * 60 * 60 * 1000,
    "2_semanas": 14 * 24 * 60 * 60 * 1000,
    "3_semanas": 21 * 24 * 60 * 60 * 1000,
    "1_mes": 30 * 24 * 60 * 60 * 1000,
    "2_meses": 60 * 24 * 60 * 60 * 1000,
  };
  const duration = durations[fechaPublicacion];
  if (!duration) return null;
  return Date.now() - duration;
}

function matchesPropertyType(
  normalizedText: string,
  tipoPropiedad: FilterParams["tipoPropiedad"]
): boolean {
  const checkedTypes = Object.entries(tipoPropiedad).filter(([, v]) => v);
  if (checkedTypes.length === 0) return true;

  return checkedTypes.some(([key]) => {
    const synonyms = PROPERTY_TYPE_SYNONYMS[key];
    if (!synonyms) return false;
    return synonyms.some((synonym) => {
      const normalizedSynonym = normalize(synonym);
      if (normalizedSynonym.length <= 4) {
        const regex = new RegExp(`\\b${normalizedSynonym}\\.?\\b`);
        return regex.test(normalizedText);
      }
      return normalizedText.includes(normalizedSynonym);
    });
  });
}

function matchesLocation(
  normalizedText: string,
  ubicacion: string,
  postLocation?: string
): boolean {
  if (!ubicacion.trim()) return true;

  const normalizedInput = normalize(ubicacion);
  const searchTerms: string[] = [];

  // Exact key match
  if (LOCATION_SYNONYMS[normalizedInput]) {
    searchTerms.push(
      ...LOCATION_SYNONYMS[normalizedInput].map((s) => normalize(s))
    );
  }

  // Substring match across keys and values
  if (searchTerms.length === 0) {
    for (const [key, synonyms] of Object.entries(LOCATION_SYNONYMS)) {
      const normalizedKey = normalize(key);
      if (
        normalizedKey.includes(normalizedInput) ||
        normalizedInput.includes(normalizedKey)
      ) {
        searchTerms.push(...synonyms.map((s) => normalize(s)));
        continue;
      }
      for (const syn of synonyms) {
        const normalizedSyn = normalize(syn);
        if (
          normalizedSyn.includes(normalizedInput) ||
          normalizedInput.includes(normalizedSyn)
        ) {
          searchTerms.push(...synonyms.map((s) => normalize(s)));
          break;
        }
      }
    }
  }

  // If still no terms, use the raw input as a direct search
  if (searchTerms.length === 0) {
    searchTerms.push(normalizedInput);
  }

  // Check post text
  const textMatch = searchTerms.some((term) => normalizedText.includes(term));
  if (textMatch) return true;

  // Check structured location field
  if (postLocation) {
    const normalizedLocation = normalize(postLocation);
    return searchTerms.some((term) => normalizedLocation.includes(term));
  }

  return false;
}

function extractPrice(combinedText: string, structuredPrice?: string): number | null {
  // Try structured price first (e.g., "COP650,000")
  if (structuredPrice) {
    const copMatch = structuredPrice.match(/^COP([\d,]+)$/);
    if (copMatch) {
      const value = parseInt(copMatch[1].replace(/,/g, ""), 10);
      if (value > 0) return value;
    }
  }

  const prices: number[] = [];

  // Pattern 1: Dot-separated thousands (most common Colombian format)
  const dotPattern = /\$?\d{1,3}['.]\d{3}(?:\.\d{3})*/g;
  let match;
  while ((match = dotPattern.exec(combinedText)) !== null) {
    const cleaned = match[0].replace(/[$'.]/g, "");
    const value = parseInt(cleaned, 10);
    if (value >= 100000 && value <= 50000000) prices.push(value);
  }

  // Pattern 2: "mil" suffix
  const milPattern = /(\d+)\s*mil\b/gi;
  while ((match = milPattern.exec(combinedText)) !== null) {
    const value = parseInt(match[1], 10) * 1000;
    if (value >= 100000 && value <= 50000000) prices.push(value);
  }

  // Pattern 3: "k" suffix
  const kPattern = /(\d+)\s*k\b/gi;
  while ((match = kPattern.exec(combinedText)) !== null) {
    const value = parseInt(match[1], 10) * 1000;
    if (value >= 100000 && value <= 50000000) prices.push(value);
  }

  // Pattern 4: Comma-separated thousands
  const commaPattern = /\$?\d{1,3}(?:,\d{3})+/g;
  while ((match = commaPattern.exec(combinedText)) !== null) {
    const cleaned = match[0].replace(/[$,]/g, "");
    const value = parseInt(cleaned, 10);
    if (value >= 100000 && value <= 50000000) prices.push(value);
  }

  // Pattern 5: Bare numbers with price context (200-2000 implying thousands)
  // Exclude numbers adjacent to other digit groups (likely phone numbers)
  const contextRegex = new RegExp(PRICE_CONTEXT_WORDS.join("|"), "gi");
  const barePattern = /(?<!\d[\s\-]?)(\d{3,4})(?![\s\-]?\d)/g;
  while ((match = barePattern.exec(combinedText)) !== null) {
    const num = parseInt(match[1], 10);
    if (num >= 200 && num <= 2000) {
      const start = Math.max(0, match.index - 80);
      const end = Math.min(combinedText.length, match.index + match[0].length + 30);
      const context = combinedText.slice(start, end);
      contextRegex.lastIndex = 0;
      if (contextRegex.test(context)) {
        prices.push(num * 1000);
      }
    }
  }

  // Pattern 6: Currency-prefixed no separators
  const currencyPattern = /\$\s*(\d{6,7})/g;
  while ((match = currencyPattern.exec(combinedText)) !== null) {
    const value = parseInt(match[1], 10);
    if (value >= 100000 && value <= 50000000) prices.push(value);
  }

  if (prices.length === 0) return null;
  return Math.min(...prices);
}

function matchesAmenities(
  normalizedText: string,
  servicios: FilterParams["servicios"]
): boolean {
  const checkedAmenities = Object.entries(servicios).filter(([, v]) => v);
  if (checkedAmenities.length === 0) return true;

  return checkedAmenities.every(([key]) => {
    const synonyms = AMENITY_SYNONYMS[key];
    if (!synonyms) return false;
    return synonyms.some((synonym) => {
      return normalizedText.includes(normalize(synonym));
    });
  });
}

function formatPrice(price: number): string {
  return "$" + price.toLocaleString("es-CO");
}

function buildDescription(combinedText: string): string {
  const cleaned = combinedText.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length <= 300) return cleaned;
  return cleaned.slice(0, 300) + "...";
}

function buildWhatsAppUrl(phone: string, postUrl: string): string {
  const message = `Hola, vi tu publicación, sigue disponible? ${postUrl}`;
  return `https://wa.me/57${phone}?text=${encodeURIComponent(message)}`;
}

export function filterPosts(posts: RawPost[], params: FilterParams): FilterResult {
  const dateCutoff = getDateCutoff(params.fechaPublicacion);
  const anyPropertyTypeChecked =
    params.tipoPropiedad.apartamentos ||
    params.tipoPropiedad.apartaestudios ||
    params.tipoPropiedad.habitaciones;
  const anyAmenityChecked =
    params.servicios.banoPrivado ||
    params.servicios.bano ||
    params.servicios.lavanderia ||
    params.servicios.serviciosPublicos;

  const matched: FilteredResult[] = [];

  for (const post of posts) {
    const combinedText = getCombinedText(post);
    if (!combinedText.trim()) continue;

    // Step 1: Phone extraction (always required)
    const phone = extractPhone(combinedText);
    if (!phone) continue;

    const normalizedText = normalize(combinedText);

    // Step 2: Exclude seeking posts (only check main text, not ocrText)
    if (isSeeking(normalize(post.text || ""))) continue;

    // Step 3: Date filter
    if (dateCutoff !== null) {
      if (!post.time) continue;
      const postTime = new Date(post.time).getTime();
      if (isNaN(postTime) || postTime < dateCutoff) continue;
    }

    // Step 4: Property type
    if (anyPropertyTypeChecked) {
      if (!matchesPropertyType(normalizedText, params.tipoPropiedad)) continue;
    }

    // Step 5: Location
    if (!matchesLocation(normalizedText, params.ubicacion, post.location)) continue;

    // Step 6: Price
    const priceNumeric = extractPrice(combinedText, post.price);
    if (params.presupuestoMaximo !== null) {
      if (priceNumeric === null) continue;
      if (priceNumeric > params.presupuestoMaximo) continue;
    }

    // Step 7: Amenities
    if (anyAmenityChecked) {
      if (!matchesAmenities(normalizedText, params.servicios)) continue;
    }

    // Build result
    matched.push({
      phone,
      description: buildDescription(combinedText),
      price: priceNumeric !== null ? formatPrice(priceNumeric) : "No especificado",
      priceNumeric,
      group: post.groupTitle || "",
      postUrl: post.url,
      whatsappUrl: buildWhatsAppUrl(phone, post.url),
      time: post.time || "",
    });
  }

  // Sort by date, newest first (posts with no time go last)
  matched.sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return new Date(b.time).getTime() - new Date(a.time).getTime();
  });

  const totalMatches = matched.length;
  const limit = params.numeroResultados || 40;
  const results = matched.slice(0, limit);

  return { results, totalMatches };
}
