import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma/enums";
import { GdprAnonymiseForm } from "@/components/admin/GdprAnonymiseForm";

export const metadata: Metadata = { title: "Anonymiser kunde — Admin" };

export default async function AnonymiseCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(UserRole.STORE_MANAGER);
  const { id } = await params;

  const profile = await prisma.profile.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      companyName: true,
      isActive: true,
    },
  });
  if (!profile) notFound();

  const counts = await Promise.all([
    prisma.sale.count({ where: { customerId: id } }),
    prisma.quote.count({ where: { customerId: id } }),
  ]);
  const [saleCount, quoteCount] = counts;

  return (
    <main style={{ maxWidth: "720px", padding: "2rem", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Anonymiser kunde (GDPR Art. 17)
      </h1>
      <p style={{ color: "#475569", fontSize: "0.9375rem", marginBottom: "1rem", lineHeight: 1.5 }}>
        Fjerner identifiserbar informasjon (navn, e-post, telefon, adresse,
        orgnr) fra profilen til{" "}
        <strong>{profile.companyName ?? profile.fullName}</strong> (
        {profile.email}). Ordrer og fakturaer beholdes i anonymisert form
        for å oppfylle Bokføringsloven §13 (5 års oppbevaringsplikt).
      </p>

      <div
        style={{
          background: "#fef9c3",
          border: "1px solid #facc15",
          borderRadius: "8px",
          padding: "0.875rem 1rem",
          marginBottom: "1.5rem",
          fontSize: "0.875rem",
          color: "#854d0e",
        }}
      >
        Dette berører: {saleCount} ordre · {quoteCount} tilbud. Etter
        anonymisering kan ikke kunden logge seg på lenger, og linken
        mellom navn og fakturanummer er borte. Handlingen er irreversibel.
      </div>

      <GdprAnonymiseForm profileId={profile.id} customerName={profile.fullName} />
    </main>
  );
}
