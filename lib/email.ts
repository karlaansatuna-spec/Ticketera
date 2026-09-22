import { promises as dns } from "node:dns";
import net from "node:net";
import nodemailer, { type Transporter } from "nodemailer";
import type { Reservation } from "./types";

// Algunas redes (frecuente en conexiones residenciales/móviles en Ecuador)
// anuncian soporte de IPv6 en la interfaz de red pero en realidad no tienen
// salida a internet por IPv6, o la tienen rota. Nodemailer, al resolver un
// nombre de dominio como "smtp.gmail.com", a veces elige al azar una de las
// direcciones IPv6 devueltas por el DNS y la conexión falla con
// "ENETUNREACH". Para evitarlo, resolvemos nosotros mismos una dirección
// IPv4 (registro "A") y nos conectamos directamente a esa IP, indicando el
// nombre original en "tls.servername" para que el certificado SSL/TLS del
// servidor se siga validando correctamente.
async function resolveConnectHost(host: string): Promise<{ host: string; servername?: string }> {
  if (net.isIP(host)) {
    // Ya es una IP (v4 o v6): no hay nada que resolver.
    return { host };
  }
  try {
    const addresses = await dns.resolve4(host);
    if (addresses.length) {
      const ip = addresses[Math.floor(Math.random() * addresses.length)];
      return { host: ip, servername: host };
    }
  } catch {
    // Sin registros IPv4 (o el DNS falló): seguimos con el nombre original
    // y dejamos que Nodemailer/el sistema operativo lo resuelvan como puedan.
  }
  return { host };
}

async function getTransporter(): Promise<Transporter> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "Falta configurar el envío de correo: revisa SMTP_HOST, SMTP_USER y SMTP_PASS en las variables de entorno."
    );
  }

  // secure=true para el puerto 465 (TLS implícito). Para 587 (STARTTLS, el
  // caso normal de Gmail/Outlook) debe ir en false: la conexión arranca sin
  // cifrar y luego se actualiza a TLS automáticamente.
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;

  const { host: connectHost, servername } = await resolveConnectHost(host);

  return nodemailer.createTransport({
    host: connectHost,
    port,
    secure,
    auth: { user, pass },
    ...(servername ? { tls: { servername } } : {}),
  });
}

function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function renderHtml(r: Reservation): string {
  const rows: [string, string][] = [
    ["Parqueadero", r.parqueadero],
    ["Día de visita", r.dia],
    ["Hora de entrada", r.horaEntrada],
    ["Hora de salida", r.horaSalida],
    ["Duración estimada", `${r.duracionHoras} horas`],
    ["Código de proveedor", r.codigoProveedor],
    ["Solicitado por", r.email],
    ["ID de solicitud", r.id],
  ];
  const body = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px;color:#555;">${escapeHtml(label)}</td><td style="padding:6px 12px;font-weight:600;">${escapeHtml(
          value
        )}</td></tr>`
    )
    .join("");
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; font-size:14px; color:#111;">
    <h2 style="margin-bottom:4px;">Solicitud de acceso a parqueadero</h2>
    <p style="color:#555;margin-top:0;">Se generó una nueva solicitud de visita en la ticketera.</p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px;">
      ${body}
    </table>
  </div>`;
}

export async function sendReservationRequestEmail(reservation: Reservation) {
  const to = process.env.SOLICITUD_EMAIL_TO;
  const adminEmail = process.env.ADMIN_EMAIL;
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

  if (!to) {
    throw new Error("Falta configurar la variable de entorno SOLICITUD_EMAIL_TO.");
  }
  if (!from) {
    throw new Error("Falta configurar EMAIL_FROM (o SMTP_USER) para saber desde qué correo enviar.");
  }

  const cc = [reservation.email, adminEmail].filter((v): v is string => Boolean(v));

  const transporter = await getTransporter();
  try {
    await transporter.sendMail({
      from,
      to,
      cc,
      replyTo: reservation.email,
      subject: `Solicitud de visita - ${reservation.parqueadero} - ${reservation.dia}`,
      html: renderHtml(reservation),
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "ENETUNREACH" || code === "ETIMEDOUT" || code === "ESOCKET") {
      throw new Error(
        "No se pudo conectar con el servidor de correo (problema de red). Revisa tu conexión a internet e intenta de nuevo en unos segundos."
      );
    }
    if (code === "EAUTH") {
      throw new Error(
        "El servidor de correo rechazó las credenciales (SMTP_USER/SMTP_PASS). Verifica que la contraseña de aplicación sea correcta."
      );
    }
    throw err;
  }
}