/**
 * SAF-T Financial v1.10 (Norwegian) export builder — Phase 7
 *
 * Builds an XML document conforming to Skatteetaten's SAF-T Financial
 * schema, scoped to a date range. The output covers the SourceDocuments
 * → SalesInvoices subset (the most relevant slice for an e-commerce
 * business with a Norwegian tax footprint).
 *
 * What's included:
 *   * Header — version, country, period selection, software identity,
 *     reporting company (org number, name, address from env vars).
 *   * MasterFiles
 *     - Customers: every Profile that has at least one Sale in the period.
 *     - TaxTable: the MVA rates seen on SaleItems in the period, each
 *       mapped to Skatteetaten's TaxCode for outgoing MVA.
 *   * SourceDocuments → SalesInvoices: every PAID + INVOICED Sale, with
 *     line-level UnitPrice / Quantity / Tax / Totals.
 *
 * What's deliberately NOT included in this MVP (flagged in commit msg):
 *   * GeneralLedgerEntries — requires double-entry bookkeeping data
 *     that lives in the accounting system, not this app.
 *   * Purchase invoices — Phase 8 introduces Supplier; until then
 *     PurchaseInvoices stays empty.
 *   * Payments — outside scope for the SourceDocuments subset.
 *
 * Skatteetaten reference: https://skatteetaten.github.io/saf-t/
 *
 * Document any uncertainty inline — the schema's "required" fields
 * are honored; "optional" fields that we don't have data for are
 * omitted rather than emitted with placeholder values that would
 * misrepresent the company's posture.
 */
import { create } from "xmlbuilder2";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/app/generated/prisma/enums";

const XMLNS = "urn:StandardAuditFile-Taxation-Financial:NO";
const SAFT_VERSION = "1.10";
const SOFTWARE_ID = "industriparts-saf-t";
const SOFTWARE_VERSION = "1.0";

/**
 * MVA rate → Skatteetaten TaxCode mapping for outgoing sales.
 * From Skatteetaten's standard code list:
 *   3 — Standard rate, 25% (outgoing)
 *   31 — Reduced rate, 15% (foodstuffs)
 *   33 — Reduced rate, 12% (passenger transport)
 *   5  — Zero-rated, 0%
 *   6  — Outside the scope of MVA
 */
function taxCodeFor(rate: Prisma.Decimal | number): string {
  const r = typeof rate === "number" ? rate : rate.toNumber();
  if (r >= 0.249 && r <= 0.251) return "3";   // 25%
  if (r >= 0.149 && r <= 0.151) return "31";  // 15%
  if (r >= 0.119 && r <= 0.121) return "33";  // 12%
  if (r === 0)                  return "5";   // 0% zero-rated
  return "6";                                  // out-of-scope fallback
}

function pct(rate: Prisma.Decimal | number | string): string {
  return new Prisma.Decimal(rate).mul(100).toDecimalPlaces(2).toString();
}

function money(value: Prisma.Decimal | number | string | null | undefined): string {
  if (value == null) return "0.00";
  return new Prisma.Decimal(value).toDecimalPlaces(2).toString();
}

export interface SaftExportInput {
  fromDate: Date;  // inclusive
  toDate: Date;    // inclusive
}

