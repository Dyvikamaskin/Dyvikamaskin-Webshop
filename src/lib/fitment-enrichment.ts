"use server";

/**
 * Fitment enrichment pipeline.
 *
 * Given a product's identifiers (SKU, part number, EAN, brand, name), searches
 * the web for mentions of known machine models and proposes fitments for admin
 * review.  No API key required — uses free public endpoints only.
 *
 * Strategy:
 *  1. Build search queries from the product identifiers.
 *  2. Fetch DuckDuckGo HTML search snippets for each query.
 *  3. Optionally fetch the top result URLs for deeper text.
 *  4. Match all accumulated text against every known MachineModel name.
 *  5. Rank proposals by mention count, return with source + confidence.
 */

import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FitmentProposal {
  modelId:      string;
  modelName:    string;
  makeId:       string;
  makeName:     string;
  type:         string;
  confidence:   "high" | "medium" | "low";
  mentionCount: number;
  sources:      string[];  // snippet text where match was found
}

interface SearchParams {
  sku?:        string;
  partNumber?: string;
  ean?:        string;
  brand?:      string;
  name?:       string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Fetch DuckDuckGo HTML search and return a block of plain text from snippets. */
async function fetchDDGSnippets(query: string): Promise<{ text: string; urls: string[] }> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=no-no`;
    const res  = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; IndustriPartsBot/1.0)",
        "Accept-Language": "en-US,en;q=0.9,nb;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { text: "", urls: [] };

    const html = await res.text();

    // Extract snippet text (between <a class="result__snippet"> tags)
    const snippets: string[] = [];
    const urls: string[] = [];

    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const urlRe     = /class="result__url"[^>]*>([\s\S]*?)<\/span>/gi;

    let m: RegExpExecArray | null;
    while ((m = snippetRe.exec(html)) !== null) {
      snippets.push(m[1].replace(/<[^>]+>/g, " ").trim());
    }
    while ((m = urlRe.exec(html)) !== null) {
      const u = m[1].replace(/<[^>]+>/g, "").trim();
      if (u) urls.push(u);
    }

    return { text: snippets.join(" "), urls: urls.slice(0, 3) };
  } catch {
    return { text: "", urls: [] };
  }
}

/** Fetch a single URL and return plain text (strips all HTML tags). */
async function fetchPageText(url: string): Promise<string> {
  try {
    // Only fetch HTTPS pages from known safe TLDs
    if (!url.startsWith("https://") && !url.startsWith("http://")) return "";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; IndustriPartsBot/1.0)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) return "";

    const html = await res.text();
    // Strip scripts, styles, then all tags
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .slice(0, 20_000); // cap at 20k chars per page
  } catch {
    return "";
  }
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function searchFitments(params: SearchParams): Promise<FitmentProposal[]> {
  // Need at least one identifier
  const identifier = params.partNumber || params.sku || params.ean;
  if (!identifier) return [];

  // ── Load all models from DB ───────────────────────────────────────────────
  const allModels = await prisma.machineModel.findMany({
    include: { make: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  if (allModels.length === 0) return [];

  // ── Build search queries ──────────────────────────────────────────────────
  const queries: string[] = [];

  if (params.partNumber) {
    queries.push(`"${params.partNumber}" compatible excavator loader construction machine`);
    queries.push(`"${params.partNumber}" fits models specifications`);
  }
  if (params.ean) {
    queries.push(`"${params.ean}" machine compatibility`);
  }
  if (params.sku && params.sku !== params.partNumber) {
    queries.push(`"${params.sku}" compatible construction equipment`);
  }
  if (params.brand && params.name) {
    queries.push(`${params.brand} "${params.name}" compatible models`);
  }

  // ── Fetch snippets for all queries in parallel ────────────────────────────
  const snippetResults = await Promise.all(queries.slice(0, 4).map(fetchDDGSnippets));

  let combinedText = snippetResults.map((r) => r.text).join(" ");
  const allUrls = [...new Set(snippetResults.flatMap((r) => r.urls))].slice(0, 3);

  // ── Optionally fetch top 2 URLs for deeper text ───────────────────────────
  if (allUrls.length > 0) {
    const pageTexts = await Promise.all(allUrls.slice(0, 2).map(fetchPageText));
    combinedText += " " + pageTexts.join(" ");
  }

  if (!combinedText.trim()) return [];

  // ── Match model names against combined text ───────────────────────────────
  const hitMap = new Map<
    string,
    { model: typeof allModels[0]; count: number; sources: string[] }
  >();

  for (const model of allModels) {
    // Use word-boundary regex; model names like "EC380E" or "L120H" are distinctive
    const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegex(model.name)}(?![A-Za-z0-9])`, "gi");
    const matches = combinedText.match(pattern);
    if (!matches) continue;

    // Collect source snippets that contain this model name
    const sources: string[] = [];
    for (const r of snippetResults) {
      if (pattern.test(r.text)) sources.push(...r.urls.slice(0, 1));
    }

    hitMap.set(model.id, {
      model,
      count: matches.length,
      sources: [...new Set(sources)],
    });
  }

  if (hitMap.size === 0) return [];

  // ── Rank and score ────────────────────────────────────────────────────────
  const proposals: FitmentProposal[] = [];

  for (const { model, count, sources } of hitMap.values()) {
    // Confidence: models mentioned 3+ times = high, 2 = medium, 1 = low
    // Short model names (≤3 chars) are less reliable — cap at medium
    const nameLen     = model.name.replace(/[^A-Za-z0-9]/g, "").length;
    const rawConf     = count >= 3 ? "high" : count >= 2 ? "medium" : "low";
    const confidence  = (nameLen <= 3 && rawConf === "high") ? "medium" : rawConf;

    proposals.push({
      modelId:      model.id,
      modelName:    model.name,
      makeId:       model.make.id,
      makeName:     model.make.name,
      type:         model.type,
      confidence,
      mentionCount: count,
      sources,
    });
  }

  // Sort: high confidence first, then by mention count
  return proposals.sort((a, b) => {
    const confOrder = { high: 0, medium: 1, low: 2 };
    const cDiff = confOrder[a.confidence] - confOrder[b.confidence];
    if (cDiff !== 0) return cDiff;
    return b.mentionCount - a.mentionCount;
  });
}
