import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import { processEnrichmentJob, type EnrichmentJobData } from "@/lib/queue/enrichment";

const mocks = vi.hoisted(() => ({
  enrichProductDirectly:        vi.fn(),
  runFitmentEnrichmentForProduct: vi.fn(),
}));

vi.mock("@/lib/product-enrichment", () => ({
  enrichProductDirectly: mocks.enrichProductDirectly,
}));

vi.mock("@/lib/fitment-enrichment", () => ({
  runFitmentEnrichmentForProduct: mocks.runFitmentEnrichmentForProduct,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function fakeJob(sku: string): Job<EnrichmentJobData> {
  return { data: { sku } } as unknown as Job<EnrichmentJobData>;
}

describe("processEnrichmentJob", () => {
  it("runs both enrichment functions for the given SKU", async () => {
    mocks.enrichProductDirectly.mockResolvedValue(undefined);
    mocks.runFitmentEnrichmentForProduct.mockResolvedValue(undefined);

    await processEnrichmentJob(fakeJob("SKU-A"));

    expect(mocks.enrichProductDirectly).toHaveBeenCalledWith("SKU-A");
    expect(mocks.runFitmentEnrichmentForProduct).toHaveBeenCalledWith("SKU-A");
  });

  it("rethrows if data enrichment fails (fitment can still have run)", async () => {
    mocks.enrichProductDirectly.mockRejectedValue(new Error("upstream 503"));
    mocks.runFitmentEnrichmentForProduct.mockResolvedValue(undefined);

    await expect(processEnrichmentJob(fakeJob("SKU-B"))).rejects.toThrow("upstream 503");
    // Sanity: both were attempted (allSettled, not all)
    expect(mocks.enrichProductDirectly).toHaveBeenCalled();
    expect(mocks.runFitmentEnrichmentForProduct).toHaveBeenCalled();
  });

  it("rethrows if fitment enrichment fails", async () => {
    mocks.enrichProductDirectly.mockResolvedValue(undefined);
    mocks.runFitmentEnrichmentForProduct.mockRejectedValue(
      new Error("fitment LLM timeout"),
    );

    await expect(processEnrichmentJob(fakeJob("SKU-C"))).rejects.toThrow(
      "fitment LLM timeout",
    );
  });

  it("succeeds quietly when both halves resolve", async () => {
    mocks.enrichProductDirectly.mockResolvedValue(undefined);
    mocks.runFitmentEnrichmentForProduct.mockResolvedValue(undefined);

    await expect(processEnrichmentJob(fakeJob("SKU-D"))).resolves.toBeUndefined();
  });
});
