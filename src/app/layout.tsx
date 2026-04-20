import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Búsqueda de Arriendos en Valle de Aburrá (Apify)",
  description: "Busca arriendos en Valle de Aburrá usando grupos de Facebook",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-gray-100 min-h-screen">{children}</body>
    </html>
  );
}
