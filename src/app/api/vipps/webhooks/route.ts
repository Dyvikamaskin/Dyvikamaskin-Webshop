import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  listVippsWebhooks,
  registerVippsWebhook,
  deleteVippsWebhook,
} from "@/lib/vipps";
import { UserRole } from "@/app/generated/prisma/enums";

/**
 * Vipps webhook management — protected, STORE_MANAGER+.
 *
 * GET    /api/vipps/webhooks         — list registered webhooks
 * POST   /api/vipps/webhooks         — register new webhook
 * DELETE /api/vipps/webhooks?id=...  — delete a webhook
 */

async function guard() {
  try {
    await requireRole(UserRole.STORE_MANAGER);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;

  try {
    const webhooks = await listVippsWebhooks();
    return NextResponse.json({ ok: true, webhooks });
  } catch (err) {
    console.error("[vipps-webhooks] list error", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  let url: string;
  try {
    const body = await request.json() as { url?: string };
    url = body.url ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!url || !url.startsWith("https://")) {
    return NextResponse.json(
      { error: "url er påkrevd og må starte med https://" },
      { status: 400 }
    );
  }

  try {
    const registration = await registerVippsWebhook(url);
    return NextResponse.json({ ok: true, registration });
  } catch (err) {
    console.error("[vipps-webhooks] register error", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id er påkrevd" }, { status: 400 });
  }

  try {
    await deleteVippsWebhook(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[vipps-webhooks] delete error", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
  }
}