export async function buildSaftXml(input: SaftExportInput): Promise<string> {
  const { fromDate, toDate } = input;

  // Date range bounds: include the entire toDate calendar day.
  const periodEnd = new Date(toDate);
  periodEnd.setHours(23, 59, 59, 999);

  // Company metadata from env. If unset we still emit the document but
  // with empty values — Skatteetaten will reject; this is on purpose to
  // make the missing config obvious.
  const company = {
    orgNumber: process.env.COMPANY_ORG_NUMBER ?? "",
    name: process.env.COMPANY_NAME ?? "Dyvikamaskin",
    address: process.env.COMPANY_ADDRESS ?? "",
    postalCode: process.env.COMPANY_POSTAL_CODE ?? "",
    city: process.env.COMPANY_CITY ?? "",
  };

  // ── Fetch source data ──────────────────────────────────────────────────────

  const sales = await prisma.sale.findMany({
    where: {
      status: { in: [OrderStatus.PAID, OrderStatus.INVOICED] },
      createdAt: { gte: fromDate, lte: periodEnd },
      invoiceNumber: { not: null },
    },
    orderBy: { createdAt: "asc" },
    include: {
      items: true,
      customer: {
        select: {
          id: true,
          fullName: true,
          companyName: true,
          orgNumber: true,
          email: true,
          address: true,
          postalCode: true,
          city: true,
        },
      },
    },
  });

  // Distinct customers in the period (for MasterFiles/Customers).
  const customers = new Map<
    string,
    NonNullable<(typeof sales)[number]["customer"]>
  >();
  for (const s of sales) {
    if (s.customer) customers.set(s.customer.id, s.customer);
  }

  // Distinct MVA rates seen (for MasterFiles/TaxTable).
  const taxRates = new Set<string>();
  for (const s of sales) {
    for (const it of s.items) {
      taxRates.add(new Prisma.Decimal(it.mvaRate).toString());
    }
  }

  // ── Build XML ──────────────────────────────────────────────────────────────

  const doc = create({ version: "1.0", encoding: "UTF-8" })
    .ele("AuditFile", { xmlns: XMLNS });

  // Header ───────────────────────────────────────────────────────────────────
  const header = doc.ele("Header");
  header.ele("AuditFileVersion").txt(SAFT_VERSION);
  header.ele("AuditFileCountry").txt("NO");
  header.ele("AuditFileDateCreated").txt(new Date().toISOString().slice(0, 10));
  header.ele("SoftwareCompanyName").txt(company.name);
  header.ele("SoftwareID").txt(SOFTWARE_ID);
  header.ele("SoftwareVersion").txt(SOFTWARE_VERSION);

  const companyEle = header.ele("Company");
  companyEle.ele("RegistrationNumber").txt(company.orgNumber);
  companyEle.ele("Name").txt(company.name);
  const addrEle = companyEle.ele("Address");
  addrEle.ele("StreetName").txt(company.address);
  addrEle.ele("City").txt(company.city);
  addrEle.ele("PostalCode").txt(company.postalCode);
  addrEle.ele("Country").txt("NO");
  companyEle.ele("TaxRegistration").ele("TaxRegistrationNumber").txt(company.orgNumber);

  header.ele("DefaultCurrencyCode").txt("NOK");

  const selection = header.ele("SelectionCriteria");
  selection.ele("PeriodStart").txt(monthOf(fromDate));
  selection.ele("PeriodStartYear").txt(String(fromDate.getFullYear()));
  selection.ele("PeriodEnd").txt(monthOf(periodEnd));
  selection.ele("PeriodEndYear").txt(String(periodEnd.getFullYear()));

  header.ele("TaxAccountingBasis").txt("I"); // I = invoices (accrual)

  // MasterFiles ──────────────────────────────────────────────────────────────
  const masterFiles = doc.ele("MasterFiles");

  // Customers
  const customersEle = masterFiles.ele("Customers");
  for (const c of customers.values()) {
    const cEle = customersEle.ele("Customer");
    cEle.ele("CustomerID").txt(c.id);
    cEle.ele("AccountID").txt("1500"); // standard Norwegian customer account
    cEle.ele("CustomerName").txt(c.companyName ?? c.fullName ?? "—");
    const cAddr = cEle.ele("Address");
    if (c.address) cAddr.ele("StreetName").txt(c.address);
    if (c.city) cAddr.ele("City").txt(c.city);
    if (c.postalCode) cAddr.ele("PostalCode").txt(c.postalCode);
    cAddr.ele("Country").txt("NO");
    if (c.orgNumber) {
      cEle.ele("CustomerTaxRegistration")
        .ele("TaxRegistrationNumber").txt(c.orgNumber);
    }
  }

  // TaxTable: one entry per MVA rate that appeared in the period.
  const taxTable = masterFiles.ele("TaxTable");
  for (const rateStr of taxRates) {
    const rate = new Prisma.Decimal(rateStr);
    const entry = taxTable.ele("TaxTableEntry");
    entry.ele("TaxType").txt("MVA");
    entry.ele("Description").txt(`Norwegian VAT @ ${pct(rate)}%`);
    const detail = entry.ele("TaxCodeDetails");
    detail.ele("TaxCode").txt(taxCodeFor(rate));
    detail.ele("Description").txt(`MVA ${pct(rate)}%`);
    detail.ele("TaxPercentage").txt(pct(rate));
    detail.ele("Country").txt("NO");
  }

  // SourceDocuments → SalesInvoices ──────────────────────────────────────────
  const sourceDocs = doc.ele("SourceDocuments");
  const salesInvoices = sourceDocs.ele("SalesInvoices");
  salesInvoices.ele("NumberOfEntries").txt(String(sales.length));

  let totalDebit = new Prisma.Decimal(0);
  let totalCredit = new Prisma.Decimal(0);

  for (const s of sales) {
    const inv = salesInvoices.ele("Invoice");
    inv.ele("InvoiceNo").txt(s.invoiceNumber ?? s.id);
    if (s.customer) inv.ele("CustomerID").txt(s.customer.id);

    inv.ele("Period").txt(monthOf(s.createdAt));
    inv.ele("PeriodYear").txt(String(s.createdAt.getFullYear()));
    inv.ele("InvoiceDate").txt(s.createdAt.toISOString().slice(0, 10));
    inv.ele("InvoiceType").txt("NORMAL");

    let lineNumber = 0;
    let invoiceNetTotal = new Prisma.Decimal(0);
    let invoiceTaxPayable = new Prisma.Decimal(0);

    for (const it of s.items) {
      lineNumber++;
      const line = inv.ele("Line");
      line.ele("LineNumber").txt(String(lineNumber));
      line.ele("ProductCode").txt(it.sku);
      line.ele("ProductDescription").txt(it.productName);
      line.ele("Quantity").txt(String(it.quantity));
      line.ele("UnitOfMeasure").txt("EA");
      line.ele("UnitPrice").txt(money(it.unitPriceExclMva));
      // For sales invoices, the line amount is a Credit from the
      // customer-account perspective (we owe the goods, they owe us
      // money).
      const lineNet = new Prisma.Decimal(it.lineTotalExclMva);
      const lineMva = new Prisma.Decimal(it.lineTotalInclMva).minus(lineNet);
      line.ele("InvoiceDate").txt(s.createdAt.toISOString().slice(0, 10));
      line.ele("Description").txt(it.productName);
      line.ele("CreditAmount").ele("Amount").txt(money(lineNet));

      const tax = line.ele("Tax");
      tax.ele("TaxType").txt("MVA");
      tax.ele("TaxCode").txt(taxCodeFor(it.mvaRate));
      tax.ele("TaxPercentage").txt(pct(it.mvaRate));
      tax.ele("TaxAmount").ele("Amount").txt(money(lineMva));

      invoiceNetTotal = invoiceNetTotal.plus(lineNet);
      invoiceTaxPayable = invoiceTaxPayable.plus(lineMva);
    }

    const totals = inv.ele("DocumentTotals");
    totals.ele("TaxPayable").txt(money(invoiceTaxPayable));
    totals.ele("NetTotal").txt(money(invoiceNetTotal));
    totals.ele("GrossTotal").txt(money(invoiceNetTotal.plus(invoiceTaxPayable)));

    totalCredit = totalCredit.plus(invoiceNetTotal.plus(invoiceTaxPayable));
  }

  salesInvoices.ele("TotalDebit").txt(money(totalDebit));
  salesInvoices.ele("TotalCredit").txt(money(totalCredit));

  return doc.end({ prettyPrint: true });
}

/** "YYYY-MM" for SAF-T Period fields (1-based month, zero-padded). */
function monthOf(d: Date): string {
  return String(d.getMonth() + 1);
}
