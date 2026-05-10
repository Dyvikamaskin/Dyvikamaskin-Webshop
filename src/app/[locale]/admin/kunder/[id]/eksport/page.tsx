import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma/enums";
import { GdprExportButton } from "@/components/admin/GdprExportButton";

export const metadata: Metadata = { title: "GDPR eksport — Admin" };

export default async function GdprExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(UserRole.STORE_MANAGER);
  const { id } = await params;

  const profile = await prisma.profile.findUnique({
    where: { id },
    select: { id: true, fullName: true, email: true, companyName: true },
  });
  if (!profile) notFound();

  return (
    <main style={{ maxWidth: "720px", padding: "2rem", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        GDPR-eksport (Art. 20 dataportabilitet)
      </h1>
      <p style={{ color: "#475569", fontSize: "0.9375rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
        Last ned alle personopplysninger vi har lagret om{" "}
        <strong>{profile.companyName ?? profile.fullName}</strong>{" "}
        ({profile.email}) i maskinlesbart JSON-format. Filen kan
        videresendes direkte til kunden for å oppfylle GDPR Art. 20.
      </p>

      <GdprExportButton profileId={profile.id} customerName={profile.fullName} />
    </main>
  );
}
