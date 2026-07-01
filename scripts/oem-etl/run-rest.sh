#!/usr/bin/env bash
# Run phases 5-8 + verify after phases 1-4 have completed.
set -e
cd "$(dirname "$0")/../.."

for ph in phase-5-partlines phase-6-compat phase-7-listings phase-8-prices verify; do
  echo
  echo "============================================================"
  echo "  $(date +%T)  RUNNING: $ph"
  echo "============================================================"
  start=$(date +%s)
  npx tsx "scripts/oem-etl/$ph.ts" 2>&1
  rc=$?
  end=$(date +%s)
  printf '\n  ▲ %s done in %ds (exit %d)\n' "$ph" "$((end - start))" "$rc"
  if [ "$rc" != "0" ]; then
    echo "  !! phase failed, stopping run-rest"
    exit "$rc"
  fi
done
echo
echo "ALL REMAINING PHASES COMPLETE"
