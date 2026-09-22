import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getReservations } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const reservas = await getReservations();
    return NextResponse.json({ reservas });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Error obteniendo las solicitudes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
