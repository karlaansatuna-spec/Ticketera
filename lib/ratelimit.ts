// Limitador simple en memoria para frenar envíos masivos accidentales
// desde el panel de administrador. Es una protección "best effort":
// se reinicia si la función serverless se reinicia (comportamiento normal
// en Vercel), pero funciona bien combinado con la protección principal,
// que es exigir sesión de administrador y no permitir reenviar una misma
// solicitud dos veces (ver lib/sheets.ts -> markReservationSent).

const WINDOW_MS = 10 * 60 * 1000; // 10 minutos
const MAX_SENDS_PER_WINDOW = 20;

let sendTimestamps: number[] = [];

export function allowEmailSend(): boolean {
  const now = Date.now();
  sendTimestamps = sendTimestamps.filter((t) => now - t < WINDOW_MS);
  if (sendTimestamps.length >= MAX_SENDS_PER_WINDOW) {
    return false;
  }
  sendTimestamps.push(now);
  return true;
}
