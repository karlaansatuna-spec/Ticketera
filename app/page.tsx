"use client";

import { useEffect, useState } from "react";
import { Card, ErrorAlert, Field, PrimaryButton, SecondaryButton, SuccessAlert, inputClass } from "./components/ui";
import { computeDurationHours, formatDuration, todayStr } from "@/lib/time";
import { sanitizeVisitorNameInput } from "@/lib/validation";
import type { Reservation } from "@/lib/types";

type Step = "email" | "form" | "success";

export default function Home() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");

  const [parqueaderos, setParqueaderos] = useState<string[]>([]);
  const [parqueaderosError, setParqueaderosError] = useState("");

  const [nombreVisitante, setNombreVisitante] = useState("");
  const [placa, setPlaca] = useState("");
  const [parqueadero, setParqueadero] = useState("");
  const [dia, setDia] = useState("");
  const [horaEntrada, setHoraEntrada] = useState("");
  const [horaSalida, setHoraSalida] = useState("");

  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [lastReservation, setLastReservation] = useState<Reservation | null>(null);

  useEffect(() => {
    if (step !== "form" || parqueaderos.length) return;
    let cancelled = false;
    fetch("/api/parqueaderos")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setParqueaderosError(data.error);
        } else {
          setParqueaderos(data.parqueaderos || []);
        }
      })
      .catch(() => {
        if (!cancelled) setParqueaderosError("No se pudo cargar la lista de parqueaderos.");
      });
    return () => {
      cancelled = true;
    };
  }, [step, parqueaderos.length]);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    setEmailLoading(true);
    try {
      const res = await fetch("/api/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.allowed) {
        setEmailError(data.error || "Este correo no está autorizado.");
        return;
      }
      setStep("form");
    } catch {
      setEmailError("No se pudo verificar el correo. Intenta de nuevo.");
    } finally {
      setEmailLoading(false);
    }
  }

  const duracion =
    horaEntrada && horaSalida && horaSalida > horaEntrada ? computeDurationHours(horaEntrada, horaSalida) : null;

  async function handleBookingSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!nombreVisitante || !placa || !parqueadero || !dia || !horaEntrada || !horaSalida) {
      setFormError("Completa todos los campos.");
      return;
    }
    if (horaSalida <= horaEntrada) {
      setFormError("La hora de salida debe ser posterior a la hora de entrada.");
      return;
    }

    setFormLoading(true);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, nombreVisitante, placa, parqueadero, dia, horaEntrada, horaSalida }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "No se pudo registrar la reserva.");
        return;
      }
      setLastReservation(data.reservation);
      setStep("success");
    } catch {
      setFormError("No se pudo registrar la reserva. Intenta de nuevo.");
    } finally {
      setFormLoading(false);
    }
  }

  function resetAll() {
    setStep("email");
    setEmail("");
    setNombreVisitante("");
    setPlaca("");
    setParqueadero("");
    setDia("");
    setHoraEntrada("");
    setHoraSalida("");
    setLastReservation(null);
    setFormError("");
  }

  function newBookingSameEmail() {
    setStep("form");
    setNombreVisitante("");
    setPlaca("");
    setParqueadero("");
    setDia("");
    setHoraEntrada("");
    setHoraSalida("");
    setLastReservation(null);
    setFormError("");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-zinc-900">Ticketera de Visitas</h1>
        <p className="mt-1 text-sm text-zinc-500">Reserva tu acceso a los parqueaderos</p>
      </div>

      {step === "email" && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Ingresa tu correo</h2>
          <p className="mb-4 text-sm text-zinc-500">
            Solo las personas autorizadas pueden reservar. Ingresa tu correo para continuar.
          </p>
          <form onSubmit={handleEmailSubmit}>
            {emailError && <ErrorAlert message={emailError} />}
            <Field label="Correo electrónico">
              <input
                type="email"
                required
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@empresa.com"
              />
            </Field>
            <PrimaryButton type="submit" disabled={emailLoading}>
              {emailLoading ? "Verificando..." : "Continuar"}
            </PrimaryButton>
          </form>
        </Card>
      )}

      {step === "form" && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Datos de la visita</h2>
          <p className="mb-4 text-sm text-zinc-500">{email}</p>
          <form onSubmit={handleBookingSubmit}>
            {formError && <ErrorAlert message={formError} />}
            {parqueaderosError && <ErrorAlert message={parqueaderosError} />}

            <Field label="Nombre del conductor">
              <input
                type="text"
                required
                className={inputClass}
                value={nombreVisitante}
                onChange={(e) => setNombreVisitante(sanitizeVisitorNameInput(e.target.value))}
                placeholder="Ej. Juan Pérez"
              />
            </Field>

            <Field label="Número de placa del vehículo">
              <input
                type="text"
                required
                className={inputClass}
                value={placa}
                onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                placeholder="Ej. ABC-1234"
              />
            </Field>

            <Field label="Parqueadero">
              <select
                required
                className={inputClass}
                value={parqueadero}
                onChange={(e) => setParqueadero(e.target.value)}
              >
                <option value="" disabled>
                  Selecciona un parqueadero
                </option>
                {parqueaderos.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Día de la visita">
              <input
                type="date"
                required
                min={todayStr()}
                className={inputClass}
                value={dia}
                onChange={(e) => setDia(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Hora de entrada">
                <input
                  type="time"
                  required
                  className={inputClass}
                  value={horaEntrada}
                  onChange={(e) => setHoraEntrada(e.target.value)}
                />
              </Field>
              <Field label="Hora de salida">
                <input
                  type="time"
                  required
                  className={inputClass}
                  value={horaSalida}
                  onChange={(e) => setHoraSalida(e.target.value)}
                />
              </Field>
            </div>

            {duracion !== null && (
              <p className="-mt-2 mb-4 text-xs text-zinc-500">Duración estimada: {formatDuration(duracion)}</p>
            )}

            <PrimaryButton type="submit" disabled={formLoading}>
              {formLoading ? "Reservando..." : "Reservar"}
            </PrimaryButton>
            <div className="mt-3">
              <SecondaryButton type="button" onClick={resetAll}>
                Cambiar de correo
              </SecondaryButton>
            </div>
          </form>
        </Card>
      )}

      {step === "success" && lastReservation && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Reserva registrada</h2>
          <SuccessAlert message="Tu solicitud fue registrada correctamente. El administrador la revisará y enviará la solicitud formal." />
          <dl className="mb-6 divide-y divide-zinc-100 text-sm">
            <SummaryRow label="Conductor" value={lastReservation.nombreVisitante} />
            <SummaryRow label="Placa" value={lastReservation.placa} />
            <SummaryRow label="Parqueadero" value={lastReservation.parqueadero} />
            <SummaryRow label="Día" value={lastReservation.dia} />
            <SummaryRow label="Hora de entrada" value={lastReservation.horaEntrada} />
            <SummaryRow label="Hora de salida" value={lastReservation.horaSalida} />
            <SummaryRow label="Duración" value={formatDuration(Number(lastReservation.duracionHoras))} />
            <SummaryRow label="ID de solicitud" value={lastReservation.id} />
          </dl>
          <PrimaryButton onClick={newBookingSameEmail}>Hacer otra reserva</PrimaryButton>
          <div className="mt-3">
            <SecondaryButton onClick={resetAll}>Salir</SecondaryButton>
          </div>
        </Card>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-900">{value}</dd>
    </div>
  );
}