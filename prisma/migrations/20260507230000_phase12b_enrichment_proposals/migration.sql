-- Phase 12b: ProductEnrichmentProposal table
-- Stores enrichment suggestions for existing products, pending admin approval.
-- Never auto-applied — admin must explicitly accept or dismiss each field.

-- CreateTable
CREATE TABLE "ProductEnrichmentProposal" (
    "id" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "suggestedName" TEXT,
    "suggestedBrand" TEXT,
    "suggestedDesc" TEXT,
    "suggestedImage" TEXT,
    "sources" JSONB NOT NULL,
    "enrichmentData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductEnrichmentProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique: one pending proposal per product)
CREATE UNIQUE INDEX "ProductEnrichmentProposal_productSku_key" ON "ProductEnrichmentProposal"("productSku");

-- AddForeignKey
ALTER TABLE "ProductEnrichmentProposal" ADD CONSTRAINT "ProductEnrichmentProposal_productSku_fkey"
    FOREIGN KEY ("productSku") REFERENCES "Product"("sku") ON DELETE CASCADE ON UPDATE CASCADE;
