#!/usr/bin/env bash
# Run every ETL phase in order. Exits at the first failure.
set -e
cd "$(dirname "$0")/../.."

phases=(
  phase-1-parts.ts
  phase-2-machines.ts
  phase-3-revisions.ts
  phase-4-diagrams.ts
  phase-5-partlines.ts
  phase-6-compat.ts
  phase-7-listings.ts
  phase-8-prices.ts
  verify.ts
)

started_all=$(date +%s)
for ph in "${phases[@]}"; do
  echo
  echo "============================================================"
  echo "  $(date +%T)  RUNNING: $ph"
  echo "============================================================"
  start=$(date +%s)
  npx tsx "scripts/oem-etl/$ph" 2>&1
  rc=$?
  end=$(date +%s)
  printf '\n  ▲ %s done in %ds (exit %d)\n' "$ph" "$((end - start))" "$rc"
  if [ "$rc" != "0" ]; then
    echo "  !! phase failed, stopping run-all"
    exit "$rc"
  fi
done
total_end=$(date +%s)
echo
echo "============================================================"
echo "  ALL PHASES COMPLETE — total $((total_end - started_all))s"
echo "============================================================"
