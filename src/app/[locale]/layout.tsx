import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { routing } from "@/i18n/routing";
import { EntryModal } from "@/components/entry-modal/EntryModal";
import type { CustomerTypeValue } from "@/lib/stores/use-customer-type";

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  // Read customer-type cookie server-side so the entry modal can be
  // server-rendered in the correct initial state (no layout flash).
  const cookieStore = await cookies();
  const rawType = cookieStore.get("customer-type")?.value;
  const initialCustomerType: CustomerTypeValue | null =
    rawType === "CONSUMER" || rawType === "BUSINESS" ? rawType : null;

  return (
    <NextIntlClientProvider messages={messages}>
      <EntryModal initialType={initialCustomerType} />
      {children}
    </NextIntlClientProvider>
  );
}
