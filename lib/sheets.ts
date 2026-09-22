import { GoogleSpreadsheet, GoogleSpreadsheetRow, GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import type { Reservation } from "./types";
import { timesOverlap } from "./time";

const SHEET_TITLES = {
  reservas: "Reservas",
  emails: "EmailsPermitidos",
  codigos: "CodigosProveedor",
  parqueaderos: "Parqueaderos",
} as const;

const DEFAULT_PARKING_LOTS = [
  "Parqueadero 1",
  "Parqueadero 2",
  "Parqueadero 3",
  "Parqueadero 4",
  "Parqueadero 5",
  "Parqueadero 6",
];

function getPrivateKey(): string {
  const raw = process.env.GOOGLE_PRIVATE_KEY || "";
  // En Vercel las variables de entorno no admiten saltos de línea reales,
  // así que la clave se guarda con "\n" literales y aquí se convierten.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
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
  await doc.loadInfo();
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
    parqueadero: String(row.get("Parqueadero") || ""),
    dia: String(row.get("Dia") || ""),
    horaEntrada: String(row.get("HoraEntrada") || ""),
    horaSalida: String(row.get("HoraSalida") || ""),
    duracionHoras: String(row.get("DuracionHoras") || ""),
    codigoProveedor: String(row.get("CodigoProveedor") || ""),
    estado: row.get("Estado") === "Enviado" ? "Enviado" : "Pendiente",
    enviadoEn: String(row.get("EnviadoEn") || ""),
  };
}

export async function getAllowedEmails(): Promise<string[]> {
  const sheet = await getSheet(SHEET_TITLES.emails);
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

export async function getProviderCodes(): Promise<{ codigo: string; proveedor: string }[]> {
  const sheet = await getSheet(SHEET_TITLES.codigos);
  const rows = await sheet.getRows();
  return rows
    .map((r) => ({
      codigo: String(r.get("Codigo") || "").trim(),
      proveedor: String(r.get("Proveedor") || "").trim(),
    }))
    .filter((r) => r.codigo);
}

export async function isProviderCodeValid(code: string): Promise<boolean> {
  const list = await getProviderCodes();
  const norm = code.trim().toLowerCase();
  return list.some((r) => r.codigo.toLowerCase() === norm);
}

export async function getParkingLots(): Promise<string[]> {
  const sheet = await getSheet(SHEET_TITLES.parqueaderos);
  const rows = await sheet.getRows();
  const names = rows.map((r) => String(r.get("Nombre") || "").trim()).filter(Boolean);
  return names.length ? names : DEFAULT_PARKING_LOTS;
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

function generateId(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `R-${stamp}-${rand}`;
}

export async function addReservation(data: {
  email: string;
  parqueadero: string;
  dia: string;
  horaEntrada: string;
  horaSalida: string;
  duracionHoras: string;
  codigoProveedor: string;
}): Promise<Reservation> {
  const sheet = await getSheet(SHEET_TITLES.reservas);
  const id = generateId();
  const creadoEn = new Date().toISOString();
  await sheet.addRow({
    ID: id,
    CreadoEn: creadoEn,
    Email: data.email,
    Parqueadero: data.parqueadero,
    Dia: data.dia,
    HoraEntrada: data.horaEntrada,
    HoraSalida: data.horaSalida,
    DuracionHoras: data.duracionHoras,
    CodigoProveedor: data.codigoProveedor,
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
