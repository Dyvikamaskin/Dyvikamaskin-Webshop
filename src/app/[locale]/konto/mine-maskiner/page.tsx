import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { listSavedMachinesAction } from "@/app/actions/saved-machine";
import { MineMaskinerClient } from "./_MineMaskinerClient";

export const metadata: Metadata = {
  title: "Mine maskiner — Dyvikamaskin",
};

/**
 * /konto/mine-maskiner — Phase 0.7
 *
 * Authenticated customers maintain a list of "favourite" machines so the
 * storefront filter bar can offer one-click filtering to products that
 * fit them. Cap: 20 entries per profile (enforced server-side).
 */
export default async function MineMaskinerPage() {
  await requireAuth();

  const [saved, makes] = await Promise.all([
    listSavedMachinesAction(),
    prisma.machineMake.findMany({
      include: {
        models: {
          select: { id: true, name: true, type: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const makesForPicker = makes.map((m) => ({
    id: m.id,
    name: m.name,
    models: m.models.map((mod) => ({
      id: mod.id,
      name: mod.name,
      type: mod.type as string,
    })),
  }));

  return (
    <main
      style={{
        maxWidth: "780px",
        margin: "0 auto",
        padding: "1.5rem",
        fontFamily: "sans-serif",
      }}
    >
      <header style={{ marginBottom: "1.5rem" }}>
        <p
          style={{
            fontSize: "0.8rem",
            color: "#94a3b8",
            margin: "0 0 0.25rem",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Min konto
        </p>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Mine maskiner
        </h1>
        <p style={{ color: "#64748b", marginTop: "0.4rem", marginBottom: 0, fontSize: "0.9rem" }}>
          Lagre maskinene dine for å filtrere produkter som passer dem med
          ett klikk på produktoversikten. Du kan lagre opptil 20 maskiner.
        </p>
      </header>

      <MineMaskinerClient initialSaved={saved} makes={makesForPicker} />
    </main>
  );
}
