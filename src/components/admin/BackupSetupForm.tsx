"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBackupPublicKeyAction } from "@/app/actions/backup";

interface BackupSetupFormProps {
  hasExistingKey: boolean;
}

type Phase = "idle" | "generating" | "downloaded" | "saving" | "saved" | "error";

/**
 * Browser-side keypair generator + save flow. The age-encryption
 * package generates the X25519 keypair entirely in JS — secret material
 * never leaves the browser.
 *
 * Flow:
 *   1. Click "Generer nøkkelpar" → call generateIdentity() in-browser
 *   2. Force a download of the secret as a .txt file the moment it's
 *      generated, BEFORE saving the recipient. If save fails, the
 *      private key is at least preserved on disk and the admin can
 *      retry without regenerating.
 *   3. Click "Lagre offentlig nøkkel på profil" → call the server action
 */
export function BackupSetupForm({ hasExistingKey }: BackupSetupFormProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>("idle");
  const [recipient, setRecipient] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  async function handleGenerate() {
    setPhase("generating");
    setError("");
    try {
      // Dynamic import keeps age-encryption out of the initial admin
      // bundle — only loaded when this button is clicked.
      const age = await import("age-encryption");
      const secret = await age.generateIdentity();
      const recipientKey = await age.identityToRecipient(secret);

      // Force download of the private key BEFORE persisting the public.
      const blob = new Blob(
        [
          `# IndustriParts backup private key\n` +
          `# Generated: ${new Date().toISOString()}\n` +
          `# DO NOT share. DO NOT commit. Anyone with this key can decrypt every backup.\n` +
          `\n${secret}\n`,
        ],
        { type: "text/plain" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `industriparts-backup-key-${new Date()
        .toISOString()
        .slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setRecipient(recipientKey);
      setPhase("downloaded");
    } catch (err) {
      console.error("[backup-setup] keygen failed", err);
      setError(err instanceof Error ? err.message : "Ukjent feil ved nøkkelgenerering.");
      setPhase("error");
    }
  }

  function handleSave() {
    if (!recipient) return;
    setPhase("saving");
    startTransition(async () => {
      const result = await saveBackupPublicKeyAction(recipient);
      if (result.ok) {
        setPhase("saved");
        router.refresh();
      } else {
        setError(result.error);
        setPhase("error");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={phase === "generating" || phase === "saving"}
        style={{
          padding: "0.625rem 1.25rem",
          background: "#0f172a",
          color: "#fff",
          border: "none",
          borderRadius: "0.5rem",
          fontWeight: 600,
          cursor: phase === "generating" ? "wait" : "pointer",
        }}
      >
        {phase === "generating"
          ? "Genererer …"
          : hasExistingKey
            ? "Generer ny nøkkel (rotering)"
            : "Generer nøkkelpar"}
      </button>

      {recipient && phase !== "saved" ? (
        <div style={{ marginTop: "1.5rem" }}>
          <p style={{ marginBottom: "0.5rem", color: "#475569", fontSize: "0.9375rem" }}>
            Privat nøkkel lastet ned som tekstfil. Lagre den et trygt sted
            utenfor nett før du fortsetter.
          </p>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: "0.8125rem",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              padding: "0.5rem 0.75rem",
              borderRadius: "0.375rem",
              wordBreak: "break-all",
              marginBottom: "0.75rem",
            }}
          >
            {recipient}
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={phase === "saving"}
            style={{
              padding: "0.5rem 1rem",
              background: "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: "0.5rem",
              fontWeight: 600,
              cursor: phase === "saving" ? "wait" : "pointer",
            }}
          >
            {phase === "saving"
              ? "Lagrer …"
              : "Lagre offentlig nøkkel på profil"}
          </button>
        </div>
      ) : null}

      {phase === "saved" ? (
        <p
          style={{
            marginTop: "1rem",
            color: "#166534",
            fontWeight: 600,
            fontSize: "0.9375rem",
          }}
        >
          ✓ Nøkkel lagret. Du kan nå laste ned krypterte sikkerhetskopier
          fra /admin.
        </p>
      ) : null}

      {error ? (
        <p
          style={{
            marginTop: "0.75rem",
            color: "#dc2626",
            fontSize: "0.875rem",
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
