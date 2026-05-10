"use server";

import { prisma } from "@/lib/prisma";
import { enqueueEnrichment } from "@/lib/queue/enrichment";
import { findOrCreateCategoryByPath } from "@/app/actions/category";
import { requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  ProductCondition,
  ConditionRating,
  PartProvenance,
  UserRole,
} from "@/app/generated/prisma/enums";

const PRODUCT_IMAGES_BUCKET = "product-images";

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreateProductInput {
  sku:                  string;
  name:                 string;
  priceBase:            number;
  brand?:               string;
  shortDescription?:    string;
  partNumber?:          string;
  /**
   * Pre-existing category id selected from a dropdown.
   * Mutually preferable to categoryPath when both are set, but
   * categoryPath wins if non-empty (for the auto-create flow).
   */
  categoryId?:          string;
  /**
   * Slash-separated path. New segments are auto-created via
   * findOrCreateCategoryByPath. Wins over `categoryId` when present.
   * Phase 0.6 of v4.1-implementation-plan.md.
   */
  categoryPath?:        string;
  mvaRate?:             number;
  isActive?:            boolean;
  replacesPartNumbers?: string[];
  // ── Phase 0.7 — Condition & provenance ──────────────────────────
  /** Defaults to NEW. */
  condition?:           ProductCondition;
  /** Required when condition === USED. */
  conditionRating?:     ConditionRating | null;
  /** Free-text notes; usually only used when condition === USED. */
  conditionNotes?:      string;
  /** Defaults to AFTERMARKET on manual creation. */
  provenance?:          PartProvenance;
  // ── Admin-only metadata (NEVER returned by storefront queries) ──
  /** Cost-of-goods-sold. Used for margin reports. */
  purchasePrice?:       number;
  /** Free-form internal tags. Searchable in admin. */
  tags?:                string[];
  /** Internal notes about the product (supplier quirks, picking instructions). */
  hiddenDescription?:   string;
  /** Image URL — either a typed external link or a Supabase Storage URL
   *  returned by uploadProductImageAction. */
  mainImage?:           string;
}

export interface CreateProductResult {
  ok: boolean;
  sku?: string;
  error?: string;
  /**
   * Names of category segments newly created during this call (in
   * root-to-leaf order). Empty when `categoryPath` was not used or all
   * segments already existed. Lets the caller surface a "we created
   * X" hint to the admin.
   */
  createdCategories?: string[];
}

