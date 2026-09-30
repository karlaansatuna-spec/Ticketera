import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { isAdminRequest } from "@/lib/auth";
import { getReservations } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const reservas = await getReservations();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Ticketera de Visitas";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Solicitudes");
    sheet.columns = [
      { header: "ID", key: "id", width: 20 },
      { header: "Creado en", key: "creadoEn", width: 22 },
      { header: "Email", key: "email", width: 28 },
      { header: "Nombre visitante", key: "nombreVisitante", width: 24 },
      { header: "Placa", key: "placa", width: 14 },
      { header: "Tipo de vehículo", key: "tipoVehiculo", width: 16 },
      { header: "Parqueadero", key: "parqueadero", width: 16 },
      { header: "Día", key: "dia", width: 12 },
      { header: "Hora entrada", key: "horaEntrada", width: 14 },
      { header: "Hora salida", key: "horaSalida", width: 14 },
      { header: "Duración (horas)", key: "duracionHoras", width: 16 },
      { header: "Estado", key: "estado", width: 12 },
      { header: "Enviado en", key: "enviadoEn", width: 22 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const r of reservas) {
      sheet.addRow(r);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `solicitudes-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Error generando el archivo Excel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}