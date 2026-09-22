import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { sendReservationRequestEmail } from "@/lib/email";
import { allowEmailSend } from "@/lib/ratelimit";
import { getReservationById, markReservationSent } from "@/lib/sheets";

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

    // Protección contra reenvíos: si ya se envió antes, no se vuelve a enviar.
    if (reservation.estado === "Enviado") {
      return NextResponse.json(
        { ok: true, alreadySent: true, reservation, message: "Esta solicitud ya había sido enviada por correo." },
        { status: 200 }
      );
    }

    if (!allowEmailSend()) {
      return NextResponse.json(
        { error: "Se alcanzó el límite temporal de envíos de correo. Espera unos minutos e inténtalo de nuevo." },
        { status: 429 }
      );
    }

    await sendReservationRequestEmail(reservation);
    const result = await markReservationSent(id);

    return NextResponse.json({ ok: true, alreadySent: false, reservation: result?.reservation ?? reservation });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Error enviando la solicitud por correo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
