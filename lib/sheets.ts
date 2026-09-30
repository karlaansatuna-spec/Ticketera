import { GoogleSpreadsheet, GoogleSpreadsheetRow, GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import type { Reservation } from "./types";
import { timesOverlap } from "./time";

const SHEET_TITLES = {
  reservas: "Reservas",
  emails: "EmailsPermitidos",
  parqueaderos: "Parqueaderos",
  tiposVehiculo: "TiposVehiculo",
} as const;

const DEFAULT_PARKING_LOTS = [
  "Parqueadero 1",
  "Parqueadero 2",
  "Parqueadero 3",
  "Parqueadero 4",
  "Parqueadero 5",
  "Parqueadero 6",
];

const DEFAULT_VEHICLE_TYPES = ["Automóvil", "Camión", "Camioneta"];

function getPrivateKey(): string {
  const raw = process.env.GOOGLE_PRIVATE_KEY || "";
  // En Vercel las variables de entorno no admiten saltos de línea reales,
  // así que la clave se guarda con "\n" literales y aquí se convierten.
  const key = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;

  // Chequeo básico de formato: si falta el encabezado/pie, o el cuerpo quedó
  // muy corto, es casi siempre un problema de copiado (se pegó incompleta, o
  // se cortó en un salto de línea real al pegarla en el .env). Mejor avisar
  // claro acá que dejar que falle más adelante con un error críptico de
  // OpenSSL ("DECODER routines::unsupported").
  const looksComplete =
    key.includes("BEGIN PRIVATE KEY") && key.includes("END PRIVATE KEY") && key.length > 200;
  if (!looksComplete) {
    throw new Error(
      "GOOGLE_PRIVATE_KEY parece estar incompleta o mal copiada (falta el encabezado/pie, o el texto quedó muy corto). " +
        "Vuelve a copiar el valor completo de \"private_key\" del archivo .json de la cuenta de servicio, " +
        'entre comillas, en una sola línea, con los "\\n" tal como aparecen en el archivo (no como saltos de línea reales).'
    );
  }

  return key;
}

function assertEnv() {
  const missing = ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_SHEET_ID"].filter(
    (key) => !process.env[key]
  );
  if (missing.length) {
    throw new Error(
      `Faltan variables de entorno para conectar con Google Sheets: ${missing.join(", ")}. Revisa el archivo .env.example.`
    );
  }
}

// Se reutiliza la conexión mientras la función serverless siga "caliente".
let cachedDoc: GoogleSpreadsheet | null = null;

async function getDoc(): Promise<GoogleSpreadsheet> {
  assertEnv();
  if (cachedDoc) return cachedDoc;
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: getPrivateKey(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID!, auth);
  try {
    await doc.loadInfo();
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "ERR_OSSL_UNSUPPORTED" || code === "ERR_OSSL_DECODER_UNSUPPORTED") {
      throw new Error(
        "GOOGLE_PRIVATE_KEY no tiene un formato válido (error de OpenSSL al leerla). Revisa que la copiaste completa " +
          "desde el archivo .json de la cuenta de servicio, tal cual, sin editarla."
      );
    }
    throw err;
  }
  cachedDoc = doc;
  return doc;
}

async function getSheet(title: string): Promise<GoogleSpreadsheetWorksheet> {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle[title];
  if (!sheet) {
    throw new Error(
      `No se encontró la pestaña "${title}" en la hoja de Google Sheets. Verifica que exista una pestaña con ese nombre exacto.`
    );
  }
  return sheet;
}

function rowToReservation(row: GoogleSpreadsheetRow): Reservation {
  return {
    id: String(row.get("ID") || ""),
    creadoEn: String(row.get("CreadoEn") || ""),
    email: String(row.get("Email") || ""),
    nombreVisitante: String(row.get("NombreVisitante") || ""),
    placa: String(row.get("Placa") || ""),
    tipoVehiculo: String(row.get("TipoVehiculo") || ""),
    parqueadero: String(row.get("Parqueadero") || ""),
    dia: String(row.get("Dia") || ""),
    horaEntrada: String(row.get("HoraEntrada") || ""),
    horaSalida: String(row.get("HoraSalida") || ""),
    duracionHoras: String(row.get("DuracionHoras") || ""),
    estado: row.get("Estado") === "Enviado" ? "Enviado" : "Pendiente",
    enviadoEn: String(row.get("EnviadoEn") || ""),
  };
}

export async function getAllowedEmails(): Promise<string[]> {
  // La pestaña EmailsPermitidos es opcional: si solo usas ALLOWED_EMAIL_DOMAINS
  // (acceso por dominio de correo) puedes borrarla sin problema. Si no existe,
  // simplemente se considera una lista vacía en vez de dar error.
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle[SHEET_TITLES.emails];
  if (!sheet) return [];
  const rows = await sheet.getRows();
  return rows
    .map((r) => String(r.get("Email") || "").trim().toLowerCase())
    .filter(Boolean);
}

