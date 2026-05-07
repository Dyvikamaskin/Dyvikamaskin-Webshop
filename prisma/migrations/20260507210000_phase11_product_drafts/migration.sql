-- CreateEnum
CREATE TYPE "ProductDraftStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProductRequestStatus" AS ENUM ('PENDING', 'IN_ENRICHMENT', 'ADDED', 'REJECTED');

-- CreateTable
CREATE TABLE "ProductDraft" (
    "id" TEXT NOT NULL,
    "scannedCode" TEXT NOT NULL,
    "suggestedSku" TEXT,
    "suggestedName" TEXT,
    "suggestedBrand" TEXT,
    "suggestedDesc" TEXT,
    "suggestedImage" TEXT,
    "enrichmentData" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "status" "ProductDraftStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRequest" (
    "id" TEXT NOT NULL,
    "scannedCode" TEXT NOT NULL,
    "draftId" TEXT,
    "requestedById" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "status" "ProductRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "ProductRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProductDraft" ADD CONSTRAINT "ProductDraft_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRequest" ADD CONSTRAINT "ProductRequest_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "ProductDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRequest" ADD CONSTRAINT "ProductRequest_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
