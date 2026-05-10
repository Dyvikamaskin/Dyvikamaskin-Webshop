import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import {
  processMaintenanceJob,
  type MaintenanceJobData,
} from "@/lib/queue/maintenance";

// The dispatcher lazy-imports @/services/inventory/reservations. Mock it
// so the test never touches Prisma.
const mocks = vi.hoisted(() => ({
  expireReservations: vi.fn(),
}));

vi.mock("@/services/inventory/reservations", () => ({
  expireReservations: mocks.expireReservations,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function fakeJob(data: MaintenanceJobData): Job<MaintenanceJobData> {
  return { data } as unknown as Job<MaintenanceJobData>;
}

describe("processMaintenanceJob", () => {
  it("dispatches expire-reservations to the reservations service", async () => {
    mocks.expireReservations.mockResolvedValueOnce(0);
    await processMaintenanceJob(fakeJob({ kind: "expire-reservations" }));
    expect(mocks.expireReservations).toHaveBeenCalledOnce();
  });

  it("propagates errors so BullMQ records the failure and retries", async () => {
    mocks.expireReservations.mockRejectedValueOnce(new Error("db down"));
    await expect(
      processMaintenanceJob(fakeJob({ kind: "expire-reservations" })),
    ).rejects.toThrow("db down");
  });

  it("survives a successful sweep that removed rows (info log only, no throw)", async () => {
    mocks.expireReservations.mockResolvedValueOnce(42);
    await expect(
      processMaintenanceJob(fakeJob({ kind: "expire-reservations" })),
    ).resolves.toBeUndefined();
  });
});
