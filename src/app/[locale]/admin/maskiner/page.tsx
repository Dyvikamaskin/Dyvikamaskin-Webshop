import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { MachineType } from "@/app/generated/prisma/enums";

export const metadata: Metadata = { title: "Maskiner & Modeller — Admin" };

const TYPE_LABELS: Record<MachineType, string> = {
  EXCAVATOR: "Gravemaskin",
  MINI_EXCAVATOR: "Minigraver",
  WHEEL_LOADER: "Hjullaster",
  ARTICULATED_HAULER: "Dumper",
  BULLDOZER: "Bulldoser",
  MOTOR_GRADER: "Motorgrader",
  COMPACTOR: "Komprimator",
  TELEHANDLER: "Teleskoplaster",
  CRANE: "Kran",
  BACKHOE_LOADER: "Bakgraver",
  SKID_STEER: "Kompaktlaster",
  PIPELAYER: "Rørlegger",
  FORKLIFT: "Gaffeltruck",
  OTHER: "Annet",
};

export default async function MaskinerPage() {
  const makes = await prisma.machineMake.findMany({
    orderBy: { name: "asc" },
    include: {
      models: {
        orderBy: { name: "asc" },
      },
    },
  });

  return (
    <div style={{ padding: "2rem", maxWidth: "1100px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: "0 0 0.4rem" }}>
        Maskiner &amp; Modeller
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "2rem" }}>
        Oversikt over alle fabrikater og tilhørende maskinmodeller som brukes i tilpasningstabell.
      </p>

      {/* ── Makes table ────────────────────────────────────────────────────── */}
      {makes.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>Ingen fabrikater registrert ennå.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {makes.map((make) => {
            // Group models by type
            const byType: Record<string, typeof make.models> = {};
            for (const model of make.models) {
              if (!byType[model.type]) byType[model.type] = [];
              byType[model.type].push(model);
            }

            return (
              <details
                key={make.id}
                style={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  overflow: "hidden",
                }}
              >
                <summary
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.875rem 1.25rem",
                    cursor: "pointer",
                    userSelect: "none",
                    listStyle: "none",
                    background: "#f8fafc",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: "1rem", color: "#0f172a", flex: 1 }}>
                    {make.name}
                  </span>
                  <code
                    style={{
                      fontSize: "0.75rem",
                      background: "#f1f5f9",
                      padding: "0.15rem 0.5rem",
                      borderRadius: "4px",
                      color: "#64748b",
                    }}
                  >
                    {make.slug}
                  </code>
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#64748b",
                      background: "#e2e8f0",
                      padding: "0.2rem 0.6rem",
                      borderRadius: "999px",
                      fontWeight: 600,
                    }}
                  >
                    {make.models.length} modeller
                  </span>
                </summary>

                {make.models.length === 0 ? (
                  <p style={{ padding: "1rem 1.25rem", color: "#94a3b8", fontSize: "0.875rem", margin: 0 }}>
                    Ingen modeller registrert for dette fabrikatet.
                  </p>
                ) : (
                  <div style={{ padding: "1rem 1.25rem" }}>
                    {Object.entries(byType).map(([type, models]) => (
                      <div key={type} style={{ marginBottom: "1rem" }}>
                        <h3
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: "#64748b",
                            margin: "0 0 0.5rem",
                          }}
                        >
                          {TYPE_LABELS[type as MachineType] ?? type}
                        </h3>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                          {models.map((model) => (
                            <div
                              key={model.id}
                              style={{
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                borderRadius: "6px",
                                padding: "0.375rem 0.75rem",
                                fontSize: "0.875rem",
                                color: "#1e293b",
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>{model.name}</span>
                              {model.series && (
                                <span style={{ color: "#94a3b8", marginLeft: "0.4rem", fontSize: "0.8rem" }}>
                                  {model.series}
                                </span>
                              )}
                              {(model.yearFrom || model.yearTo) && (
                                <span style={{ color: "#94a3b8", marginLeft: "0.4rem", fontSize: "0.75rem" }}>
                                  ({model.yearFrom ?? "?"}&ndash;{model.yearTo ?? "nå"})
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </details>
            );
          })}
        </div>
      )}

      {/* ── Add make (placeholder) ────────────────────────────────────────── */}
      <section
        style={{
          marginTop: "2.5rem",
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "1.25rem",
        }}
      >
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a", margin: "0 0 0.5rem" }}>
          Legg til fabrikat
        </h2>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748b" }}>
          Bruk API eller kontakt admin for å legge til nye fabrikater.
        </p>
      </section>

      {/* ── Add model (placeholder) ───────────────────────────────────────── */}
      <section
        style={{
          marginTop: "1rem",
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "1.25rem",
        }}
      >
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a", margin: "0 0 0.5rem" }}>
          Legg til modell
        </h2>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748b" }}>
          Bruk API eller kontakt admin for å legge til nye modeller under et fabrikat.
        </p>
      </section>
    </div>
  );
}
