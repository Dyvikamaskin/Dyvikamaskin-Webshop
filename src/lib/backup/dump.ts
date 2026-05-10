/**
 * Postgres SQL dump — Phase 4.5
 *
 * Produces a streamable byte stream of SQL INSERT statements for every
 * table in the public schema. The output is compatible with `psql -f`
 * for restoration: it disables FK enforcement at the start
 * (`SET session_replication_role = replica`), inserts every row, then
 * resets the replication role at the end.
 *
 * This is not a full pg_dump (it doesn't include schema DDL — that lives
 * in `prisma/migrations/` and is the source of truth). Restore procedure
 * is documented in docs/restore-runbook.md and assumes:
 *
 *   1. A fresh database with all migrations applied (matching commit's
 *      `prisma/migrations/` set).
 *   2. `psql -f decrypted_backup.sql DATABASE_URL` to load this dump's
 *      data on top of the migrated schema.
 *
 * Streaming: rows are read via a server-side cursor (pg-cursor) so we
 * never load a whole table into memory.
 */
import { Client, types as pgTypes } from "pg";
import Cursor from "pg-cursor";

const BATCH_SIZE = 200;

/**
 * The order in which tables are dumped. Lexically sorted, but FK
 * dependencies are handled by the `SET session_replication_role = replica`
 * line at the top of the dump.
 *
 * If a new model is added to the schema, it MUST be added here too —
 * otherwise the backup silently misses it. The test in dump.test.ts
 * cross-references this list against information_schema.
 */
export const BACKED_UP_TABLES = [
  "_prisma_migrations",
  "AuditLog",
  "Category",
  "FitmentProposal",
  "InvoiceCounter",
  "MachineMake",
  "MachineModel",
  "Notification",
  "PriceHistory",
  "Product",
  "ProductDraft",
  "ProductEnrichmentProposal",
  "ProductFitment",
  "ProductRequest",
  "Profile",
  "Promotion",
  "Sale",
  "SaleItem",
  "SavedMachine",
  "StockReservation",
  "StockTransfer",
  "StocktakeItem",
  "StocktakeSession",
  "Store",
  "StoreStaff",
  "StoreStock",
  "WebhookEvent",
] as const;

/**
 * Build a streaming SQL dump of every backed-up table.
 *
 * @returns a ReadableStream of UTF-8 encoded bytes containing the SQL.
 *          Caller is responsible for piping it through age encryption
 *          before exposing to the network.
 */
export function buildDumpStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const url = process.env.DATABASE_URL;
      if (!url) {
        controller.error(new Error("DATABASE_URL not set"));
        return;
      }

      const client = new Client({ connectionString: url });
      try {
        await client.connect();

        const writeLine = (s: string) =>
          controller.enqueue(encoder.encode(s + "\n"));

        writeLine("-- IndustriParts backup");
        writeLine(`-- Generated at: ${new Date().toISOString()}`);
        writeLine("-- Generator: phase-4.5-backup-mvp");
        writeLine("--");
        writeLine("-- Restore: psql -f <decrypted.sql> $DATABASE_URL");
        writeLine("-- Prereq: schema migrated to a state matching this dump.");
        writeLine("--");
        writeLine("BEGIN;");
        writeLine("SET session_replication_role = replica;");
        writeLine("");

        for (const table of BACKED_UP_TABLES) {
          await dumpTable(client, table, writeLine);
        }

        writeLine("");
        writeLine("SET session_replication_role = origin;");
        writeLine("COMMIT;");
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        await client.end().catch(() => {});
      }
    },
  });
}

async function dumpTable(
  client: Client,
  table: string,
  writeLine: (s: string) => void,
): Promise<void> {
  // Ask Postgres for the column list in the correct order.
  const colsRes = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table],
  );
  if (colsRes.rows.length === 0) return; // table missing — skip silently
  const cols = colsRes.rows.map((r) => r.column_name);
  const colsList = cols.map(quoteIdent).join(", ");

  writeLine(`-- ${table}`);

  const cursor = client.query(
    new Cursor(`SELECT ${colsList} FROM ${quoteIdent(table)}`),
  );

  try {
    let batch: Record<string, unknown>[] = await cursor.read(BATCH_SIZE);
    while (batch.length > 0) {
      for (const row of batch) {
        const values = cols.map((c) => formatLiteral(row[c]));
        writeLine(
          `INSERT INTO ${quoteIdent(table)} (${colsList}) VALUES (${values.join(", ")});`,
        );
      }
      batch = await cursor.read(BATCH_SIZE);
    }
  } finally {
    await new Promise<void>((resolve) => cursor.close(() => resolve()));
  }
}

// ─── Internals ────────────────────────────────────────────────────────────────

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Format a JS value as a Postgres SQL literal. Handles the types pg
 * emits by default for the columns we care about: string, number,
 * boolean, Date, Buffer, null, and arrays.
 */
function formatLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") return quoteString(value);
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return quoteString(value.toISOString());
  if (Buffer.isBuffer(value)) return `'\\x${value.toString("hex")}'`;
  if (Array.isArray(value)) {
    // PG array literal — works for text[], int[], etc.
    return quoteString(`{${value.map(arrayElem).join(",")}}`);
  }
  // Fall through: object → JSON literal (Json columns in Prisma).
  return quoteString(JSON.stringify(value));
}

function arrayElem(v: unknown): string {
  if (v === null) return "NULL";
  if (typeof v === "string") return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return String(v);
}

function quoteString(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

// ensure pg returns numeric/bigint columns as JS numbers/strings rather than
// the pg default of strings for some types — avoids losing precision on
// Decimal columns in particular by leaving them as strings.
pgTypes.setTypeParser(20, (v) => v); // bigint → string
pgTypes.setTypeParser(1700, (v) => v); // numeric/decimal → string
