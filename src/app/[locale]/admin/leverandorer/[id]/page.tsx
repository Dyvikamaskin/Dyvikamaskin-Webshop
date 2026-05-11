import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma/enums";
import { SupplierForm } from "@/components/admin/SupplierForm";

export const metadata: Metadata = { title: "Rediger leverandør — Admin" };

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(UserRole.STORE_MANAGER);
  const { id } = await params;

  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) notFound();

  return (
    <div style={{ padding: "2rem", maxWidth: "720px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Rediger leverandør
      </h1>
      <SupplierForm
        mode="edit"
        id={supplier.id}
        initial={{
          name: supplier.name,
          orgNumber: supplier.orgNumber ?? "",
          email: supplier.email ?? "",
          phone: supplier.phone ?? "",
          address: supplier.address ?? "",
          postalCode: supplier.postalCode ?? "",
          city: supplier.city ?? "",
          notes: supplier.notes ?? "",
          isActive: supplier.isActive,
        }}
      />
    </div>
  );
}
