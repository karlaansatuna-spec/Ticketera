import { NextRequest, NextResponse } from "next/server";
import { addReservation, getParkingLots, getVehicleTypes, hasCapacityConflict, isEmailAllowed } from "@/lib/sheets";
import { sendAdminNotificationEmail } from "@/lib/email";
import { computeDurationHours, isValidDateStr, isValidTimeStr, todayStr } from "@/lib/time";
import { isValidVisitorName } from "@/lib/validation";
import type { NewReservationInput } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: Partial<NewReservationInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const email = (body.email || "").trim();
  const nombreVisitante = (body.nombreVisitante || "").trim();
  const placa = (body.placa || "").trim();
  const tipoVehiculo = (body.tipoVehiculo || "").trim();
  const parqueadero = (body.parqueadero || "").trim();
  const dia = (body.dia || "").trim();
  const horaEntrada = (body.horaEntrada || "").trim();
  const horaSalida = (body.horaSalida || "").trim();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "El correo electrónico no es válido." }, { status: 400 });
  }
  if (!nombreVisitante) {
    return NextResponse.json({ error: "Ingresa el nombre del visitante." }, { status: 400 });
  }
  if (!isValidVisitorName(nombreVisitante)) {
    return NextResponse.json(
      { error: "El nombre del visitante solo puede contener letras y espacios (sin números)." },
      { status: 400 }
    );
  }
  if (!placa) {
    return NextResponse.json({ error: "Ingresa el número de placa del vehículo." }, { status: 400 });
  }
  if (!tipoVehiculo) {
    return NextResponse.json({ error: "Selecciona el tipo de vehículo." }, { status: 400 });
  }
  if (!isValidDateStr(dia)) {
    return NextResponse.json({ error: "Selecciona un día válido." }, { status: 400 });
  }
  if (dia < todayStr()) {
    return NextResponse.json({ error: "El día de la visita no puede ser en el pasado." }, { status: 400 });
  }
  if (!isValidTimeStr(horaEntrada) || !isValidTimeStr(horaSalida)) {
    return NextResponse.json({ error: "Ingresa una hora de entrada y salida válidas." }, { status: 400 });
  }
  if (horaSalida <= horaEntrada) {
    return NextResponse.json(
      { error: "La hora de salida debe ser posterior a la hora de entrada." },
      { status: 400 }
    );
  }
  if (!parqueadero) {
    return NextResponse.json({ error: "Selecciona un parqueadero." }, { status: 400 });
  }

  try {
    const [emailOk, lots, tipos] = await Promise.all([isEmailAllowed(email), getParkingLots(), getVehicleTypes()]);

    if (!emailOk) {
      return NextResponse.json({ error: "Este correo no está autorizado para reservar." }, { status: 403 });
    }
    if (!lots.includes(parqueadero)) {
      return NextResponse.json({ error: "El parqueadero seleccionado no es válido." }, { status: 400 });
    }
    if (!tipos.includes(tipoVehiculo)) {
      return NextResponse.json({ error: "El tipo de vehículo seleccionado no es válido." }, { status: 400 });
    }

    const conflict = await hasCapacityConflict({ parqueadero, dia, horaEntrada, horaSalida });
    if (conflict) {
      return NextResponse.json(
        {
          error: `${parqueadero} ya tiene una visita agendada que se cruza con ese horario el ${dia}. Elige otra hora u otro parqueadero.`,
        },
        { status: 409 }
      );
    }

    const duracionHoras = computeDurationHours(horaEntrada, horaSalida);
    if (duracionHoras <= 0) {
      return NextResponse.json({ error: "El horario ingresado no es válido." }, { status: 400 });
    }

    const reservation = await addReservation({
      email,
      nombreVisitante,
      placa,
      tipoVehiculo,
      parqueadero,
      dia,
      horaEntrada,
      horaSalida,
      duracionHoras: String(duracionHoras),
    });

    // Aviso al administrador: es un "plus", no debe hacer fallar la reserva
    // si el correo no se puede enviar en este momento (la reserva ya quedó
    // guardada en la hoja de cálculo de todas formas).
    try {
      await sendAdminNotificationEmail(reservation);
    } catch (err) {
      console.error("[book] No se pudo enviar la notificación al administrador:", err);
    }

    return NextResponse.json({ reservation }, { status: 201 });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Error guardando la reserva.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}