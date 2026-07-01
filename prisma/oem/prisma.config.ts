// Prisma config for the OEM-catalog schema (lives in a separate Supabase
// project: rtzcrngduscrhgozrojv). Pass this explicitly to every OEM-side
// prisma CLI command:
//   npx prisma migrate dev   --config prisma/oem/prisma.config.ts
//   npx prisma generate      --config prisma/oem/prisma.config.ts
//   npx prisma db execute    --config prisma/oem/prisma.config.ts --file ...
//
// Without --config, prisma auto-loads the root prisma.config.ts which
// targets the Dyvika prod DB (DATABASE_URL/DIRECT_URL). Do not confuse them.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "schema.prisma",
  migrations: {
    path: "migrations",
  },
  datasource: {
    url: process.env["OEM_DATABASE_URL"],
    // @ts-expect-error — directUrl is valid at runtime; Prisma 7 types omit it
    directUrl: process.env["OEM_DIRECT_URL"],
  },
});
