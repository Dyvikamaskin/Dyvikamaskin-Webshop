# Legacy ↔ Modern SAP cross-reference build

- Distinct (legacy, modern) pairs: **49,365**
- Distinct modern SKUs mapped:     **48,464**
- Distinct legacy SKUs mapped:     **38,044**

## 80 'unknown' stocked SKUs — resolution

| Metric | Count |
|---|---:|
| With ≥1 legacy candidate via mapping | 4 / 80 |
| Legacy is in the 2 user PDFs | 0 / 80 |
| Legacy is somewhere in wn_parts.sqlite (313 PDFs) | 2 / 80 |

## Pairs by source signal

| Source | Pair count |
|---|---:|
| `retailer:dhs_klevu:co-occur` | 33,384 |
| `retailer:hydrotech` | 15,939 |
| `retailer:dhs_klevu` | 477 |
| `retailer:dhs:co-occur` | 96 |
| `retailer:hydrotech:co-occur` | 39 |
| `retailer:contractorsdirect:co-occur` | 27 |
| `retailer:danseusa:co-occur` | 24 |
| `retailer:dhs` | 20 |
| `inventory:co-occur` | 8 |
| `inventory:X-prefix` | 8 |
| `retailer:tmsequip_full:co-occur` | 1 |

See `sku_legacy_modern_map.csv` for every pair, `sku_legacy_modern_map.json` for the indexed lookup, and `unknowns_5xxx_resolved.csv` for the gap-resolution detail.