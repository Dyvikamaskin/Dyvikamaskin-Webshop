"use client";

import { useState, useEffect, useRef } from "react";
import {
  triggerBackupNowAction,
  getRecentBackupStatusAction,
  type BackupStatusSnapshot,
} from "@/app/actions/backup";

/**
 * "Kjør sikkerhetskopi nå" — manual trigger for the daily-backup job.
 *
 * Posts a one-off job to the maintenance queue (same path as the 02:00
 * UTC cron) and polls for the resulting BackupRun row, surfacing the
 * outcome to the admin without making them tail logs or query the DB.
 *
 * Polls every 2 s for up to 90 s, then gives up gracefully and tells
 * the admin to check the BackupRun table — they get a row eventually
 * regardless of whether we're still watching.
 */
export function TriggerBackupButton({
  hasKey,
}: {
  hasKey: boolean;
}) {
  const [phase, setPhase] = useState<
    | { kind: "idle" }
    | { kind: "starting" }
    | { kind: "running"; jobId: string; triggeredAt: string }
    | { kind: "done"; run: BackupStatusSnapshot }
    | { kind: "timeout"; jobId: string; triggeredAt: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadline = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  async function onClick() {
    setPhase({ kind: "starting" });
    const result = await triggerBackupNowAction();
    if (!result.ok) {
      setPhase({ kind: "error", message: result.error });
      return;
    }
    const { jobId, triggeredAt } = result;
    setPhase({ kind: "running", jobId, triggeredAt });
    pollDeadline.current = Date.now() + 90_000;
    pollTimer.current = setInterval(() => void poll(triggeredAt, jobId), 2_000);
  }

  async function poll(triggeredAt: string, jobId: string) {
    if (Date.now() > pollDeadline.current) {
      stopPolling();
      setPhase({ kind: "timeout", jobId, triggeredAt });
      return;
    }
    const res = await getRecentBackupStatusAction(triggeredAt);
    if (!res.ok) {
      stopPolling();
      setPhase({ kind: "error", message: res.error });
      return;
    }
    if (!res.run) return; // not yet — keep polling
    // Worker has written a row. RUNNING means picked up, still going.
    if (res.run.status === "RUNNING") {
      setPhase({ kind: "running", jobId, triggeredAt });
      return;
    }
    stopPolling();
    setPhase({ kind: "done", run: res.run });
  }

  return (
    <section
      style={{
        marginTop: "2rem",
        padding: "1.25rem 1.5rem",
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "0.5rem",
      }}
    >
      <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>
        Verifiser sikkerhetskopi
      </h2>
      <p style={{ color: "#475569", margin: "0.5rem 0 1rem", fontSize: "0.9rem", lineHeight: 1.5 }}>
        Start en sikkerhetskopi nå for å bekrefte at oppsettet fungerer.
        Bruker samme jobb som det daglige skedulerte løpet kl 02:00 UTC.
      </p>

      <button
        type="button"
        disabled={!hasKey || phase.kind === "starting" || phase.kind === "running"}
        onClick={onClick}
        style={{
          padding: "0.6rem 1.25rem",
          background: hasKey ? "#0f172a" : "#cbd5e1",
          color: "#fff",
          border: "none",
          borderRadius: "0.375rem",
          cursor: hasKey ? "pointer" : "not-allowed",
          fontWeight: 600,
          fontSize: "0.875rem",
        }}
      >
        {phase.kind === "starting" && "Starter…"}
        {phase.kind === "running" && "Kjører…"}
        {(phase.kind === "idle" ||
          phase.kind === "done" ||
          phase.kind === "timeout" ||
          phase.kind === "error") &&
          (hasKey ? "Kjør sikkerhetskopi nå" : "Generer nøkkel først")}
      </button>

      {phase.kind === "done" && <BackupResult run={phase.run} />}
      {phase.kind === "timeout" && (
        <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#92400e" }}>
          Tidsavbrudd — jobben er fortsatt i kø eller tar lengre tid enn 90
          sekunder. Sjekk BackupRun-tabellen om en stund (jobb-id{" "}
          <code style={{ fontFamily: "monospace" }}>{phase.jobId}</code>).
        </p>
      )}
      {phase.kind === "error" && (
        <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#991b1b" }}>
          Feil: {phase.message}
        </p>
      )}
    </section>
  );
}

function BackupResult({ run }: { run: BackupStatusSnapshot }) {
  const tone =
    run.status === "SUCCESS"
      ? { bg: "#f0fdf4", border: "#86efac", text: "#166534" }
      : run.status === "SKIPPED"
      ? { bg: "#fff7ed", border: "#fdba74", text: "#9a3412" }
      : { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" };
  const sizeKb = run.bytesWritten != null ? Math.round(run.bytesWritten / 1024) : null;
  const seconds = run.finishedAt
    ? Math.round(
        (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) /
          1000,
      )
    : null;

  return (
    <div
      style={{
        marginTop: "1rem",
        padding: "0.875rem 1rem",
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: "0.5rem",
        color: tone.text,
        fontSize: "0.9rem",
        lineHeight: 1.5,
      }}
    >
      <p style={{ margin: 0, fontWeight: 700 }}>
        {run.status === "SUCCESS" && "✓ Sikkerhetskopi lagret"}
        {run.status === "SKIPPED" && "↷ Sikkerhetskopi hoppet over"}
        {run.status === "FAILED" && "✗ Sikkerhetskopi feilet"}
      </p>
      {run.status === "SUCCESS" && (
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
          {sizeKb != null && `${sizeKb} KB`}
          {sizeKb != null && seconds != null && " · "}
          {seconds != null && `${seconds} s`}
          {run.storagePath && (
            <>
              <br />
              <code style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                {run.storagePath}
              </code>
            </>
          )}
        </p>
      )}
      {(run.status === "SKIPPED" || run.status === "FAILED") && run.errorMessage && (
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>{run.errorMessage}</p>
      )}
    </div>
  );
}
