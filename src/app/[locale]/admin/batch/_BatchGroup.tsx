"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  setBatchFulfillmentStatusAction,
  markCollectedAction,
} from "@/app/actions/fulfillment";
import { updateFulfillmentStatusAction } from "@/app/actions/admin";
import { FulfillmentStatus } from "@/app/generated/prisma/enums";

interface OrderItem {
  sku:          string;
  productName:  string;
  quantity:     number;
  locationCode: string | null;
}

interface BatchOrder {
  id:                string;
  fulfillmentStatus: string;
  isPickup:          boolean;
  orderSource:       string;
  createdAt:         string;
  customerName:      string;
  customerEmail:     string;
  items:             OrderItem[];
}

interface Props {
  storeId:   string;
  storeName: string;
  slot:      "MORGEN" | "ETTERMIDDAG";
  slotLabel: string;
  orders:    BatchOrder[];
  dateStr:   string;
}

const STATUS_LABEL: Record<string, string> = {
  UNFULFILLED:       "Ubehandlet",
  PROCESSING:        "Under behandling",
  SHIPPED:           "Sendt",
  READY_FOR_PICKUP:  "Klar for henting",
  COLLECTED:         "Hentet",
};

const STATUS_COLOR: Record<string, string> = {
  UNFULFILLED:      "#92400e",
  PROCESSING:       "#1e40af",
  SHIPPED:          "#166534",
  READY_FOR_PICKUP: "#6d28d9",
  COLLECTED:        "#166534",
};

