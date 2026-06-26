# OEM ETL: Dyvika prod → new OEM Supabase project

One-shot migration of all `Oem*` tables from the Dyvika Webshop DB
(`nxqqmplptalbxmfmbtfs`) into the new lean-schema OEM DB
(`rtzcrngduscrhgozrojv`).

## Phases (run in this exact order)

```
phase-1-parts.ts          Group 1.38M OemPart rows → ~35K canonical Part rows
                          + alias arrays. Writes part-id-map.json mapping
                          (legacy|modern partNumber) → new Part.id.

phase-2-machines.ts       Walk OemMachine, write Machine rows. Lowercase +
                          normalize modelName (strip spaces/dashes/underscores).
                          Writes machine-id-map.json.

phase-3-revisions.ts      OemMachineRevision → MachineRevision. Parse
                          revisionTag — looks like "108"/"104" → NUMERIC mode;
                          looks like "WNC*" → SERIAL_RANGE. Extract afCode,
                          aiCode, serialFrom, serialTo from rawName via regex.
                          Writes revision-id-map.json.

phase-4-diagrams.ts       OemComponent → Diagram. 1:1 mapping. Carries
                          revisionLevel, subRevisionName, hotspotsJson.
                          Writes diagram-id-map.json.

phase-5-partlines.ts      Walk OemPart again, stream 1.38M rows in batches of
                          1000. Resolve diagramId via diagram-id-map; resolve
                          partId via part-id-map. createMany into PartLine.
                          Uses (diagramId, partId, callout) PK.

phase-6-compat.ts         OemPartCompatibility → PartCompatibility. Resolve
                          partId via part-id-map (skip orphans + log).

phase-7-listings.ts       OemPartListing → PartListing. Same partId resolution.

phase-8-prices.ts         PartPriceSnapshot → PartPriceSnapshot. Resolve
                          partId where possible; leave NULL otherwise.

verify.ts                 Counts every table on both sides + spot-checks 10
                          random parts end-to-end.
```

## Running

```
# From project root, in order:
npx tsx scripts/oem-etl/phase-1-parts.ts
npx tsx scripts/oem-etl/phase-2-machines.ts
# ... etc
npx tsx scripts/oem-etl/verify.ts
```

State files (id maps) land in `scripts/oem-etl/state/`. Safe to delete
to re-run from scratch.

## Why phased + idempotent state files instead of one big script?

A phase fault doesn't waste prior work — Part deduplication is
expensive (groups 1.38M rows in memory). If phase 5 fails midway we
re-run only phase 5 with the cached part-id-map already on disk.
