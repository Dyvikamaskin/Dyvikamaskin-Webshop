"use server";

/**
 * Product enrichment pipeline.
 *
 * Given a scanned code (barcode, SKU, or part number), tries several free
 * data sources to build a draft product record.  The draft always requires
 * admin approval before it becomes a live Product.
 *
 * Sources tried in order (all optional / best-effort):
 *   1. DuckDuckGo Instant Answer API — free, no key needed
 *   2. Icecat open catalogue       — free tier, no key
 *   3. Wikidata entity search      — free, no key
 *
 * Each source adds fields to the draft without overwriting earlier values,
 * so the first source "wins" on each field.
 */

import { prisma } from "@/lib/prisma";
import { ProductDraftStatus } from "@/app/generated/prisma/enums";

export interface DraftField {
  source: string;
  field:  string;
  value:  string;
}

export interface EnrichmentResult {
  draftId:  string;
  name:     string | null;
  brand:    string | null;
  desc:     string | null;
  image:    string | null;
  sources:  DraftField[];
}

// ─── DuckDuckGo ───────────────────────────────────────────────────────────────

async function fetchDuckDuckGo(query: string): Promise<{
  name?: string; brand?: string; desc?: string; image?: string;
}> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();

    return {
      name:  data.Heading    || undefined,
      desc:  data.AbstractText?.slice(0, 500) || undefined,
      image: data.Image      ? `https://duckduckgo.com${data.Image}` : undefined,
    };
  } catch {
    return {};
  }
}

// ─── Icecat open (no-auth JSON endpoint) ──────────────────────────────────────

async function fetchIcecat(code: string): Promise<{
  name?: string; brand?: string; desc?: string; image?: string;
}> {
  try {
    // Icecat free search by EAN/GTIN or part number
    const url = `https://icecat.us/api/products?Keywords=${encodeURIComponent(code)}&Format=JSON&Limit=1`;
    const res  = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const product   = data?.data?.[0];
    if (!product) return {};

    return {
      name:  product.Title   || undefined,
      brand: product.Brand   || undefined,
      desc:  product.LongDescription?.slice(0, 500) || product.ShortDescription || undefined,
      image: product.HighPic || product.LowPic || undefined,
    };
  } catch {
    return {};
  }
}

// ─── Wikidata entity search ───────────────────────────────────────────────────

async function fetchWikidata(query: string): Promise<{
  name?: string; desc?: string;
}> {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=1&origin=*`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const entity = data?.search?.[0];
    if (!entity) return {};

    return {
      name: entity.label       || undefined,
      desc: entity.description || undefined,
    };
  } catch {
    return {};
  }
}

// ─── Direct product enrichment (for created/imported products) ───────────────

/**
 * Runs enrichment against an existing Product record and fills in only the
 * fields that are currently null/empty.  Does NOT create a ProductDraft.
 * Safe to call fire-and-forget (never throws).
 */
export async function enrichProductDirectly(sku: string): Promise<void> {
  try {
    const product = await prisma.product.findUnique({ where: { sku } });
    if (!product) return;

    // Build a rich query from whatever identifiers we have
    const queryParts = [product.partNumber, product.brand, product.name, sku].filter(Boolean);
    const query      = queryParts.join(" ").trim();
    const codeForIcecat = product.partNumber ?? product.barcodes[0] ?? sku;

    const [ddg, icecat, wiki] = await Promise.all([
      fetchDuckDuckGo(query),
      fetchIcecat(codeForIcecat),
      fetchWikidata(query),
    ]);

    const merged = {
      name:  ddg.name  || icecat.name  || wiki.name  || null,
      brand: ddg.brand || icecat.brand || null,
      desc:  ddg.desc  || icecat.desc  || wiki.desc  || null,
      image: ddg.image || icecat.image || null,
    };

    // Only fill fields that are currently empty — never overwrite admin data
    const updates: Record<string, string> = {};
    if (!product.name             && merged.name)  updates.name             = merged.name;
    if (!product.brand            && merged.brand) updates.brand            = merged.brand;
    if (!product.shortDescription && merged.desc)  updates.shortDescription = merged.desc;
    if (!product.mainImage        && merged.image) updates.mainImage        = merged.image;

    if (Object.keys(updates).length > 0) {
      await prisma.product.update({ where: { sku }, data: updates });
    }
  } catch {
    // Best-effort — never throw
  }
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function runEnrichmentPipeline(
  scannedCode: string
): Promise<EnrichmentResult> {
  // Run all sources in parallel
  const [ddg, icecat, wiki] = await Promise.all([
    fetchDuckDuckGo(scannedCode),
    fetchIcecat(scannedCode),
    fetchWikidata(scannedCode),
  ]);

  const rawResponses = { duckduckgo: ddg, icecat, wikidata: wiki };

  // Merge: first non-null value per field wins
  const merged = {
    name:  ddg.name  || icecat.name  || wiki.name  || null,
    brand: ddg.brand || icecat.brand || null,
    desc:  ddg.desc  || icecat.desc  || wiki.desc  || null,
    image: ddg.image || icecat.image || null,
  };

  // Build provenance list
  const sources: DraftField[] = [];
  const addSource = (src: string, field: string, value: string | undefined) => {
    if (value) sources.push({ source: src, field, value });
  };
  addSource("duckduckgo", "name",  ddg.name);
  addSource("duckduckgo", "desc",  ddg.desc);
  addSource("duckduckgo", "image", ddg.image);
  addSource("icecat",     "name",  icecat.name);
  addSource("icecat",     "brand", icecat.brand);
  addSource("icecat",     "desc",  icecat.desc);
  addSource("icecat",     "image", icecat.image);
  addSource("wikidata",   "name",  wiki.name);
  addSource("wikidata",   "desc",  wiki.desc);

  // Persist draft
  const draft = await prisma.productDraft.create({
    data: {
      scannedCode,
      suggestedName:  merged.name,
      suggestedBrand: merged.brand,
      suggestedDesc:  merged.desc,
      suggestedImage: merged.image,
      enrichmentData: rawResponses as object,
      sources:        sources as object,
      status:         ProductDraftStatus.PENDING,
    },
  });

  return {
    draftId: draft.id,
    name:    merged.name,
    brand:   merged.brand,
    desc:    merged.desc,
    image:   merged.image,
    sources,
  };
}
