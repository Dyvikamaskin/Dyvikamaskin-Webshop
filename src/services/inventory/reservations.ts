/**
 * Stock reservations — Phase 3
 *
 * Soft-holds stock for the payment window. A row in StockReservation
 * represents `quantity` units of `productId` at `storeId` reserved for
 * `sessionId` (= Sale.checkoutSessionId), expiring at `expiresAt`.
 *
 * Concurrency model: each reserveStock call runs in a Serializable
 * transaction, so the read-and-insert is atomic. Postgres retries
 * conflicting transactions automatically. Under high contention this
 * can be revisited (advisory locks or SELECT … FOR UPDATE on
 * StoreStock), but Serializable is the right default for the load
 * profile this project expects.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma as PrismaTypes } from "@/app/generated/prisma/client";

const DEFAULT_TTL_MINUTES = 15;

export interface ReserveStockItem {
  productId: string;
  storeId: string;
  quantity: number;
}

export type ReserveStockResult =
  | { ok: true; reservationIds: string[] }
  | { ok: false; error: "INSUFFICIENT_STOCK"; productId: string; storeId: string };

/**
 * Reserve stock for a checkout session. Atomic: either every item is
 * reserved or none. Returns INSUFFICIENT_STOCK on the first item that
 * cannot be honored — the failing item is named in the result.
 */
export async function reserveStock(
  sessionId: string,
  items: ReserveStockItem[],
  ttlMinutes: number = DEFAULT_TTL_MINUTES,
): Promise<ReserveStockResult> {
  if (items.length === 0) return { ok: true, reservationIds: [] };

  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  return prisma.$transaction(
    async (tx) => {
      const reservationIds: string[] = [];
      for (const item of items) {
        const available = await readAvailable(tx, item.productId, item.storeId);
        if (available < item.quantity) {
          // Throwing rolls the transaction back so partial reservations
          // never linger when one item fails.
          throw new InsufficientStockError(item.productId, item.storeId);
        }
        const reservation = await tx.stockReservation.create({
          data: {
            sessionId,
            productId: item.productId,
            storeId: item.storeId,
            quantity: item.quantity,
            expiresAt,
          },
          select: { id: true },
        });
        reservationIds.push(reservation.id);
      }
      return { ok: true as const, reservationIds };
    },
    { isolationLevel: "Serializable" },
  ).catch((err) => {
    if (err instanceof InsufficientStockError) {
      return {
        ok: false as const,
        error: "INSUFFICIENT_STOCK" as const,
        productId: err.productId,
        storeId: err.storeId,
      };
    }
    throw err;
  });
}

/**
 * Available stock for a product at a store: total on-hand minus the
 * sum of non-expired reservations.
 */
export async function getAvailableStock(
  productId: string,
  storeId: string,
): Promise<number> {
  return readAvailable(prisma, productId, storeId);
}

/**
 * Release every reservation for a checkout session. Idempotent —
 * harmless to call after capture or cancellation.
 */
export async function releaseReservations(
  sessionId: string,
  tx?: PrismaTypes.TransactionClient,
): Promise<number> {
  const client = tx ?? prisma;
  const result = await client.stockReservation.deleteMany({
    where: { sessionId },
  });
  return result.count;
}

/**
 * Link existing reservations to the Sale row that was created for them.
 * Called from initiateCheckoutAction after Sale rows are written.
 */
export async function attachReservationsToSale(
  sessionId: string,
  storeId: string,
  saleId: string,
  tx?: PrismaTypes.TransactionClient,
): Promise<number> {
  const client = tx ?? prisma;
  const result = await client.stockReservation.updateMany({
    where: { sessionId, storeId, saleId: null },
    data: { saleId },
  });
  return result.count;
}

/**
 * Extend reservations for a session to a new expiry. Used when
 * AUTHORIZED arrives from Vipps — payment is committed pending
 * dispatch, so the soft hold becomes a longer-lived hold.
 */
export async function extendReservations(
  sessionId: string,
  ttlMinutes: number,
  tx?: PrismaTypes.TransactionClient,
): Promise<number> {
  const client = tx ?? prisma;
  const newExpiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  const result = await client.stockReservation.updateMany({
    where: { sessionId },
    data: { expiresAt: newExpiresAt },
  });
  return result.count;
}

/**
 * Sweep expired reservations. Returns the number of rows removed.
 * Called from /api/jobs/expire-reservations on a cron tick.
 */
export async function expireReservations(): Promise<number> {
  const result = await prisma.stockReservation.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

// ─── Internals ────────────────────────────────────────────────────────────────

class InsufficientStockError extends Error {
  constructor(
    public readonly productId: string,
    public readonly storeId: string,
  ) {
    super(`Insufficient stock for product ${productId} at store ${storeId}`);
    this.name = "InsufficientStockError";
  }
}

async function readAvailable(
  client: PrismaTypes.TransactionClient | typeof prisma,
  productId: string,
  storeId: string,
): Promise<number> {
  const [stock, reservedAgg] = await Promise.all([
    client.storeStock.findUnique({
      where: { productId_storeId: { productId, storeId } },
      select: { quantity: true },
    }),
    client.stockReservation.aggregate({
      where: { productId, storeId, expiresAt: { gt: new Date() } },
      _sum: { quantity: true },
    }),
  ]);
  const onHand = stock?.quantity ?? 0;
  const reserved = reservedAgg._sum.quantity ?? 0;
  return Math.max(0, onHand - reserved);
}
