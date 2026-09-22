import { NextRequest, NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/sheets";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const email = (body.email || "").trim();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Ingresa un correo electrónico válido." }, { status: 400 });
  }

  try {
    const allowed = await isEmailAllowed(email);
    if (!allowed) {
      return NextResponse.json(
        { allowed: false, error: "Este correo no está autorizado para ingresar a la ticketera." },
        { status: 403 }
      );
    }
    return NextResponse.json({ allowed: true });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Error verificando el correo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