export default function BatchGroup({ storeId, storeName, slot, slotLabel, orders, dateStr }: Props) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const unfulfilledIds = orders
    .filter((o) => o.fulfillmentStatus === "UNFULFILLED")
    .map((o) => o.id);

  const processingIds = orders
    .filter((o) => o.fulfillmentStatus === "PROCESSING")
    .map((o) => o.id);

  function markAllProcessing() {
    if (!unfulfilledIds.length) return;
    startTransition(async () => {
      const result = await setBatchFulfillmentStatusAction(
        unfulfilledIds,
        FulfillmentStatus.PROCESSING
      );
      setFeedback(result.ok
        ? `✓ ${result.updated} ordre(r) satt til «Under behandling»`
        : result.error
      );
    });
  }

  function markPickupReady(saleId: string) {
    startTransition(async () => {
      const result = await updateFulfillmentStatusAction(saleId, FulfillmentStatus.READY_FOR_PICKUP);
      setFeedback(result.ok ? "✓ Klar for henting" : result.error);
    });
  }

  function markShipped(saleId: string) {
    startTransition(async () => {
      const result = await updateFulfillmentStatusAction(saleId, FulfillmentStatus.SHIPPED);
      setFeedback(result.ok ? "✓ Sendt" : result.error);
    });
  }

  function markCollected(saleId: string) {
    startTransition(async () => {
      const result = await markCollectedAction(saleId);
      setFeedback(result.ok ? "✓ Hentet" : result.error);
    });
  }

  const batchPickingUrl = `/api/picking-list/batch?storeId=${storeId}&slot=${slot}&date=${dateStr}`;

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "0.875rem 1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}>{slotLabel}</span>
            <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#64748b" }}>
              {orders.length} ordre{orders.length !== 1 ? "r" : ""}
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {orders.length > 0 && (
              <a
                href={batchPickingUrl}
                target="_blank"
                rel="noreferrer"
                style={{ padding: "0.35rem 0.75rem", background: "#0f172a", color: "#fff", borderRadius: "5px", fontSize: "0.75rem", textDecoration: "none", fontWeight: 600 }}
              >
                🖨 Batch-plukkliste
              </a>
            )}
            {unfulfilledIds.length > 0 && (
              <button
                onClick={markAllProcessing}
                disabled={isPending}
                style={{ padding: "0.35rem 0.75rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "5px", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}
              >
                {isPending ? "…" : `Sett ${unfulfilledIds.length} til Under behandling`}
              </button>
            )}
          </div>
        </div>

        {feedback && (
          <div style={{
            marginTop: "0.5rem", padding: "0.4rem 0.75rem", borderRadius: "5px", fontSize: "0.75rem",
            background: feedback.startsWith("✓") ? "#f0fdf4" : "#fef2f2",
            color:      feedback.startsWith("✓") ? "#166534"  : "#dc2626",
          }}>
            {feedback}
          </div>
        )}
      </div>

      {/* Order list */}
      {orders.length === 0 ? (
        <p style={{ padding: "1.5rem", textAlign: "center", color: "#94a3b8", fontSize: "0.8rem", margin: 0 }}>
          Ingen ordrer i denne batchen.
        </p>
      ) : (
        <div>
          {orders.map((order) => (
            <div key={order.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
              {/* Order row */}
              <div
                style={{ display: "flex", alignItems: "center", padding: "0.625rem 1rem", gap: "0.75rem", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === order.id ? null : order.id)}
              >
                {/* Status badge */}
                <span style={{
                  padding: "0.15rem 0.5rem", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700,
                  background: STATUS_COLOR[order.fulfillmentStatus] + "1a",
                  color: STATUS_COLOR[order.fulfillmentStatus],
                  border: `1px solid ${STATUS_COLOR[order.fulfillmentStatus]}33`,
                  whiteSpace: "nowrap",
                }}>
                  {STATUS_LABEL[order.fulfillmentStatus] ?? order.fulfillmentStatus}
                </span>

                {/* Customer + items */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: "0.8rem", color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {order.customerName}
                    {order.isPickup && <span style={{ marginLeft: "0.375rem", fontSize: "0.65rem", background: "#fef9c3", color: "#713f12", padding: "0.1rem 0.35rem", borderRadius: "3px" }}>Hentes</span>}
                    {order.orderSource === "PHONE" && <span style={{ marginLeft: "0.375rem", fontSize: "0.65rem", background: "#ede9fe", color: "#5b21b6", padding: "0.1rem 0.35rem", borderRadius: "3px" }}>Telefon</span>}
                  </p>
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.7rem", color: "#64748b" }}>
                    {order.items.length} vare{order.items.length !== 1 ? "r" : ""} ·{" "}
                    {new Date(order.createdAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "0.375rem", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                  <a
                    href={`/api/picking-list/${order.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Plukkliste"
                    style={{ padding: "0.25rem 0.5rem", background: "#f1f5f9", border: "1px solid #d1d5db", borderRadius: "4px", fontSize: "0.7rem", textDecoration: "none", color: "#374151" }}
                  >
                    📋
                  </a>
                  <Link
                    href={`/admin/ordrer/${order.id}`}
                    title="Ordredetaljer"
                    style={{ padding: "0.25rem 0.5rem", background: "#f1f5f9", border: "1px solid #d1d5db", borderRadius: "4px", fontSize: "0.7rem", textDecoration: "none", color: "#374151" }}
                  >
                    →
                  </Link>
                  {order.fulfillmentStatus === "PROCESSING" && order.isPickup && (
                    <button
                      onClick={() => markPickupReady(order.id)}
                      disabled={isPending}
                      style={{ padding: "0.25rem 0.5rem", background: "#6d28d9", color: "#fff", border: "none", borderRadius: "4px", fontSize: "0.7rem", cursor: "pointer", fontWeight: 600 }}
                    >
                      Klar
                    </button>
                  )}
                  {order.fulfillmentStatus === "PROCESSING" && !order.isPickup && (
                    <button
                      onClick={() => markShipped(order.id)}
                      disabled={isPending}
                      style={{ padding: "0.25rem 0.5rem", background: "#166534", color: "#fff", border: "none", borderRadius: "4px", fontSize: "0.7rem", cursor: "pointer", fontWeight: 600 }}
                    >
                      Sendt
                    </button>
                  )}
                  {order.fulfillmentStatus === "READY_FOR_PICKUP" && (
                    <button
                      onClick={() => markCollected(order.id)}
                      disabled={isPending}
                      style={{ padding: "0.25rem 0.5rem", background: "#166534", color: "#fff", border: "none", borderRadius: "4px", fontSize: "0.7rem", cursor: "pointer", fontWeight: 600 }}
                    >
                      Hentet
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded items */}
              {expanded === order.id && (
                <div style={{ background: "#f8fafc", borderTop: "1px solid #f1f5f9", padding: "0.625rem 1rem 0.75rem 2.5rem" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                    <tbody>
                      {order.items.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: "0.25rem 0.5rem 0.25rem 0", width: "30%", color: "#64748b" }}>
                            {item.locationCode
                              ? <code style={{ fontSize: "0.7rem", background: "#f0fdf4", color: "#166534", padding: "0.1rem 0.3rem", borderRadius: "3px" }}>{item.locationCode}</code>
                              : <span style={{ color: "#f59e0b", fontSize: "0.7rem" }}>–</span>
                            }
                          </td>
                          <td style={{ padding: "0.25rem 0.5rem 0.25rem 0", fontFamily: "monospace", fontSize: "0.7rem", color: "#334155" }}>{item.sku}</td>
                          <td style={{ padding: "0.25rem 0", color: "#1e293b" }}>{item.productName}</td>
                          <td style={{ padding: "0.25rem 0 0.25rem 0.5rem", textAlign: "right", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>× {item.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
