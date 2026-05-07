"use client";

import { useState } from "react";

interface Webhook {
  id:     string;
  url:    string;
  events: string[];
}

interface Props {
  initialWebhooks: Webhook[];
  defaultUrl:      string;
}

export function WebhookManager({ initialWebhooks, defaultUrl }: Props) {
  const [webhooks, setWebhooks]       = useState<Webhook[]>(initialWebhooks);
  const [newSecret, setNewSecret]     = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [error, setError]             = useState("");
  const [url, setUrl]                 = useState(defaultUrl);
  const [copied, setCopied]           = useState(false);

  async function handleRegister() {
    if (!url) return;
    setError("");
    setNewSecret(null);
    setRegistering(true);

    try {
      const res = await fetch("/api/vipps/webhooks", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ url }),
      });
      const data = await res.json() as {
        ok: boolean;
        error?: string;
        registration?: { id: string; url: string; events: string[]; secret?: string };
      };

      if (!data.ok || !data.registration) {
        setError(data.error ?? "Ukjent feil");
        return;
      }

      setWebhooks((prev) => [
        ...prev,
        { id: data.registration!.id, url: data.registration!.url, events: data.registration!.events },
      ]);
      setNewSecret(data.registration.secret ?? null);
    } catch (err) {
      setError(String(err));
    } finally {
      setRegistering(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/vipps/webhooks?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Slett feilet");
        return;
      }
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      setError(String(err));
    } finally {
      setDeleting(null);
    }
  }

  async function copySecret() {
    if (!newSecret) return;
    await navigator.clipboard.writeText(newSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      {/* ── Secret reveal ───────────────────────────────────────────────────── */}
      {newSecret && (
        <div
          style={{
            background: "#fef3c7",
            border: "2px solid #f59e0b",
            borderRadius: "8px",
            padding: "1.25rem",
            marginBottom: "1.5rem",
          }}
        >
          <p style={{ margin: "0 0 0.5rem", fontWeight: 700, color: "#92400e", fontSize: "0.875rem" }}>
            ⚠ Webhook registrert — kopier hemmeligheten nå!
          </p>
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.8rem", color: "#78350f" }}>
            Dette vises bare én gang. Legg den til i Railway / .env som{" "}
            <code style={{ fontFamily: "monospace", background: "#fde68a", padding: "0 4px", borderRadius: "3px" }}>
              VIPPS_WEBHOOK_SECRET
            </code>
          </p>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <code
              style={{
                flex: 1,
                fontFamily: "monospace",
                fontSize: "0.875rem",
                background: "#fff",
                border: "1px solid #d97706",
                borderRadius: "4px",
                padding: "0.5rem 0.75rem",
                wordBreak: "break-all",
              }}
            >
              {newSecret}
            </code>
            <button
              onClick={copySecret}
              style={{
                padding: "0.5rem 0.9rem",
                background: copied ? "#16a34a" : "#d97706",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.8rem",
                whiteSpace: "nowrap",
              }}
            >
              {copied ? "✓ Kopiert!" : "Kopier"}
            </button>
          </div>
        </div>
      )}

      {/* ── Existing webhooks ────────────────────────────────────────────────── */}
      <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", fontWeight: 700, color: "#374151" }}>
        Registrerte webhooks ({webhooks.length})
      </h3>

      {webhooks.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
          Ingen webhooks registrert hos Vipps for dette merchant-serienummeret.
        </p>
      ) : (
        <div style={{ marginBottom: "1.25rem" }}>
          {webhooks.map((wh) => (
            <div
              key={wh.id}
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                padding: "0.75rem 1rem",
                marginBottom: "0.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <div>
                <code style={{ fontSize: "0.8rem", color: "#1e293b" }}>{wh.url}</code>
                <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                  ID: {wh.id.slice(0, 16)}… &nbsp;·&nbsp; {wh.events.length} events
                </div>
              </div>
              <button
                onClick={() => handleDelete(wh.id)}
                disabled={deleting === wh.id}
                style={{
                  padding: "0.35rem 0.7rem",
                  background: "#fee2e2",
                  color: "#991b1b",
                  border: "1px solid #fca5a5",
                  borderRadius: "5px",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {deleting === wh.id ? "Sletter…" : "🗑 Slett"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Register new webhook ─────────────────────────────────────────────── */}
      <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", fontWeight: 700, color: "#374151" }}>
        Registrer ny webhook
      </h3>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://dindomene.no/api/vipps/webhook"
          style={{
            flex: 1,
            padding: "0.5rem 0.75rem",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "0.875rem",
            fontFamily: "monospace",
          }}
        />
        <button
          onClick={handleRegister}
          disabled={registering || !url}
          style={{
            padding: "0.5rem 1.1rem",
            background: registering ? "#d1d5db" : "#1e40af",
            color: registering ? "#9ca3af" : "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: registering ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: "0.875rem",
            whiteSpace: "nowrap",
          }}
        >
          {registering ? "Registrerer…" : "Registrer"}
        </button>
      </div>

      <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "#64748b" }}>
        URL-en må være offentlig tilgjengelig (https). For lokal testing, bruk{" "}
        <a href="https://ngrok.com" target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
          ngrok
        </a>{" "}
        eller lignende.
      </p>

      {error && (
        <p style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "#fee2e2", borderRadius: "6px", fontSize: "0.875rem", color: "#991b1b" }}>
          Feil: {error}
        </p>
      )}
    </div>
  );
}
