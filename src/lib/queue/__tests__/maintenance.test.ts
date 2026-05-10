import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import {
  processMaintenanceJob,
  type MaintenanceJobData,
} from "@/lib/queue/maintenance";

// The dispatcher lazy-imports its handlers. Mock both lazy targets so
// the dispatch tests never touch Prisma, age-encryption, or Storage.
const mocks = vi.hoisted(() => ({
  expireReservations: vi.fn(),
  runScheduledBackup:  vi.fn(),
}));

vi.mock("@/services/inventory/reservations", () => ({
  expireReservations: mocks.expireReservations,
}));

vi.mock("@/lib/backup/scheduled-backup", () => ({
  runScheduledBackup: mocks.runScheduledBackup,
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
    expect(mocks.runScheduledBackup).not.toHaveBeenCalled();
  });

  it("propagates expire-reservations errors so BullMQ records the failure and retries", async () => {
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

  it("dispatches daily-backup to runScheduledBackup", async () => {
    mocks.runScheduledBackup.mockResolvedValueOnce({
      status: "SUCCESS",
      backupRunId: "br-1",
      storagePath: "2026/05/10/backup.sql.age",
      bytesWritten: 1024,
    });
    await processMaintenanceJob(fakeJob({ kind: "daily-backup" }));
    expect(mocks.runScheduledBackup).toHaveBeenCalledOnce();
    expect(mocks.expireReservations).not.toHaveBeenCalled();
  });

  it("propagates daily-backup errors so the failure is recorded and reportJobFailure fires", async () => {
    mocks.runScheduledBackup.mockRejectedValueOnce(new Error("storage 500"));
    await expect(
      processMaintenanceJob(fakeJob({ kind: "daily-backup" })),
    ).rejects.toThrow("storage 500");
  });

  it("does not throw when daily-backup returns SKIPPED (no admin with key)", async () => {
    mocks.runScheduledBackup.mockResolvedValueOnce({
      status: "SKIPPED",
      backupRunId: "br-2",
      errorMessage: "No SUPER_ADMIN with backupPublicKey configured.",
    });
    await expect(
      processMaintenanceJob(fakeJob({ kind: "daily-backup" })),
    ).resolves.toBeUndefined();
  });
});
