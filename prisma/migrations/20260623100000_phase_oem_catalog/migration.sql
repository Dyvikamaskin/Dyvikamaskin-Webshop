-- Phase OEM Catalog
--
-- Adds the manufacturer-reference parts catalog. Schema is generic
-- (Oem* prefix) so the same shape ingests Volvo / JCB / Caterpillar
-- later — initial population is from shop.wackerneuson.com eParts +
-- extracted PDF parts books.
--
-- Five new tables: OemMachine, OemMachineRevision, OemComponent,
-- OemPart, PartPriceSnapshot. One enum: OemCatalogSource. One
-- back-relation column on MachineMake (oemMachines).
--
-- The Product / MachineModel / ProductFitment tables are NOT touched.
-- The OEM catalog is admin-side reference data, not the sellable
-- storefront catalog. Cross-link from sellable Products to OEM part
-- numbers is via the existing Product.partNumber +
-- Product.replacesPartNumbers[] columns.

-- CreateEnum
CREATE TYPE "OemCatalogSource" AS ENUM ('EPARTS_API', 'PDF', 'MANUAL');

-- CreateTable
CREATE TABLE "OemMachine" (
    "id"                  TEXT NOT NULL,
    "code"                TEXT NOT NULL,
    "name"                TEXT NOT NULL,
    "makeId"              TEXT,
    "categoryPath"        JSONB,
    "parentMachineCode"   TEXT,
    "source"              "OemCatalogSource" NOT NULL,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OemMachine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OemMachineRevision" (
    "id"          TEXT NOT NULL,
    "machineId"   TEXT NOT NULL,
    "revision"    TEXT NOT NULL,
    "name"        TEXT,
    "hasBomTree"  BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OemMachineRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OemComponent" (
    "id"                    TEXT NOT NULL,
    "revisionId"            TEXT NOT NULL,
    "position"              INTEGER,
    "name"                  TEXT NOT NULL,
    "componentCode"         TEXT,
    "revisionLevel"         TEXT,
    "subRevisionName"       TEXT,
    "diagramImageFilename"  TEXT,
    "diagramImageSourceId"  TEXT,
    "hotspotsJson"          JSONB,

    CONSTRAINT "OemComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OemPart" (
    "id"              TEXT NOT NULL,
    "componentId"     TEXT NOT NULL,
    "calloutNumber"   TEXT,
    "partNumber"      TEXT NOT NULL,
    "partName"        TEXT NOT NULL,
    "qty"             INTEGER,
    "unitOfMeasure"   TEXT,
    "isRecommended"   BOOLEAN NOT NULL DEFAULT false,
    "notes"           TEXT,

    CONSTRAINT "OemPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartPriceSnapshot" (
    "id"             TEXT NOT NULL,
    "partNumber"     TEXT NOT NULL,
    "retailer"       TEXT NOT NULL,
    "currency"       TEXT NOT NULL DEFAULT 'USD',
    "price"          TEXT,
    "productName"    TEXT,
    "productUrl"     TEXT,
    "imageUrl"       TEXT,
    "isCallForPrice" BOOLEAN NOT NULL DEFAULT false,
    "scrapedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartPriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OemMachine_code_source_key" ON "OemMachine"("code", "source");
CREATE INDEX "OemMachine_makeId_idx" ON "OemMachine"("makeId");
CREATE INDEX "OemMachine_code_idx" ON "OemMachine"("code");
CREATE INDEX "OemMachine_parentMachineCode_idx" ON "OemMachine"("parentMachineCode");

CREATE UNIQUE INDEX "OemMachineRevision_machineId_revision_key" ON "OemMachineRevision"("machineId", "revision");
CREATE INDEX "OemMachineRevision_machineId_idx" ON "OemMachineRevision"("machineId");

CREATE UNIQUE INDEX "OemComponent_revisionId_componentCode_key" ON "OemComponent"("revisionId", "componentCode");
CREATE INDEX "OemComponent_revisionId_idx" ON "OemComponent"("revisionId");
CREATE INDEX "OemComponent_componentCode_idx" ON "OemComponent"("componentCode");

CREATE INDEX "OemPart_componentId_idx" ON "OemPart"("componentId");
CREATE INDEX "OemPart_partNumber_idx" ON "OemPart"("partNumber");

CREATE INDEX "PartPriceSnapshot_partNumber_idx" ON "PartPriceSnapshot"("partNumber");
CREATE INDEX "PartPriceSnapshot_retailer_scrapedAt_idx" ON "PartPriceSnapshot"("retailer", "scrapedAt");
CREATE INDEX "PartPriceSnapshot_partNumber_retailer_idx" ON "PartPriceSnapshot"("partNumber", "retailer");

-- AddForeignKey
ALTER TABLE "OemMachine" ADD CONSTRAINT "OemMachine_makeId_fkey"
    FOREIGN KEY ("makeId") REFERENCES "MachineMake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OemMachineRevision" ADD CONSTRAINT "OemMachineRevision_machineId_fkey"
    FOREIGN KEY ("machineId") REFERENCES "OemMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OemComponent" ADD CONSTRAINT "OemComponent_revisionId_fkey"
    FOREIGN KEY ("revisionId") REFERENCES "OemMachineRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OemPart" ADD CONSTRAINT "OemPart_componentId_fkey"
    FOREIGN KEY ("componentId") REFERENCES "OemComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
