import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";
import CutoffForm from "./_CutoffForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Butikkinnstillinger — Admin" };

export default async function ButikkPage() {
  await requireRole(UserRole.STORE_MANAGER);

  const stores = await prisma.store.findMany({
    where:   { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id:                     true,
      name:                   true,
      address:                true,
      postalCode:             true,
      city:                   true,
      phone:                  true,
      email:                  true,
      batchCutoffMorgen:      true,
      batchCutoffEttermiddag: true,
    },
  });

  return (
    <div style={{ padding: "2rem", maxWidth: "900px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: "0 0 0.25rem" }}>
        Butikkinnstillinger
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "2rem" }}>
        Konfigurer kuttetider for morgenbatch og ettermiddagsbatch per butikk/lager.
      </p>

      {stores.map((store) => (
        <div
          key={store.id}
          style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "1.5rem", overflow: "hidden" }}
        >
          {/* Store header */}
          <div style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "1rem 1.25rem" }}>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>{store.name}</h2>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
              {store.address} · {store.postalCode} {store.city}
            </p>
            <p style={{ margin: "0.15rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
              {store.phone} · {store.email}
            </p>
          </div>

          {/* Cutoff form */}
          <div style={{ padding: "1.25rem" }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "0.8rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Batch-kuttetider
            </h3>
            <p style={{ margin: "0 0 1rem", fontSize: "0.8rem", color: "#64748b" }}>
              Ordrer som legges inn <strong>før morgentid</strong> havner i morgenbatchen.
              Ordrer etter morgen men <strong>før ettermiddagstid</strong> havner i ettermiddagsbatchen.
              Ordrer etter ettermiddagstid tildeles morgenbatchen neste dag.
            </p>
            <CutoffForm
              storeId={store.id}
              initialMorgen={store.batchCutoffMorgen}
              initialEttermiddag={store.batchCutoffEttermiddag}
            />
          </div>
        </div>
      ))}

      {stores.length === 0 && (
        <p style={{ color: "#94a3b8", textAlign: "center", padding: "3rem" }}>
          Ingen aktive butikker/lagre funnet.
        </p>
      )}
    </div>
  );
}
