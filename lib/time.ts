// Utilidades de fecha/hora compartidas entre cliente y servidor.
// Se trabaja siempre con strings "YYYY-MM-DD" y "HH:MM" en hora local,
// sin conversiones de zona horaria (ver README, sección "Zona horaria").

export function isValidDateStr(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

export function isValidTimeStr(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

export function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function computeDurationHours(horaEntrada: string, horaSalida: string): number {
  const diff = timeToMinutes(horaSalida) - timeToMinutes(horaEntrada);
  return Math.round((diff / 60) * 100) / 100;
}

export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}
