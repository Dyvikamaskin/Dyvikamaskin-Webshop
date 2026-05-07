"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export type CustomerTypeValue = "CONSUMER" | "BUSINESS";

const COOKIE_NAME = "customer-type";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Sets the customer-type cookie and, if the user is authenticated,
 * updates their Profile record in the database.
 *
 * For business customers, also saves orgNumber and companyName.
 */
export async function setCustomerTypeAction(
  type: CustomerTypeValue,
  businessData?: { orgNumber: string; companyName: string }
): Promise<void> {
  // 1. Persist to cookie (works for both guests and logged-in users)
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, type, {
    maxAge: COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    httpOnly: false, // client needs to read it for Zustand hydration
  });

  // 2. Persist to Profile if authenticated
  const user = await getAuthUser();
  if (!user) return;

  const data: Parameters<typeof prisma.profile.update>[0]["data"] = {
    customerType: type,
  };

  if (type === "BUSINESS" && businessData) {
    data.orgNumber = businessData.orgNumber;
    data.companyName = businessData.companyName;
  }

  await prisma.profile.update({
    where: { id: user.id },
    data,
  });
}
