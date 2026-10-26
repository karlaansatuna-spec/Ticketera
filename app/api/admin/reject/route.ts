import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getReservationById, rejectReservation } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const id = (body.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Falta el identificador de la solicitud." }, { status: 400 });
  }

  try {
    const reservation = await getReservationById(id);
    if (!reservation) {
      return NextResponse.json({ error: "No se encontró la solicitud." }, { status: 404 });
    }

    const result = await rejectReservation(id);
    if (!result) {
      return NextResponse.json({ error: "No se encontró la solicitud." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      alreadyRejected: result.alreadyRejected,
      reservation: result.reservation,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Error al rechazar la solicitud.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
