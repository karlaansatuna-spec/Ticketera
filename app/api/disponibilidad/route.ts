import { NextRequest, NextResponse } from "next/server";
import { getParkingLotAvailability } from "@/lib/sheets";
import { isValidDateStr, isValidTimeStr } from "@/lib/time";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dia = (searchParams.get("dia") || "").trim();
  const horaEntrada = (searchParams.get("horaEntrada") || "").trim();
  const horaSalida = (searchParams.get("horaSalida") || "").trim();

  if (!isValidDateStr(dia) || !isValidTimeStr(horaEntrada) || !isValidTimeStr(horaSalida)) {
    return NextResponse.json({ error: "Fecha u hora inválidas." }, { status: 400 });
  }
  if (horaSalida <= horaEntrada) {
    return NextResponse.json(
      { error: "La hora de salida debe ser posterior a la hora de entrada." },
      { status: 400 }
    );
  }

  try {
    const disponibilidad = await getParkingLotAvailability({ dia, horaEntrada, horaSalida });
    return NextResponse.json({ disponibilidad });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "No se pudo consultar la disponibilidad.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}