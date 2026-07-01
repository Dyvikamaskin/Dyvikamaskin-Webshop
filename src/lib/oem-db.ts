// OEM-catalog Prisma client. Points at the separate Supabase project
// (rtzcrngduscrhgozrojv) that hosts the lean schema (Machine /
// MachineRevision / Diagram / Part / PartLine / etc.).
//
// Mirrors the singleton-with-hot-reload pattern in src/lib/prisma.ts.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/oem-prisma/client";

const createOemPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.OEM_DATABASE_URL! }),
  });

const globalForOemPrisma = globalThis as unknown as { oemPrisma: PrismaClient };

export const oemPrisma =
  globalForOemPrisma.oemPrisma ?? createOemPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForOemPrisma.oemPrisma = oemPrisma;
}
