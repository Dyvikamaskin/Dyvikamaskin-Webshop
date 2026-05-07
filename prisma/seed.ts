import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // ─── Stores ─────────────────────────────────────────────────────────────────
  const store = await prisma.store.upsert({
    where: { id: "store-dyvikamaskin-1" },
    update: {},
    create: {
      id: "store-dyvikamaskin-1",
      name: "Dyvikamaskin",
      address: "Dyvika 1",
      postalCode: "1580",
      city: "Rygge",
      phone: "+47 69 26 00 00",
      email: "post@dyvikamaskin.no",
      batchCutoffMorgen: "11:00",
      batchCutoffEttermiddag: "15:00",
      isActive: true,
    },
  });

  console.log("✓ Store:", store.name);

  // ─── Categories ──────────────────────────────────────────────────────────────
  const categories = [
    { id: "cat-hydraulikk",    name: "Hydraulikk",            slug: "hydraulikk",            displayOrder: 1 },
    { id: "cat-pneumatikk",    name: "Pneumatikk",            slug: "pneumatikk",            displayOrder: 2 },
    { id: "cat-elektrisk",     name: "Elektriske komponenter", slug: "elektriske-komponenter", displayOrder: 3 },
    { id: "cat-lagre",         name: "Lagre og ledd",         slug: "lagre-og-ledd",         displayOrder: 4 },
    { id: "cat-tetninger",     name: "Tetninger",             slug: "tetninger",             displayOrder: 5 },
    { id: "cat-verktoy",       name: "Verktøy",               slug: "verktoy",               displayOrder: 6 },
    { id: "cat-smoring",       name: "Smøring",               slug: "smoring",               displayOrder: 7 },
    { id: "cat-drivverk",      name: "Drivverk",              slug: "drivverk",              displayOrder: 8 },
  ];

  for (const cat of categories) {
    const created = await prisma.category.upsert({
      where: { id: cat.id },
      update: {},
      create: cat,
    });
    console.log("✓ Category:", created.name);
  }

  // ─── Sub-categories (leaf nodes for products) ────────────────────────────────
  const subCategories = [
    { id: "cat-hydraulikk-pumper",   name: "Pumper",          slug: "hydraulikk-pumper",   parentId: "cat-hydraulikk", displayOrder: 1 },
    { id: "cat-hydraulikk-sylindre", name: "Sylindre",        slug: "hydraulikk-sylindre", parentId: "cat-hydraulikk", displayOrder: 2 },
    { id: "cat-hydraulikk-ventiler", name: "Ventiler",        slug: "hydraulikk-ventiler", parentId: "cat-hydraulikk", displayOrder: 3 },
    { id: "cat-pneumatikk-ventiler", name: "Ventiler",        slug: "pneumatikk-ventiler", parentId: "cat-pneumatikk", displayOrder: 1 },
    { id: "cat-pneumatikk-sylindre", name: "Sylindre",        slug: "pneumatikk-sylindre", parentId: "cat-pneumatikk", displayOrder: 2 },
    { id: "cat-lagre-kule",          name: "Kulelager",       slug: "kulelager",           parentId: "cat-lagre",     displayOrder: 1 },
    { id: "cat-lagre-rulle",         name: "Rullelager",      slug: "rullelager",          parentId: "cat-lagre",     displayOrder: 2 },
    { id: "cat-tetninger-o-ringer",  name: "O-ringer",        slug: "o-ringer",            parentId: "cat-tetninger", displayOrder: 1 },
    { id: "cat-tetninger-packninger", name: "Packninger",     slug: "packninger",          parentId: "cat-tetninger", displayOrder: 2 },
  ];

  for (const cat of subCategories) {
    const created = await prisma.category.upsert({
      where: { id: cat.id },
      update: {},
      create: cat,
    });
    console.log("✓ Sub-category:", created.name);
  }

  console.log("\n✅ Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
