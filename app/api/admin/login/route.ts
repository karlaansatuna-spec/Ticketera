import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, ADMIN_SESSION_TTL_SECONDS, checkAdminPassword, createSessionToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const password = body.password || "";

  let valid: boolean;
  try {
    valid = checkAdminPassword(password);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "El servidor no tiene configurada la contraseña de administrador (ADMIN_PASSWORD)." },
      { status: 500 }
    );
  }

  if (!valid) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }

  let token: string;
  try {
    token = createSessionToken();
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "El servidor no tiene configurada ADMIN_SESSION_SECRET." },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
  return res;
}
