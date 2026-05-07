"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useCustomerTypeStore, type CustomerTypeValue } from "@/lib/stores/use-customer-type";
import { setCustomerTypeAction } from "@/app/actions/customer-type";
import { validateOrgNumber } from "@/lib/brreg";

type Step = "select" | "business";

interface BrregResult {
  orgNumber: string;
  name: string;
  address?: string;
}

/**
 * Full-screen blocking entry modal.
 * Shown on first visit until the customer selects CONSUMER or BUSINESS.
 * Must not be dismissable — no close button, no backdrop click.
 *
 * @param initialType — value from the server-side cookie (null = not set)
 */
export function EntryModal({
  initialType,
}: {
  initialType: CustomerTypeValue | null;
}) {
  const { isEntryModalOpen, hydrate, setCustomerType } =
    useCustomerTypeStore();
  const t = useTranslations("customerType");

  // Hydrate Zustand from server cookie on first mount
  useEffect(() => {
    hydrate(initialType);
  }, [initialType, hydrate]);

  const [step, setStep] = useState<Step>("select");
  const [orgInput, setOrgInput] = useState("");
  const [orgError, setOrgError] = useState("");
  const [brregResult, setBrregResult] = useState<BrregResult | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isEntryModalOpen) return null;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleSelectConsumer() {
    startTransition(async () => {
      await setCustomerTypeAction("CONSUMER");
      setCustomerType("CONSUMER");
    });
  }

  function handleSelectBusiness() {
    setStep("business");
  }

  function handleOrgChange(value: string) {
    setOrgInput(value);
    setOrgError("");
    setBrregResult(null);
  }

  async function handleOrgLookup() {
    const clean = orgInput.replace(/[\s-]/g, "");

    if (!validateOrgNumber(clean)) {
      setOrgError("Ugyldig organisasjonsnummer. Kontroller at du har tastet riktig.");
      return;
    }

    setOrgError("");
    startTransition(async () => {
      const res = await fetch(`/api/brreg/${clean}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setOrgError(body.error ?? "Selskapet ble ikke funnet i Brønnøysundregistrene.");
        return;
      }
      const data: BrregResult = await res.json();
      setBrregResult(data);
    });
  }

  async function handleConfirmBusiness() {
    if (!brregResult) return;
    startTransition(async () => {
      await setCustomerTypeAction("BUSINESS", {
        orgNumber: brregResult.orgNumber,
        companyName: brregResult.name,
      });
      setCustomerType("BUSINESS");
    });
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "0.75rem",
          padding: "2rem",
          maxWidth: "480px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        {step === "select" && (
          <>
            <h2
              id="entry-modal-title"
              style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}
            >
              Velkommen til Dyvikamaskin
            </h2>
            <p style={{ color: "#555", marginBottom: "1.5rem" }}>
              {t("selectType")}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                onClick={handleSelectConsumer}
                disabled={isPending}
                style={cardButtonStyle}
              >
                <strong>🏠 {t("consumer")}</strong>
                <span style={{ fontSize: "0.85rem", color: "#666" }}>
                  {t("consumerDescription")}
                </span>
              </button>

              <button
                onClick={handleSelectBusiness}
                disabled={isPending}
                style={cardButtonStyle}
              >
                <strong>🏢 {t("business")}</strong>
                <span style={{ fontSize: "0.85rem", color: "#666" }}>
                  {t("businessDescription")}
                </span>
              </button>
            </div>
          </>
        )}

        {step === "business" && (
          <>
            <button
              onClick={() => { setStep("select"); setBrregResult(null); setOrgError(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#555", marginBottom: "1rem", padding: 0 }}
            >
              ← Tilbake
            </button>

            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Bedriftskunde
            </h2>
            <p style={{ color: "#555", marginBottom: "1.25rem" }}>
              Skriv inn organisasjonsnummeret ditt for å bekrefte bedriften.
            </p>

            {!brregResult ? (
              <>
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>
                  Organisasjonsnummer
                </label>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <input
                    type="text"
                    placeholder="000 000 000"
                    value={orgInput}
                    onChange={(e) => handleOrgChange(e.target.value)}
                    maxLength={11}
                    style={inputStyle}
                    onKeyDown={(e) => e.key === "Enter" && handleOrgLookup()}
                  />
                  <button
                    onClick={handleOrgLookup}
                    disabled={isPending || !orgInput.trim()}
                    style={primaryButtonStyle}
                  >
                    {isPending ? "Søker..." : "Søk"}
                  </button>
                </div>
                {orgError && (
                  <p style={{ color: "#c00", fontSize: "0.875rem" }}>{orgError}</p>
                )}
              </>
            ) : (
              <>
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #86efac",
                    borderRadius: "0.5rem",
                    padding: "1rem",
                    marginBottom: "1rem",
                  }}
                >
                  <p style={{ fontWeight: 700, marginBottom: "0.25rem" }}>{brregResult.name}</p>
                  <p style={{ color: "#555", fontSize: "0.875rem" }}>
                    Org.nr. {brregResult.orgNumber}
                  </p>
                  {brregResult.address && (
                    <p style={{ color: "#555", fontSize: "0.875rem" }}>{brregResult.address}</p>
                  )}
                </div>
                <p style={{ marginBottom: "1rem", fontSize: "0.875rem", color: "#444" }}>
                  Er dette din bedrift?
                </p>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={handleConfirmBusiness}
                    disabled={isPending}
                    style={{ ...primaryButtonStyle, flex: 1 }}
                  >
                    {isPending ? "Bekrefter..." : "Ja, bekreft"}
                  </button>
                  <button
                    onClick={() => { setBrregResult(null); setOrgInput(""); }}
                    style={{ ...secondaryButtonStyle, flex: 1 }}
                  >
                    Endre
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Inline styles (replaced by Tailwind in Phase 5 UI pass) ─────────────────

const cardButtonStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.25rem",
  padding: "1rem 1.25rem",
  border: "2px solid #e5e7eb",
  borderRadius: "0.5rem",
  background: "#fff",
  cursor: "pointer",
  width: "100%",
  textAlign: "left",
  transition: "border-color 0.15s",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "0.5rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
  fontSize: "1rem",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "0.5rem 1.25rem",
  background: "#1d4ed8",
  color: "#fff",
  border: "none",
  borderRadius: "0.375rem",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.875rem",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "0.5rem 1.25rem",
  background: "#fff",
  color: "#374151",
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.875rem",
};
