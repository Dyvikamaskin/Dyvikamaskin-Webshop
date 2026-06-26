-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OemCatalogSource" AS ENUM ('EPARTS_API', 'PDF', 'WEIDEMANN_ESERVICE', 'LSENGINEERS', 'MANUAL');

-- CreateEnum
CREATE TYPE "RevisionMode" AS ENUM ('NUMERIC', 'SERIAL_RANGE');

-- CreateEnum
CREATE TYPE "ListingSource" AS ENUM ('NEYER_EN', 'NEYER_DE', 'LSENGINEERS', 'WEIDEMANN_ESERVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "CompatSource" AS ENUM ('DHS', 'LSENGINEERS', 'EPARTS_API', 'MANUAL');

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source" "OemCatalogSource" NOT NULL,
    "displayName" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "categoryPath" JSONB,
    "parentMachineId" TEXT,
    "primaryImageUrl" TEXT,
    "summary" TEXT,
    "description" TEXT,
    "brochures" JSONB,
    "isDiscontinued" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineRevision" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "revisionTag" TEXT NOT NULL,
    "mode" "RevisionMode" NOT NULL,
    "sparePartListCode" TEXT,
    "hasBom" BOOLEAN NOT NULL DEFAULT false,
    "afCode" TEXT,
    "aiCode" TEXT,
    "serialFrom" TEXT,
    "serialTo" TEXT,
    "rawName" TEXT,
    "imageUrl" TEXT,
    "partsManualUrl" TEXT,
    "partsManualFilename" TEXT,
    "operatingManuals" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagram" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "position" INTEGER,
    "name" TEXT NOT NULL,
    "componentCode" TEXT,
    "revisionLevel" TEXT,
    "subRevisionName" TEXT,
    "diagramImageKey" TEXT,
    "diagramImageSourceId" TEXT,
    "hotspotsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Diagram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "name" TEXT NOT NULL,
    "unitOfMeasure" TEXT,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "sources" "OemCatalogSource"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartLine" (
    "diagramId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "callout" TEXT NOT NULL DEFAULT '',
    "qty" INTEGER,
    "notes" TEXT,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PartLine_pkey" PRIMARY KEY ("diagramId","partId","callout")
);

-- CreateTable
CREATE TABLE "PartListing" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "source" "ListingSource" NOT NULL,
    "externalSku" TEXT NOT NULL,
    "externalUrl" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "imageUrls" JSONB,
    "priceText" TEXT,
    "priceAmount" TEXT,
    "currency" TEXT DEFAULT 'USD',
    "leadTime" TEXT,
    "replacesOem" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "machineId" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartCompatibility" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "machineId" TEXT,
    "source" "CompatSource" NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartCompatibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartPriceSnapshot" (
    "id" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "partId" TEXT,
    "retailer" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "price" TEXT,
    "productName" TEXT,
    "productUrl" TEXT,
    "imageUrl" TEXT,
    "isCallForPrice" BOOLEAN NOT NULL DEFAULT false,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartPriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Machine_modelName_idx" ON "Machine"("modelName");

-- CreateIndex
CREATE INDEX "Machine_parentMachineId_idx" ON "Machine"("parentMachineId");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_code_source_key" ON "Machine"("code", "source");

-- CreateIndex
CREATE INDEX "MachineRevision_machineId_idx" ON "MachineRevision"("machineId");

-- CreateIndex
CREATE INDEX "MachineRevision_sparePartListCode_idx" ON "MachineRevision"("sparePartListCode");

-- CreateIndex
CREATE INDEX "MachineRevision_serialFrom_idx" ON "MachineRevision"("serialFrom");

-- CreateIndex
CREATE UNIQUE INDEX "MachineRevision_machineId_revisionTag_key" ON "MachineRevision"("machineId", "revisionTag");

-- CreateIndex
CREATE INDEX "Diagram_revisionId_idx" ON "Diagram"("revisionId");

-- CreateIndex
CREATE INDEX "Diagram_componentCode_idx" ON "Diagram"("componentCode");

-- CreateIndex
CREATE UNIQUE INDEX "Diagram_revisionId_componentCode_key" ON "Diagram"("revisionId", "componentCode");

-- CreateIndex
CREATE UNIQUE INDEX "Part_partNumber_key" ON "Part"("partNumber");

-- CreateIndex
CREATE INDEX "Part_aliases_idx" ON "Part" USING GIN ("aliases");

-- CreateIndex
CREATE INDEX "Part_name_idx" ON "Part"("name");

-- CreateIndex
CREATE INDEX "PartLine_partId_idx" ON "PartLine"("partId");

-- CreateIndex
CREATE INDEX "PartLine_diagramId_idx" ON "PartLine"("diagramId");

-- CreateIndex
CREATE INDEX "PartListing_partId_idx" ON "PartListing"("partId");

-- CreateIndex
CREATE INDEX "PartListing_machineId_idx" ON "PartListing"("machineId");

-- CreateIndex
CREATE UNIQUE INDEX "PartListing_source_externalSku_key" ON "PartListing"("source", "externalSku");

-- CreateIndex
CREATE INDEX "PartCompatibility_partId_idx" ON "PartCompatibility"("partId");

-- CreateIndex
CREATE INDEX "PartCompatibility_modelName_idx" ON "PartCompatibility"("modelName");

-- CreateIndex
CREATE INDEX "PartCompatibility_machineId_idx" ON "PartCompatibility"("machineId");

-- CreateIndex
CREATE UNIQUE INDEX "PartCompatibility_partId_modelName_source_key" ON "PartCompatibility"("partId", "modelName", "source");

-- CreateIndex
CREATE INDEX "PartPriceSnapshot_partNumber_idx" ON "PartPriceSnapshot"("partNumber");

-- CreateIndex
CREATE INDEX "PartPriceSnapshot_partId_idx" ON "PartPriceSnapshot"("partId");

-- CreateIndex
CREATE INDEX "PartPriceSnapshot_retailer_scrapedAt_idx" ON "PartPriceSnapshot"("retailer", "scrapedAt");

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_parentMachineId_fkey" FOREIGN KEY ("parentMachineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineRevision" ADD CONSTRAINT "MachineRevision_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagram" ADD CONSTRAINT "Diagram_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "MachineRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartLine" ADD CONSTRAINT "PartLine_diagramId_fkey" FOREIGN KEY ("diagramId") REFERENCES "Diagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartLine" ADD CONSTRAINT "PartLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartListing" ADD CONSTRAINT "PartListing_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartListing" ADD CONSTRAINT "PartListing_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartCompatibility" ADD CONSTRAINT "PartCompatibility_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartCompatibility" ADD CONSTRAINT "PartCompatibility_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartPriceSnapshot" ADD CONSTRAINT "PartPriceSnapshot_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;
