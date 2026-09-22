import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

export const ADMIN_COOKIE_NAME = "ticketera_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 horas

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("Falta configurar la variable de entorno ADMIN_SESSION_SECRET.");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createSessionToken(): string {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `admin.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [role, expiresStr, sig] = parts;
  if (role !== "admin") return false;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  const expected = sign(`${role}.${expiresStr}`);
  return safeEqual(sig, expected);
}

export function checkAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new Error("Falta configurar la variable de entorno ADMIN_PASSWORD.");
  }
  if (!password) return false;
  return safeEqual(password, expected);
}

export function isAdminRequest(req: NextRequest): boolean {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export const ADMIN_SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;
