import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CREDO HR-Portal",
  description:
    "Digitaler Personalfragebogen und HR-Dashboard der CREDO Gruppe – Freie Evangelische Schulen Minden",
  icons: {
    icon: "/credo_logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${montserrat.variable} font-sans`}>{children}</body>
    </html>
  );
}