export async function createProductAction(
  data: CreateProductInput
): Promise<CreateProductResult> {
  if (!data.sku?.trim())  return { ok: false, error: "SKU er påkrevd." };
  if (!data.name?.trim()) return { ok: false, error: "Navn er påkrevd." };
  if (!data.priceBase || isNaN(Number(data.priceBase))) {
    return { ok: false, error: "Ugyldig pris." };
  }

  // Cross-field: USED requires a rating. Notes alone do not satisfy.
  const condition = data.condition ?? ProductCondition.NEW;
  if (condition === ProductCondition.USED && !data.conditionRating) {
    return {
      ok: false,
      error: "Tilstandsgrad er påkrevd når tilstand er Brukt.",
    };
  }

  try {
    const existing = await prisma.product.findUnique({ where: { sku: data.sku.trim() } });
    if (existing) return { ok: false, error: `SKU "${data.sku}" er allerede i bruk.` };

    const replacesPartNumbers = data.replacesPartNumbers
      ? [...new Set(data.replacesPartNumbers.map((p) => p.trim()).filter(Boolean))]
      : [];

    // Resolve category. categoryPath wins over categoryId when present.
    let categoryId: string | null = data.categoryId?.trim() || null;
    let createdCategories: string[] = [];

    const path = data.categoryPath?.trim();
    if (path) {
      try {
        const resolution = await findOrCreateCategoryByPath(path);
        categoryId = resolution.leafId;
        createdCategories = resolution.created;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ugyldig kategoristi";
        return { ok: false, error: message };
      }
    }

    const cleanedTags = data.tags
      ? [...new Set(data.tags.map((t) => t.trim()).filter(Boolean))]
      : [];

    await prisma.product.create({
      data: {
        sku:                  data.sku.trim(),
        name:                 data.name.trim(),
        priceBase:            Number(data.priceBase),
        brand:                data.brand?.trim()            || null,
        shortDescription:     data.shortDescription?.trim() || null,
        partNumber:           data.partNumber?.trim()       || null,
        categoryId,
        mvaRate:              data.mvaRate                  ?? 0.25,
        isActive:             data.isActive                 ?? true,
        replacesPartNumbers,
        condition,
        conditionRating: condition === ProductCondition.USED
          ? data.conditionRating ?? null
          : null,
        conditionNotes: data.conditionNotes?.trim() || null,
        provenance: data.provenance ?? PartProvenance.AFTERMARKET,
        // Admin-only metadata
        purchasePrice:     data.purchasePrice != null && !isNaN(Number(data.purchasePrice))
          ? Number(data.purchasePrice)
          : null,
        tags:              cleanedTags,
        hiddenDescription: data.hiddenDescription?.trim() || null,
        mainImage:         data.mainImage?.trim()         || null,
      },
    });

    // Enqueue enrichment (Phase 4). Both data + fitment enrichment run
    // inside the same job handler. Retries with backoff on failure.
    await enqueueEnrichment(data.sku.trim());

    return {
      ok: true,
      sku: data.sku.trim(),
      createdCategories: createdCategories.length > 0 ? createdCategories : undefined,
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : "Ukjent feil";
    return { ok: false, error };
  }
}

// ─── Replaces part numbers ────────────────────────────────────────────────────

/**
 * Overwrites the replacesPartNumbers array for a product.
 * Deduplicates and trims values before saving.
 */
export async function updateReplacesPartNumbersAction(
  sku: string,
  partNumbers: string[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const cleaned = [...new Set(partNumbers.map((p) => p.trim()).filter(Boolean))];
    await prisma.product.update({
      where: { sku },
      data:  { replacesPartNumbers: cleaned },
    });
    return { ok: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : "Ukjent feil";
    return { ok: false, error };
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateProductBasicAction(
  sku: string,
  data: {
    name?: string;
    shortDescription?: string;
    priceBase?: number;
    mvaRate?: number;
    isActive?: boolean;
    isDiscontinued?: boolean;
    categoryId?: string | null;
    brand?: string;
    partNumber?: string;
    minimumOrderQuantity?: number;
    leadTimeDays?: number;
    weight?: number | null;
    // Admin-only metadata
    purchasePrice?: number | null;
    tags?: string[];
    hiddenDescription?: string | null;
    mainImage?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.product.update({ where: { sku }, data });
    return { ok: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : "Ukjent feil";
    return { ok: false, error };
  }
}

// ─── Image upload ─────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export type UploadImageResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Upload a product image to Supabase Storage and return the public URL.
 *
 * Auth: STORE_MANAGER+ only — same gate as product creation/edit.
 * Validates MIME + size up front so we don't waste an upload roundtrip
 * on hopelessly oversized files.
 *
 * The bucket is created on first use (idempotent createBucket; we
 * swallow the "already exists" error). Public read so the storefront
 * can render the image without a signed URL; writes are admin-only at
 * the app layer (this server action's role gate).
 */
export async function uploadProductImageAction(
  formData: FormData,
): Promise<UploadImageResult> {
  try {
    await requireRole(UserRole.STORE_MANAGER);
  } catch {
    return { ok: false, error: "Bare admin-brukere kan laste opp produktbilder." };
  }

  const file = formData.get("file");
  const sku = String(formData.get("sku") ?? "").trim();

  if (!(file instanceof File)) {
    return { ok: false, error: "Ingen fil sendt." };
  }
  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    return {
      ok: false,
      error: `Filformat ikke støttet (${file.type}). Bruk JPEG, PNG, WebP eller GIF.`,
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Filen er for stor (${Math.round(file.size / 1024 / 1024)} MB). Maks ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
    };
  }

  const supabase = getSupabaseAdmin();

  // First-call bucket creation. Idempotent — ignore the conflict.
  try {
    await supabase.storage.createBucket(PRODUCT_IMAGES_BUCKET, {
      public: true,
      fileSizeLimit: MAX_IMAGE_BYTES,
    });
  } catch {
    // Bucket likely already exists.
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const safeSku = (sku || "noSku").replace(/[^a-z0-9-]/gi, "");
  const filename =
    `${safeSku}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(filename, bytes, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    console.error("[uploadProductImage] storage upload failed", uploadErr);
    return { ok: false, error: `Kunne ikke laste opp bildet: ${uploadErr.message}` };
  }

  const { data } = supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(filename);

  return { ok: true, url: data.publicUrl };
}
