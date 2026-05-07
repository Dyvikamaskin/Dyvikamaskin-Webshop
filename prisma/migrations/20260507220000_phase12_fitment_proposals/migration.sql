-- Phase 12: FitmentProposal table
-- Auto-generated fitment suggestions stored for admin review.

-- CreateTable
CREATE TABLE "FitmentProposal" (
    "id" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "mentionCount" INTEGER NOT NULL DEFAULT 1,
    "sources" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FitmentProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FitmentProposal_productSku_modelId_key" ON "FitmentProposal"("productSku", "modelId");

-- AddForeignKey
ALTER TABLE "FitmentProposal" ADD CONSTRAINT "FitmentProposal_productSku_fkey"
    FOREIGN KEY ("productSku") REFERENCES "Product"("sku") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitmentProposal" ADD CONSTRAINT "FitmentProposal_modelId_fkey"
    FOREIGN KEY ("modelId") REFERENCES "MachineModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
