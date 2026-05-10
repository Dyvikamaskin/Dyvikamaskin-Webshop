import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import { processNotificationJob, type NotificationJobData } from "@/lib/queue/notifications";

// Each notify* function lives in either notification-service or invoice-service.
// We mock both modules so the dispatcher's switch can be exercised without
// touching Prisma, the email service, or the PDF renderer.
const mocks = vi.hoisted(() => ({
  notifyOrderConfirmed:    vi.fn(),
  notifyShipped:           vi.fn(),
  notifyReadyForPickup:    vi.fn(),
  checkAndNotifyLowStock:  vi.fn(),
  sendInvoiceNotification: vi.fn(),
}));

vi.mock("@/lib/notification-service", () => ({
  notifyOrderConfirmed:   mocks.notifyOrderConfirmed,
  notifyShipped:          mocks.notifyShipped,
  notifyReadyForPickup:   mocks.notifyReadyForPickup,
  checkAndNotifyLowStock: mocks.checkAndNotifyLowStock,
}));

vi.mock("@/lib/invoice-service", () => ({
  sendInvoiceNotification: mocks.sendInvoiceNotification,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function fakeJob(data: NotificationJobData): Job<NotificationJobData> {
  return { data } as unknown as Job<NotificationJobData>;
}

describe("processNotificationJob", () => {
  it("dispatches order-confirmed", async () => {
    await processNotificationJob(fakeJob({ kind: "order-confirmed", saleId: "s1" }));
    expect(mocks.notifyOrderConfirmed).toHaveBeenCalledWith("s1");
    expect(mocks.notifyShipped).not.toHaveBeenCalled();
  });

  it("dispatches shipped", async () => {
    await processNotificationJob(fakeJob({ kind: "shipped", saleId: "s2" }));
    expect(mocks.notifyShipped).toHaveBeenCalledWith("s2");
  });

  it("dispatches ready-for-pickup", async () => {
    await processNotificationJob(fakeJob({ kind: "ready-for-pickup", saleId: "s3" }));
    expect(mocks.notifyReadyForPickup).toHaveBeenCalledWith("s3");
  });

  it("dispatches low-stock with the full productIds list", async () => {
    await processNotificationJob(
      fakeJob({ kind: "low-stock", storeId: "store-A", productIds: ["p1", "p2", "p3"] }),
    );
    expect(mocks.checkAndNotifyLowStock).toHaveBeenCalledWith("store-A", ["p1", "p2", "p3"]);
  });

  it("dispatches invoice-issued with all five arguments preserved", async () => {
    const dueDate = new Date("2026-06-01T00:00:00Z");
    await processNotificationJob(
      fakeJob({
        kind: "invoice-issued",
        saleId: "s4",
        invoiceNumber: "2026-000042",
        kidNumber: "20260000420",
        invoiceDueDate: dueDate,
        dueDays: 14,
      }),
    );
    expect(mocks.sendInvoiceNotification).toHaveBeenCalledWith(
      "s4",
      "2026-000042",
      "20260000420",
      dueDate,
      14,
    );
  });

  it("propagates errors so BullMQ records the failure and retries", async () => {
    mocks.notifyShipped.mockRejectedValueOnce(new Error("smtp down"));
    await expect(
      processNotificationJob(fakeJob({ kind: "shipped", saleId: "s-err" })),
    ).rejects.toThrow("smtp down");
  });
});
