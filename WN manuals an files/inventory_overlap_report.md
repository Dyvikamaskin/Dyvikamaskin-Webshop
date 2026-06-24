# Inventory DM-WN — overlap with our catalog and retailer scrapes

Source file: `C:\Users\Public\Documents\Inventory DM-WN.xlsx`

Sheets scanned: 'Vareopptellingskladder'

## Inventory size

- Unique SKU-shaped values: **2,371**
- Rows with a SKU: **2,555**

### SKU shape breakdown

| Shape | Count |
|---|---:|
| `10d_5xxx` | 1,276 |
| `10d_1xxx` | 1,094 |
| `07d_legacy_0xxx` | 1 |

## Coverage

| Reference set | Size | In inventory | % of inventory |
|---|---:|---:|---:|
| OEM catalog (DB) | 44,894 | 783 | 33.0% |
| Retailer union | 178,667 | 2,082 | 87.8% |
| Neyer 45K (Weidemann/Kramer) | 45,584 | 410 | 17.3% |
| Weidemann sample | 2,313 | 124 | 5.2% |
| **No match anywhere** | — | **241** | **10.2%** |

## Per-retailer overlap with inventory

| Retailer | SKUs | In inventory | % of inv |
|---|---:|---:|---:|
| `wn_dhs_klevu.csv` | 144,274 | 2,006 | 84.6% |
| `neyer_45k_sitemap` | 45,584 | 410 | 17.3% |
| `wn_neyer.csv` | 25,000 | 335 | 14.1% |
| `wn_tmsequip_full.csv` | 10,000 | 285 | 12.0% |
| `wn_danseusa.csv` | 17,491 | 234 | 9.9% |
| `wn_russopower.csv` | 1,214 | 228 | 9.6% |
| `wn_hydrotech.csv` | 24,983 | 71 | 3.0% |
| `wn_equipmentshare.csv` | 370 | 36 | 1.5% |
| `wn_dhs.csv` | 595 | 28 | 1.2% |
| `wn_tmsequip.csv` | 72 | 16 | 0.7% |
| `wn_contractorsdirect.csv` | 116 | 14 | 0.6% |
| `wn_tiendamamsa.csv` | 29 | 7 | 0.3% |
| `wn_everestpartssupplies.csv` | 1 | 0 | 0.0% |

## Outputs

- `inventory_matched.csv` — every inventory SKU + tags showing which sources carry it
- `inventory_unmatched.csv` — SKUs not found in OEM, any retailer, or Weidemann sample
- `inventory_overlap_report.json` — full numbers