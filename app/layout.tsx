import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ticketera de Visitas",
  description: "Reserva de acceso a parqueaderos para visitas",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">{children}</body>
    </html>
  );
}
