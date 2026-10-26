"use client";

import { useEffect, useState } from "react";
import { Card, ErrorAlert, Field, PrimaryButton, inputClass } from "../components/ui";
import { formatDuration } from "@/lib/time";
import type { Reservation } from "@/lib/types";

export default function AdminPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [reservas, setReservas] = useState<Reservation[]>([]);
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(true);

  const [sendingId, setSendingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rowMessages, setRowMessages] = useState<Record<string, string>>({});

  // Usada por acciones del usuario (botón "Actualizar", tras iniciar/cerrar sesión).
  async function loadReservas() {
    setListLoading(true);
    setListError("");
    try {
      const res = await fetch("/api/admin/reservas", { cache: "no-store" });
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setListError(data.error || "No se pudieron cargar las solicitudes.");
        return;
      }
      setAuthenticated(true);
      setReservas(data.reservas || []);
    } catch {
      setListError("No se pudieron cargar las solicitudes.");
    } finally {
      setListLoading(false);
      setAuthChecked(true);
    }
  }

  // Carga inicial al montar el componente: todo el trabajo con setState ocurre
  // dentro de los callbacks de la promesa (no de forma síncrona en el efecto).
  useEffect(() => {
    let ignore = false;
    fetch("/api/admin/reservas", { cache: "no-store" })
      .then(async (res) => {
        if (ignore) return;
        if (res.status === 401) {
          setAuthenticated(false);
          return;
        }
        const data = await res.json();
        if (ignore) return;
        if (!res.ok) {
          setListError(data.error || "No se pudieron cargar las solicitudes.");
          return;
        }
        setAuthenticated(true);
        setReservas(data.reservas || []);
      })
      .catch(() => {
        if (!ignore) setListError("No se pudieron cargar las solicitudes.");
      })
      .finally(() => {
        if (!ignore) {
          setListLoading(false);
          setAuthChecked(true);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "No se pudo iniciar sesión.");
        return;
      }
      setPassword("");
      await loadReservas();
    } catch {
      setLoginError("No se pudo iniciar sesión.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setReservas([]);
  }

  async function handleSend(id: string) {
    setSendingId(id);
    setRowMessages((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch("/api/admin/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRowMessages((prev) => ({ ...prev, [id]: data.error || "No se pudo enviar." }));
        return;
      }
      if (data.reservation) {
        setReservas((prev) => prev.map((r) => (r.id === id ? data.reservation : r)));
      }
      setRowMessages((prev) => ({
        ...prev,
        [id]: data.alreadySent ? "Ya se había enviado antes." : "Enviado correctamente.",
      }));
    } catch {
      setRowMessages((prev) => ({ ...prev, [id]: "No se pudo enviar." }));
    } finally {
      setSendingId(null);
    }
  }

  async function handleReject(id: string) {
    setRejectingId(id);
    setRowMessages((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch("/api/admin/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRowMessages((prev) => ({ ...prev, [id]: data.error || "No se pudo rechazar." }));
        return;
      }
      if (data.reservation) {
        setReservas((prev) => prev.map((r) => (r.id === id ? data.reservation : r)));
      }
      setRowMessages((prev) => ({
        ...prev,
        [id]: data.alreadyRejected ? "Ya estaba rechazada." : "Solicitud rechazada. El espacio quedó libre.",
      }));
    } catch {
      setRowMessages((prev) => ({ ...prev, [id]: "No se pudo rechazar." }));
    } finally {
      setRejectingId(null);
    }
  }

  if (!authChecked) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12 text-sm text-zinc-500">Cargando...</div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Card>
          <h1 className="mb-4 text-lg font-semibold">Acceso de administrador</h1>
          <form onSubmit={handleLogin}>
            {loginError && <ErrorAlert message={loginError} />}
            <Field label="Contraseña">
              <input
                type="password"
                required
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <PrimaryButton type="submit" disabled={loginLoading}>
              {loginLoading ? "Ingresando..." : "Ingresar"}
            </PrimaryButton>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-[1600px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Solicitudes de visita</h1>
            <p className="text-sm text-zinc-500">Panel de administrador</p>
          </div>
          <div className="flex gap-2">
            <a
              href="/api/admin/export"
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              Descargar Excel
            </a>
            <button
              onClick={loadReservas}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              Actualizar
            </button>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        {listError && <ErrorAlert message={listError} />}

        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <Th>Solicitante</Th>
                <Th>Visitante</Th>
                <Th>Placa</Th>
                <Th>Tipo</Th>
                <Th>Parqueadero</Th>
                <Th>Día</Th>
                <Th>Entrada</Th>
                <Th>Salida</Th>
                <Th>Duración</Th>
                <Th>Estado</Th>
                <Th>Acción</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {reservas.map((r) => (
                <tr key={r.id}>
                  <Td>{r.email}</Td>
                  <Td>{r.nombreVisitante}</Td>
                  <Td>{r.placa}</Td>
                  <Td>{r.tipoVehiculo}</Td>
                  <Td>{r.parqueadero}</Td>
                  <Td>{r.dia}</Td>
                  <Td>{r.horaEntrada}</Td>
                  <Td>{r.horaSalida}</Td>
                  <Td>{formatDuration(Number(r.duracionHoras))}</Td>
                  <Td>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        r.estado === "Enviado"
                          ? "bg-emerald-100 text-emerald-700"
                          : r.estado === "Rechazado"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {r.estado}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleSend(r.id)}
                          disabled={r.estado !== "Pendiente" || sendingId === r.id || rejectingId === r.id}
                          className="whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                        >
                          {sendingId === r.id ? "Enviando..." : r.estado === "Enviado" ? "Enviado" : "Enviar solicitud"}
                        </button>
                        <button
                          onClick={() => handleReject(r.id)}
                          disabled={r.estado !== "Pendiente" || sendingId === r.id || rejectingId === r.id}
                          className="whitespace-nowrap rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-300"
                        >
                          {rejectingId === r.id ? "Rechazando..." : r.estado === "Rechazado" ? "Rechazado" : "Rechazar"}
                        </button>
                      </div>
                      {rowMessages[r.id] && <span className="text-xs text-zinc-500">{rowMessages[r.id]}</span>}
                    </div>
                  </Td>
                </tr>
              ))}
              {!listLoading && reservas.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-sm text-zinc-400">
                    Todavía no hay solicitudes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-3">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap px-3 py-3 text-zinc-700">{children}</td>;
}