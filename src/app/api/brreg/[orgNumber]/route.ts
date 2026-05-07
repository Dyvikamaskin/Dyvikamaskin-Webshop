import { NextResponse, type NextRequest } from "next/server";
import {
  lookupOrgNumber,
  isCompanyActive,
  formatBrregAddress,
} from "@/lib/brreg";

/**
 * GET /api/brreg/:orgNumber
 *
 * Server-side proxy for Brreg lookups — keeps the Brreg API off the client.
 * Returns a slim DTO so the entry modal can show company name + address.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgNumber: string }> }
) {
  const { orgNumber } = await params;

  const enhet = await lookupOrgNumber(orgNumber);

  if (!enhet) {
    return NextResponse.json(
      { error: "Organisasjonsnummeret ble ikke funnet." },
      { status: 404 }
    );
  }

  if (!isCompanyActive(enhet)) {
    return NextResponse.json(
      {
        error:
          "Selskapet er ikke aktivt (oppløst, konkurs eller under avvikling).",
      },
      { status: 422 }
    );
  }

  return NextResponse.json({
    orgNumber: enhet.organisasjonsnummer,
    name: enhet.navn,
    address: formatBrregAddress(enhet),
    vatRegistered: enhet.registrertIMvaregisteret ?? false,
    orgType: enhet.organisasjonsform?.kode,
  });
}
