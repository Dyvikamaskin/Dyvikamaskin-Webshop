import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma/enums";
import { CustomerPriceList } from "@/components/admin/CustomerPriceList";

export const metadata: Metadata = { title: "Kundepriser — Admin" };

export default async function CustomerPricesPage({
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
      companyName: true,
      email: true,
      defaultDiscount: true,
    },
  });
  if (!profile) notFound();

  const tiers = await prisma.customerPriceList.findMany({
    where: { profileId: id },
    orderBy: [{ scope: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div style={{ padding: "2rem", maxWidth: "1000px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Kundepriser
      </h1>
      <p style={{ color: "#475569", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        {profile.companyName ?? profile.fullName} ({profile.email}) · Standard rabatt:{" "}
        {profile.defaultDiscount.toString()}%
      </p>

      <CustomerPriceList
        profileId={profile.id}
        tiers={tiers.map((t) => ({
          id: t.id,
          scope: t.scope,
          scopeId: t.scopeId,
          discountPercent: t.discountPercent?.toString() ?? null,
          fixedPrice: t.fixedPrice?.toString() ?? null,
          notes: t.notes,
        }))}
      />
    </div>
  );
}
