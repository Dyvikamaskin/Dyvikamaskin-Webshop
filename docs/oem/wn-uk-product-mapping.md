# Wacker Neuson UK Product Mapping

Source: https://www.wackerneuson.co.uk/products (walked 2026-06-29)

**Legend:**
- DB ✓ = Machine row exists in local OEM DB (`oem_catalog`)
- BOM ✓ = Has diagram + parts data ingested
- `*` = Electric / zero-emission model (no combustion BOM, likely excluded from LS ingest)
- `†` = New model (added to UK site, not yet in DB)

---

## Excavators — Mini (up to 6 t)

| Model   | DB  | BOM (diagrams) | Notes                         |
|---------|-----|----------------|-------------------------------|
| ET08    | ✓   | —              | 0 revisions — needs LS ingest |
| EZ10e*  | ✓   | —              | Electric                      |
| ET16    | ✓   | ✓ (41)         | LS Engineers ✓                |
| EZ17    | ✓   | ✓ (36)         | LS Engineers ✓                |
| EZ17e*  | ✓   | ✓ (33)         | EZ17e has LS data             |
| ET18    | ✓   | ✓ (46)         | LS Engineers ✓                |
| ET20    | ✓   | ✓ (45)         | LS Engineers ✓ (7 machines)   |
| ET24    | ✓   | ✓ (43)         | LS Engineers ✓                |
| ET25†   | —   | —              | New model — not in DB yet     |
| EZ26e*  | ✓   | —              | Electric                      |
| EZ26    | ✓   | ✓ (41)         | LS Engineers ✓                |
| ET35    | ✓   | ✓ (48)         | LS Engineers ✓                |
| EZ36    | ✓   | ✓ (41)         | LS Engineers ✓                |
| ET42    | ✓   | ✓ (48)         | LS Engineers ✓                |
| EZ50    | ✓   | ✓ (44)         | LS Engineers ✓                |

## Excavators — Tracked (6–15 t)

| Model   | DB  | BOM (diagrams) | Notes                          |
|---------|-----|----------------|--------------------------------|
| ET58    | ✓   | ✓ (47)         | LS Engineers ✓                 |
| ET65    | ✓   | ✓ (54/55)      | LS — 2 engine variants         |
| EZ80    | ✓   | ✓ (47)         | LS Engineers ✓                 |
| ET90    | ✓   | ✓ (58)         | LS Engineers ✓                 |
| ET145   | ✓   | ✓ (39/41)      | LS — 2 engine variants         |

## Excavators — Wheeled

| Model   | DB  | BOM (diagrams) | Notes                          |
|---------|-----|----------------|--------------------------------|
| EW65    | ✓   | ✓ (56)         | LS — 2 engine variants         |
| EW100   | ✓   | ✓ (57)         | LS Engineers ✓                 |

---

## Wheel Loaders

All wheel loaders are in DB but **no BOM data yet** (Phase 2 LS ingest pending).

| Model    | DB  | BOM | Notes                |
|----------|-----|-----|----------------------|
| WL20e*   | ✓   | —   | Electric             |
| WL20     | ✓   | —   |                      |
| WL300e*  | ✓   | —   | Electric             |
| WL25     | ✓   | —   | 0 revisions in DB    |
| WL28e*   | ✓   | —   | Electric             |
| WL28     | ✓   | —   |                      |
| WL750    | ✓   | —   | 0 revisions in DB    |
| WL38     | ✓   | —   |                      |
| WL950    | ✓   | —   | 0 revisions in DB    |
| WL52     | ✓   | —   |                      |
| WL1150   | ✓   | —   | 0 revisions in DB    |
| WL60     | ✓   | —   |                      |
| WL70     | ✓   | —   |                      |

---

## Telehandlers

| Model    | DB  | BOM | Notes                |
|----------|-----|-----|----------------------|
| TH412e*  | ✓   | —   | Electric             |
| TH412    | ✓   | —   | 6 machine codes in DB|
| TH625    | ✓   | —   |                      |

---

## Dumpers — Wheel Dumpers

| Model    | DB  | BOM | Notes                |
|----------|-----|-----|----------------------|
| DW10     | ✓   | —   | 0 revisions in DB    |
| DW15e*   | ✓   | —   | Electric             |
| DW15     | ✓   | —   | 0 revisions in DB    |
| DW20     | ✓   | —   |                      |
| DW30     | ✓   | —   |                      |
| DW40     | ✓   | —   |                      |
| DW50     | ✓   | —   |                      |
| DW60     | ✓   | —   |                      |
| DW90     | ✓   | —   |                      |

## Dumpers — Dual View

| Model    | DB  | BOM | Notes                |
|----------|-----|-----|----------------------|
| DV45     | ✓   | —   |                      |
| DV60     | ✓   | —   |                      |
| DV90     | ✓   | —   |                      |
| DV100    | ✓   | —   |                      |
| DV125    | ✓   | —   |                      |

---

## Summary

| Category          | UK models | In DB | Has BOM |
|-------------------|-----------|-------|---------|
| Mini excavators   | 15        | 14    | 11      |
| Tracked 6-15t     | 5         | 5     | 5       |
| Wheeled exc.      | 2         | 2     | 2       |
| **Excavators**    | **22**    | **21**| **18**  |
| Wheel loaders     | 13        | 13    | 0       |
| Telehandlers      | 3         | 3     | 0       |
| Wheel dumpers     | 9         | 9     | 0       |
| Dual view dumpers | 5         | 5     | 0       |
| **Total**         | **52**    | **51**| **18**  |

## Gaps to address

1. **ET25** — New model not in DB. Add Machine row before LS ingest.
2. **ET08** — In DB but 0 revisions and no BOM. Check if LS Engineers has data.
3. **Phase 2 LS ingest** — Wheel loaders (10 diesel), telehandlers (TH412, TH625), all dumpers (DW + DV series) — all in DB with 0 diagrams.
4. **Electric models** (EZ10e, EZ26e, WL20e, WL300e, WL28e, TH412e, DW15e) — LS Engineers unlikely to cover these. May need alternative BOM source or mark as "no BOM available".
5. **DW10, DW15, WL25, WL750, WL950, WL1150** — 0 revisions in DB; likely need Machine rows refreshed or they exist under different codes.
