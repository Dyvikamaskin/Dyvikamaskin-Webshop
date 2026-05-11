import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";
import { SupplierForm } from "@/components/admin/SupplierForm";

export const metadata: Metadata = { title: "Ny leverandør — Admin" };

export default async function NewSupplierPage() {
  await requireRole(UserRole.STORE_MANAGER);
  return (
    <div style={{ padding: "2rem", maxWidth: "720px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Ny leverandør
      </h1>
      <SupplierForm mode="create" />
    </div>
  );
}