// Dominios de correo que entran automáticamente, sin tener que estar en la
// lista de EmailsPermitidos (ej. "tigo.com.ec" -> cualquier @tigo.com.ec).
// Se configura con la variable de entorno ALLOWED_EMAIL_DOMAINS (separados
// por coma). Si no se configura, solo entra quien esté en la lista.
function getAllowedDomains(): string[] {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS || "";
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

function emailMatchesAllowedDomain(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  return getAllowedDomains().includes(domain);
}

export async function isEmailAllowed(email: string): Promise<boolean> {
  // Primero el chequeo de dominio (gratis, sin llamar a Google Sheets).
  if (emailMatchesAllowedDomain(email)) return true;
  const list = await getAllowedEmails();
  return list.includes(email.trim().toLowerCase());
}

export async function getParkingLots(): Promise<string[]> {
  const sheet = await getSheet(SHEET_TITLES.parqueaderos);
  const rows = await sheet.getRows();
  const names = rows.map((r) => String(r.get("Nombre") || "").trim()).filter(Boolean);
  return names.length ? names : DEFAULT_PARKING_LOTS;
}

// La pestaña TiposVehiculo es opcional: si no existe (ej. hojas creadas antes
// de este cambio), se usa una lista por defecto en vez de dar error.
export async function getVehicleTypes(): Promise<string[]> {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle[SHEET_TITLES.tiposVehiculo];
  if (!sheet) return DEFAULT_VEHICLE_TYPES;
  const rows = await sheet.getRows();
  const names = rows.map((r) => String(r.get("Nombre") || "").trim()).filter(Boolean);
  return names.length ? names : DEFAULT_VEHICLE_TYPES;
}

export async function getReservations(): Promise<Reservation[]> {
  const sheet = await getSheet(SHEET_TITLES.reservas);
  const rows = await sheet.getRows();
  return rows.map(rowToReservation).sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));
}

export async function getReservationById(id: string): Promise<Reservation | null> {
  const sheet = await getSheet(SHEET_TITLES.reservas);
  const rows = await sheet.getRows();
  const row = rows.find((r) => String(r.get("ID")) === id);
  return row ? rowToReservation(row) : null;
}

export async function hasCapacityConflict(params: {
  parqueadero: string;
  dia: string;
  horaEntrada: string;
  horaSalida: string;
}): Promise<boolean> {
  const sheet = await getSheet(SHEET_TITLES.reservas);
  const rows = await sheet.getRows();
  return rows.some((r) => {
    if (String(r.get("Parqueadero") || "") !== params.parqueadero) return false;
    if (String(r.get("Dia") || "") !== params.dia) return false;
    const horaEntrada = String(r.get("HoraEntrada") || "");
    const horaSalida = String(r.get("HoraSalida") || "");
    if (!horaEntrada || !horaSalida) return false;
    return timesOverlap(params.horaEntrada, params.horaSalida, horaEntrada, horaSalida);
  });
}

// Disponibilidad de cada parqueadero para un día/horario específico: se usa
// para mostrarle al solicitante, antes de que elija parqueadero, cuáles están
// libres y cuáles ya tienen una visita que se cruza con ese horario.
export async function getParkingLotAvailability(params: {
  dia: string;
  horaEntrada: string;
  horaSalida: string;
}): Promise<{ parqueadero: string; disponible: boolean }[]> {
  const [lots, sheet] = await Promise.all([getParkingLots(), getSheet(SHEET_TITLES.reservas)]);
  const rows = await sheet.getRows();

  const ocupados = new Set<string>();
  for (const row of rows) {
    const parqueadero = String(row.get("Parqueadero") || "");
    if (!parqueadero || ocupados.has(parqueadero)) continue;
    if (String(row.get("Dia") || "") !== params.dia) continue;
    const horaEntrada = String(row.get("HoraEntrada") || "");
    const horaSalida = String(row.get("HoraSalida") || "");
    if (!horaEntrada || !horaSalida) continue;
    if (timesOverlap(params.horaEntrada, params.horaSalida, horaEntrada, horaSalida)) {
      ocupados.add(parqueadero);
    }
  }

  return lots.map((parqueadero) => ({ parqueadero, disponible: !ocupados.has(parqueadero) }));
}

function generateId(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `R-${stamp}-${rand}`;
}

export async function addReservation(data: {
  email: string;
  nombreVisitante: string;
  placa: string;
  tipoVehiculo: string;
  parqueadero: string;
  dia: string;
  horaEntrada: string;
  horaSalida: string;
  duracionHoras: string;
}): Promise<Reservation> {
  const sheet = await getSheet(SHEET_TITLES.reservas);
  const id = generateId();
  const creadoEn = new Date().toISOString();
  await sheet.addRow({
    ID: id,
    CreadoEn: creadoEn,
    Email: data.email,
    NombreVisitante: data.nombreVisitante,
    Placa: data.placa,
    TipoVehiculo: data.tipoVehiculo,
    Parqueadero: data.parqueadero,
    Dia: data.dia,
    HoraEntrada: data.horaEntrada,
    HoraSalida: data.horaSalida,
    DuracionHoras: data.duracionHoras,
    Estado: "Pendiente",
    EnviadoEn: "",
  });
  return {
    id,
    creadoEn,
    estado: "Pendiente",
    enviadoEn: "",
    ...data,
  };
}

// Devuelve la reserva actualizada. Si ya estaba marcada como "Enviado",
// no vuelve a enviar nada (protección contra reenvíos accidentales/masivos).
export async function markReservationSent(id: string): Promise<{ reservation: Reservation; alreadySent: boolean } | null> {
  const sheet = await getSheet(SHEET_TITLES.reservas);
  const rows = await sheet.getRows();
  const row = rows.find((r) => String(r.get("ID")) === id);
  if (!row) return null;
  if (row.get("Estado") === "Enviado") {
    return { reservation: rowToReservation(row), alreadySent: true };
  }
  row.set("Estado", "Enviado");
  row.set("EnviadoEn", new Date().toISOString());
  await row.save();
  return { reservation: rowToReservation(row), alreadySent: false };
}