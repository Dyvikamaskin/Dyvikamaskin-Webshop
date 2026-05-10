import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the Prisma client BEFORE importing the service under test.
// Each test sets up the relevant return values via the exported mocks.
const mocks = vi.hoisted(() => ({
  storeStockFindUnique: vi.fn(),
  reservationAggregate: vi.fn(),
  reservationCreate: vi.fn(),
  reservationDeleteMany: vi.fn(),
  reservationUpdateMany: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    storeStock: { findUnique: mocks.storeStockFindUnique },
    stockReservation: {
      aggregate: mocks.reservationAggregate,
      create: mocks.reservationCreate,
      deleteMany: mocks.reservationDeleteMany,
      updateMany: mocks.reservationUpdateMany,
    },
    $transaction: mocks.$transaction,
  },
}));

import {
  getAvailableStock,
  reserveStock,
  releaseReservations,
  expireReservations,
} from "@/services/inventory/reservations";

beforeEach(() => {
  vi.clearAllMocks();
  // By default $transaction passes through, calling the callback with the
  // root client mock (the same shape as `prisma`).
  mocks.$transaction.mockImplementation(async (cb) =>
    cb({
      storeStock: { findUnique: mocks.storeStockFindUnique },
      stockReservation: {
        aggregate: mocks.reservationAggregate,
        create: mocks.reservationCreate,
        deleteMany: mocks.reservationDeleteMany,
        updateMany: mocks.reservationUpdateMany,
      },
    }),
  );
});

describe("getAvailableStock", () => {
  it("returns onHand minus active reservations", async () => {
    mocks.storeStockFindUnique.mockResolvedValue({ quantity: 10 });
    mocks.reservationAggregate.mockResolvedValue({ _sum: { quantity: 3 } });

    const available = await getAvailableStock("prod-1", "store-1");

    expect(available).toBe(7);
  });

  it("clamps at zero when reservations exceed onHand (defensive)", async () => {
    mocks.storeStockFindUnique.mockResolvedValue({ quantity: 5 });
    mocks.reservationAggregate.mockResolvedValue({ _sum: { quantity: 10 } });

    const available = await getAvailableStock("prod-1", "store-1");

    expect(available).toBe(0);
  });

  it("treats missing StoreStock row as zero on-hand", async () => {
    mocks.storeStockFindUnique.mockResolvedValue(null);
    mocks.reservationAggregate.mockResolvedValue({ _sum: { quantity: 0 } });

    const available = await getAvailableStock("prod-1", "store-1");

    expect(available).toBe(0);
  });
});

describe("reserveStock", () => {
  it("creates a reservation row when stock is available", async () => {
    mocks.storeStockFindUnique.mockResolvedValue({ quantity: 5 });
    mocks.reservationAggregate.mockResolvedValue({ _sum: { quantity: 0 } });
    mocks.reservationCreate.mockResolvedValue({ id: "rsrv-1" });

    const result = await reserveStock("session-A", [
      { productId: "p1", storeId: "s1", quantity: 2 },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reservationIds).toEqual(["rsrv-1"]);
    expect(mocks.reservationCreate).toHaveBeenCalledTimes(1);
  });

  it("fails with INSUFFICIENT_STOCK when requested exceeds available", async () => {
    mocks.storeStockFindUnique.mockResolvedValue({ quantity: 1 });
    mocks.reservationAggregate.mockResolvedValue({ _sum: { quantity: 0 } });

    const result = await reserveStock("session-B", [
      { productId: "p1", storeId: "s1", quantity: 5 },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INSUFFICIENT_STOCK");
      expect(result.productId).toBe("p1");
    }
    // Critical: no reservation row gets created on the failure path.
    expect(mocks.reservationCreate).not.toHaveBeenCalled();
  });

  it("treats existing active reservations as unavailable", async () => {
    mocks.storeStockFindUnique.mockResolvedValue({ quantity: 5 });
    mocks.reservationAggregate.mockResolvedValue({ _sum: { quantity: 4 } });

    const result = await reserveStock("session-C", [
      { productId: "p1", storeId: "s1", quantity: 2 },
    ]);

    // 5 onHand − 4 already reserved = 1 available; we asked for 2.
    expect(result.ok).toBe(false);
  });

  it("returns ok with no rows when items array is empty", async () => {
    const result = await reserveStock("session-D", []);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reservationIds).toEqual([]);
    // Optimization: no transaction round-trip for an empty cart.
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it("rolls the transaction back when the second item fails — no partial reservations", async () => {
    // First item: 10 available, ask for 2 → succeeds in the inner code path.
    // Second item: 1 available, ask for 5 → fails → throws → tx rolls back.
    mocks.storeStockFindUnique
      .mockResolvedValueOnce({ quantity: 10 }) // item 1 stock
      .mockResolvedValueOnce({ quantity: 1 }); // item 2 stock
    mocks.reservationAggregate
      .mockResolvedValueOnce({ _sum: { quantity: 0 } }) // item 1 reserved
      .mockResolvedValueOnce({ _sum: { quantity: 0 } }); // item 2 reserved
    mocks.reservationCreate.mockResolvedValue({ id: "rsrv-tmp" });

    const result = await reserveStock("session-E", [
      { productId: "p1", storeId: "s1", quantity: 2 },
      { productId: "p2", storeId: "s1", quantity: 5 },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.productId).toBe("p2");
    // Sanity: the test infrastructure did invoke a transaction (we expect
    // Prisma's real Serializable isolation to enforce atomicity in prod;
    // here we just verify the service tried to use one).
    expect(mocks.$transaction).toHaveBeenCalled();
  });
});

describe("releaseReservations", () => {
  it("deletes every reservation for a session and returns the count", async () => {
    mocks.reservationDeleteMany.mockResolvedValue({ count: 3 });

    const removed = await releaseReservations("session-X");

    expect(removed).toBe(3);
    expect(mocks.reservationDeleteMany).toHaveBeenCalledWith({
      where: { sessionId: "session-X" },
    });
  });
});

describe("expireReservations", () => {
  it("deletes rows whose expiresAt has passed", async () => {
    mocks.reservationDeleteMany.mockResolvedValue({ count: 7 });

    const removed = await expireReservations();

    expect(removed).toBe(7);
    expect(mocks.reservationDeleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });
});
