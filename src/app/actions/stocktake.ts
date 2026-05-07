"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  UserRole,
  StocktakeStatus,
} from "@/app/generated/prisma/enums";

export type StocktakeResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

// ─── Create session ───────────────────────────────────────────────────────────

/**
 * Creates a new stocktake session for the given store.
 * Pre-populates items from current StoreStock so staff see
 * expected quantities and location codes upfront.
 */
export async function createStocktakeSessionAction(
  storeId: string,
  isBlind: boolean
): Promise<StocktakeResult> {
  const staff = await requireRole(UserRole.FULFILLMENT_STAFF);

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true },
  });
  if (!store) return { ok: false, error: "Butikk ikke funnet." };

  // Only one open/in-progress session per store at a time
  const existing = await prisma.stocktakeSession.findFirst({
    where: {
      storeId,
      status: { in: [StocktakeStatus.OPEN, StocktakeStatus.IN_PROGRESS] },
    },
  });
  if (existing) {
    return {
      ok: false,
      error: "Det finnes allerede en åpen varetelling for dette lageret.",
    };
  }

  // Load all active stock lines for the store
  const stockLines = await prisma.storeStock.findMany({
    where: { storeId, product: { isActive: true } },
    select: { id: true, productId: true, quantity: true },
  });

  if (stockLines.length === 0) {
    return { ok: false, error: "Ingen aktive produkter på dette lageret." };
  }

  const session = await prisma.stocktakeSession.create({
    data: {
      storeId,
      createdById: staff.id,
      isBlind,
      status: StocktakeStatus.OPEN,
      // Pre-populate items (counted = 0, discrepancy = 0 initially)
      items: {
        create: stockLines.map((s) => ({
          productId:        s.productId,
          expectedQuantity: s.quantity,
          countedQuantity:  0,
          discrepancy:      -s.quantity, // will be recalculated when scanned
          scannedById:      staff.id,    // placeholder; updated on actual scan
        })),
      },
    },
  });

  await logAudit(staff.id, "STOCKTAKE_CREATED", "StocktakeSession", session.id, null, {
    storeId,
    isBlind,
    itemCount: stockLines.length,
  });

  revalidatePath("/admin/stocktake");
  return { ok: true, id: session.id };
}

// ─── Record scan ──────────────────────────────────────────────────────────────

/**
 * Records or updates the counted quantity for one product in a session.
 * Can be called repeatedly — the last scan wins.
 *
 * @param sessionId
 * @param productId   Resolved from scanned SKU before calling
 * @param counted     Physically counted quantity
 */
export async function recordScanAction(
  sessionId: string,
  productId: string,
  counted: number
): Promise<StocktakeResult> {
  const staff = await requireRole(UserRole.FULFILLMENT_STAFF);

  if (counted < 0) return { ok: false, error: "Antall kan ikke være negativt." };

  const session = await prisma.stocktakeSession.findUnique({
    where: { id: sessionId },
    select: { status: true, storeId: true },
  });
  if (!session) return { ok: false, error: "Økt ikke funnet." };
  if (
    session.status === StocktakeStatus.COMPLETED ||
    session.status === StocktakeStatus.PENDING_REVIEW
  ) {
    return { ok: false, error: "Kan ikke endre en avsluttet eller ferdig varetelling." };
  }

  // Find existing item
  const item = await prisma.stocktakeItem.findFirst({
    where: { sessionId, productId },
    select: { id: true, expectedQuantity: true },
  });

  if (!item) {
    // Product not originally in session — add it (unexpected find)
    await prisma.stocktakeItem.create({
      data: {
        sessionId,
        productId,
        expectedQuantity: 0,
        countedQuantity:  counted,
        discrepancy:      counted,
        scannedById:      staff.id,
      },
    });
  } else {
    await prisma.stocktakeItem.update({
      where: { id: item.id },
      data: {
        countedQuantity: counted,
        discrepancy:     counted - item.expectedQuantity,
        scannedById:     staff.id,
        scannedAt:       new Date(),
      },
    });
  }

  // Auto-advance to IN_PROGRESS on first scan
  if (session.status === StocktakeStatus.OPEN) {
    await prisma.stocktakeSession.update({
      where: { id: sessionId },
      data:  { status: StocktakeStatus.IN_PROGRESS },
    });
  }

  revalidatePath(`/admin/stocktake/${sessionId}`);
  return { ok: true };
}

// ─── Advance status ───────────────────────────────────────────────────────────

/**
 * Move a session to PENDING_REVIEW (all scans done)
 * or back to IN_PROGRESS (corrections needed).
 */
export async function advanceStocktakeStatusAction(
  sessionId: string,
  status: "PENDING_REVIEW" | "IN_PROGRESS"
): Promise<StocktakeResult> {
  const staff = await requireRole(UserRole.STORE_MANAGER);

  const session = await prisma.stocktakeSession.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });
  if (!session) return { ok: false, error: "Økt ikke funnet." };

  await prisma.stocktakeSession.update({
    where: { id: sessionId },
    data: { status },
  });

  await logAudit(staff.id, "STOCKTAKE_STATUS_CHANGED", "StocktakeSession", sessionId,
    { status: session.status }, { status });

  revalidatePath(`/admin/stocktake/${sessionId}`);
  revalidatePath("/admin/stocktake");
  return { ok: true };
}

// ─── Complete + apply ─────────────────────────────────────────────────────────

/**
 * Finalises the stocktake and writes adjustments to StoreStock quantities.
 * Only STORE_MANAGER+ may apply adjustments.
 */
export async function finaliseStocktakeAction(
  sessionId: string
): Promise<StocktakeResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  const session = await prisma.stocktakeSession.findUnique({
    where: { id: sessionId },
    include: {
      items: {
        select: {
          productId:       true,
          countedQuantity: true,
          discrepancy:     true,
        },
      },
      store: { select: { id: true } },
    },
  });

  if (!session) return { ok: false, error: "Økt ikke funnet." };
  if (session.status !== StocktakeStatus.PENDING_REVIEW) {
    return {
      ok: false,
      error: "Kun økter med status «Til gjennomgang» kan godkjennes.",
    };
  }

  // Apply counted quantities to StoreStock in one transaction
  await prisma.$transaction([
    ...session.items
      .filter((i) => i.discrepancy !== 0)
      .map((i) =>
        prisma.storeStock.updateMany({
          where: { storeId: session.store.id, productId: i.productId },
          data:  { quantity: i.countedQuantity },
        })
      ),
    prisma.stocktakeSession.update({
      where: { id: sessionId },
      data:  { status: StocktakeStatus.COMPLETED, completedAt: new Date() },
    }),
  ]);

  const adjustedCount = session.items.filter((i) => i.discrepancy !== 0).length;

  await logAudit(admin.id, "STOCKTAKE_COMPLETED", "StocktakeSession", sessionId, null, {
    adjustedProducts: adjustedCount,
  });

  revalidatePath(`/admin/stocktake/${sessionId}`);
  revalidatePath("/admin/stocktake");
  return { ok: true };
}

// ─── Form-action wrappers ─────────────────────────────────────────────────────

export async function advanceToReviewFormAction(
  sessionId: string,
  _fd: FormData
): Promise<void> {
  await advanceStocktakeStatusAction(sessionId, "PENDING_REVIEW");
}

export async function finaliseStocktakeFormAction(
  sessionId: string,
  _fd: FormData
): Promise<void> {
  await finaliseStocktakeAction(sessionId);
}
