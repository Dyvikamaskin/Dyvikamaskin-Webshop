"use client";

import { useTransition } from "react";
import { rejectDraftFormAction } from "@/app/actions/product-draft";

interface Props {
  draftId: string;
}

export default function RejectForm({ draftId }: Props) {
  const [isPending, startTransition] = useTransition();
  const action = rejectDraftFormAction.bind(null, draftId);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await action(fd);
      window.location.href = "/admin/produktforslag";
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: "8px", padding: "1.25rem" }}>
      <h3 style={{ margin: "0 0 1rem", fontSize: "0.9rem", fontWeight: 700, color: "#991b1b" }}>
        ✕ Avvis forslag
      </h3>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginBottom: "0.75rem", fontSize: "0.75rem", fontWeight: 600, color: "#374151" }}>
        Begrunnelse (valgfri)
        <textarea
          name="notes"
          rows={4}
          placeholder="F.eks. duplikat, feil kode, ikke relevant…"
          style={{ padding: "0.45rem 0.6rem", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "0.875rem", resize: "vertical" }}
        />
      </label>

      <button
        type="submit"
        disabled={isPending}
        style={{ width: "100%", padding: "0.625rem", background: isPending ? "#fca5a5" : "#dc2626", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 700, cursor: isPending ? "not-allowed" : "pointer", fontSize: "0.875rem" }}
      >
        {isPending ? "Avviser…" : "Avvis forslaget"}
      </button>
    </form>
  );
}
