import { NextResponse } from "next/server";
import { getParkingLots } from "@/lib/sheets";

export async function GET() {
  try {
    const lots = await getParkingLots();
    return NextResponse.json({ parqueaderos: lots });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Error obteniendo los parqueaderos.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
