"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSupplierAction,
  updateSupplierAction,
  type SupplierInput,
} from "@/app/actions/suppliers";

interface Props {
  mode: "create" | "edit";
  id?: string;
  initial?: SupplierInput;
}

export function SupplierForm({ mode, id, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initial?.name ?? "");
  const [orgNumber, setOrgNumber] = useState(initial?.orgNumber ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const data: SupplierInput = {
      name,
      orgNumber: orgNumber || undefined,
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      postalCode: postalCode || undefined,
      city: city || undefined,
      notes: notes || undefined,
      isActive,
    };
    startTransition(async () => {
      const r = mode === "create"
        ? await createSupplierAction(data)
        : await updateSupplierAction(id!, data);
      if (!r.ok) {
        setError(r.error ?? "Ukjent feil");
        return;
      }
      router.push("/admin/leverandorer");
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1.5rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
        <Field label="Navn *">
          <input required value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder="F.eks. Parker Hannifin Norway AS" />
        </Field>
        <Field label="Orgnr">
          <input value={orgNumber} onChange={(e) => setOrgNumber(e.target.value)} style={input} placeholder="9 sifre" />
        </Field>
        <Field label="E-post">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} placeholder="ordrer@..." />
        </Field>
        <Field label="Telefon">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={input} />
        </Field>
        <Field label="Adresse" full>
          <input value={address} onChange={(e) => setAddress(e.target.value)} style={input} />
        </Field>
        <Field label="Postnr">
          <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} style={input} />
        </Field>
        <Field label="Poststed">
          <input value={city} onChange={(e) => setCity(e.target.value)} style={input} />
        </Field>
        <Field label="Notater" full>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="F.eks. ledetid, kontaktperson, betalingsbetingelser"
            style={{ ...input, resize: "vertical", fontFamily: "inherit" }}
          />
        </Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span style={{ fontSize: "0.875rem" }}>Aktiv leverandør (vises i produktoppsettet)</span>
      </label>
      <button
        type="submit"
        disabled={pending}
        style={{
          padding: "0.6rem 1.4rem",
          background: pending ? "#e2e8f0" : "#0f172a",
          color: pending ? "#94a3b8" : "#fff",
          border: "none",
          borderRadius: "6px",
          fontSize: "0.9rem",
          fontWeight: 700,
          cursor: pending ? "default" : "pointer",
        }}
      >
        {pending ? "Lagrer …" : mode === "create" ? "Opprett leverandør" : "Lagre endringer"}
      </button>
      {error ? <span style={{ marginLeft: "0.75rem", color: "#dc2626", fontSize: "0.85rem" }}>{error}</span> : null}
    </form>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? "span 2" : "span 1" }}>
      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#374151", marginBottom: "0.3rem" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.75rem",
  border: "1px solid #e2e8f0",
  borderRadius: "6px",
  fontSize: "0.9rem",
};
