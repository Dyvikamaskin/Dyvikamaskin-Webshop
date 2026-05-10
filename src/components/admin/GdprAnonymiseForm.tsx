"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anonymiseCustomerAction } from "@/app/actions/gdpr";

interface Props {
  profileId: string;
  customerName: string;
}

/**
 * Two-step confirmation: admin must type the customer's name exactly
 * to enable the destructive action. Mirrors the "type X to confirm"
 * pattern used by GitHub, Stripe, etc. — guards against muscle-memory
 * clicks.
 */
export function GdprAnonymiseForm({ profileId, customerName }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const enabled = typed.trim() === customerName;

  function handleAnonymise() {
    if (!enabled) return;
    setError(null);
    startTransition(async () => {
      const r = await anonymiseCustomerAction(profileId);
      if (!r.ok) {
        setError(r.error ?? "Anonymisering feilet");
        return;
      }
      router.push("/admin/kunder");
    });
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1.25rem 1.5rem" }}>
      <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "#475569" }}>
        Skriv inn kundens fulle navn (<code style={{ background: "#f1f5f9", padding: "0 0.3rem", borderRadius: "3px" }}>{customerName}</code>) for å bekrefte:
      </p>
      <input
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        style={{
          width: "100%",
          padding: "0.55rem 0.75rem",
          border: "1px solid #e2e8f0",
          borderRadius: "6px",
          fontSize: "0.9rem",
          marginBottom: "0.875rem",
        }}
      />
      <button
        onClick={handleAnonymise}
        disabled={!enabled || pending}
        style={{
          padding: "0.6rem 1.4rem",
          background: enabled && !pending ? "#dc2626" : "#e2e8f0",
          color: enabled && !pending ? "#fff" : "#94a3b8",
          border: "none",
          borderRadius: "6px",
          fontSize: "0.9rem",
          fontWeight: 700,
          cursor: enabled && !pending ? "pointer" : "not-allowed",
        }}
      >
        {pending ? "Anonymiserer …" : "Anonymiser kunde permanent"}
      </button>
      {error ? (
        <p style={{ color: "#dc2626", fontSize: "0.85rem", marginTop: "0.6rem" }}>{error}</p>
      ) : null}
    </div>
  );
}
