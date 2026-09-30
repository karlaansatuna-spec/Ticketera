import { NextResponse } from "next/server";
import { getVehicleTypes } from "@/lib/sheets";

export async function GET() {
  try {
    const tipos = await getVehicleTypes();
    return NextResponse.json({ tipos });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Error obteniendo los tipos de vehículo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}