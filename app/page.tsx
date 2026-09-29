"use client";

import { useEffect, useState } from "react";
import { Card, ErrorAlert, Field, PrimaryButton, SecondaryButton, SuccessAlert, inputClass } from "./components/ui";
import { computeDurationHours, formatDuration, todayStr } from "@/lib/time";
import { sanitizeVisitorNameInput } from "@/lib/validation";
import type { Reservation } from "@/lib/types";

type Step = "email" | "form" | "success";
type Disponibilidad = { parqueadero: string; disponible: boolean };

export default function Home() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");

  const [nombreVisitante, setNombreVisitante] = useState("");
  const [placa, setPlaca] = useState("");
  const [parqueadero, setParqueadero] = useState("");
  const [dia, setDia] = useState("");
  const [horaEntrada, setHoraEntrada] = useState("");
  const [horaSalida, setHoraSalida] = useState("");

  // El resultado (o el error) queda etiquetado con el día/horario al que
  // corresponde, para poder saber en el render si sigue vigente o si quedó
  // desactualizado por un cambio de fecha/hora, sin tener que "limpiarlo"
  // manualmente con un setState síncrono dentro del efecto.
  const [dispoState, setDispoState] = useState<{
    dia: string;
    horaEntrada: string;
    horaSalida: string;
    items: Disponibilidad[];
  } | null>(null);
  const [dispoError, setDispoError] = useState<{
    dia: string;
    horaEntrada: string;
    horaSalida: string;
    message: string;
  } | null>(null);

  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [lastReservation, setLastReservation] = useState<Reservation | null>(null);

  const horarioCompleto =
    !!dia && !!horaEntrada && !!horaSalida && horaSalida > horaEntrada;

  const dispoVigente =
    dispoState && dispoState.dia === dia && dispoState.horaEntrada === horaEntrada && dispoState.horaSalida === horaSalida
      ? dispoState.items
      : null;
  const dispoErrorVigente =
    dispoError && dispoError.dia === dia && dispoError.horaEntrada === horaEntrada && dispoError.horaSalida === horaSalida
      ? dispoError.message
      : "";
  const dispoLoading = horarioCompleto && !dispoVigente && !dispoErrorVigente;

  // Cada vez que cambia el día u horario, se consulta qué parqueaderos están
  // libres para ese horario exacto (evita que el solicitante tenga que
  // "adivinar" cuál elegir). Con un pequeño debounce para no disparar una
  // consulta por cada tecla mientras se termina de escribir la hora.
  useEffect(() => {
    if (step !== "form" || !horarioCompleto) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ dia, horaEntrada, horaSalida });
      fetch(`/api/disponibilidad?${params.toString()}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (data.error) {
            setDispoError({ dia, horaEntrada, horaSalida, message: data.error });
            return;
          }
          const items: Disponibilidad[] = data.disponibilidad || [];
          setDispoState({ dia, horaEntrada, horaSalida, items });
          // Si el parqueadero que tenía elegido ya no está libre en el nuevo
          // horario, se limpia la selección para que no quede algo inválido.
          setParqueadero((prev) => {
            if (!prev) return prev;
            const actual = items.find((d) => d.parqueadero === prev);
            return actual && actual.disponible ? prev : "";
          });
        })
        .catch(() => {
          if (!cancelled) {
            setDispoError({
              dia,
              horaEntrada,
              horaSalida,
              message: "No se pudo consultar la disponibilidad de parqueaderos.",
            });
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [step, dia, horaEntrada, horaSalida, horarioCompleto]);

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
      setFormError("Completa todos los campos y elige un parqueadero disponible.");
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
    setDispoState(null);
    setDispoError(null);
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
    setDispoState(null);
    setDispoError(null);
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
        <Card className="max-w-2xl">
          <h2 className="mb-1 text-lg font-semibold">Datos de la visita</h2>
          <p className="mb-4 text-sm text-zinc-500">{email}</p>
          <form onSubmit={handleBookingSubmit}>
            {formError && <ErrorAlert message={formError} />}

            <Field label="Nombre del visitante">
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
            {dia && horaEntrada && horaSalida && horaSalida <= horaEntrada && (
              <p className="-mt-2 mb-4 text-xs text-red-600">La hora de salida debe ser posterior a la de entrada.</p>
            )}

            <div className="mb-4">
              <span className="mb-2 block text-sm font-medium text-zinc-700">Parqueadero</span>

              {!horarioCompleto && (
                <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-500">
                  Elige el día y el horario para ver qué parqueaderos están disponibles.
                </p>
              )}

              {horarioCompleto && dispoLoading && (
                <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-500">
                  Consultando disponibilidad...
                </p>
              )}

              {horarioCompleto && !dispoLoading && dispoErrorVigente && <ErrorAlert message={dispoErrorVigente} />}

              {horarioCompleto && !dispoLoading && !dispoErrorVigente && dispoVigente && dispoVigente.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {dispoVigente.map((d) => {
                    const selected = parqueadero === d.parqueadero;
                    return (
                      <button
                        key={d.parqueadero}
                        type="button"
                        disabled={!d.disponible}
                        onClick={() => setParqueadero(d.parqueadero)}
                        className={[
                          "rounded-lg border px-3 py-3 text-left text-sm transition",
                          d.disponible
                            ? selected
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"
                            : "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400",
                        ].join(" ")}
                      >
                        <span className="block font-medium">{d.parqueadero}</span>
                        <span
                          className={[
                            "mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                            d.disponible
                              ? selected
                                ? "bg-white/20 text-white"
                                : "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-600",
                          ].join(" ")}
                        >
                          {d.disponible ? "Disponible" : "Ocupado"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <PrimaryButton type="submit" disabled={formLoading || !parqueadero}>
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
            <SummaryRow label="Visitante" value={lastReservation.nombreVisitante} />
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