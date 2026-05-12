import type { Metadata } from "next";
import { Roboto_Slab, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import { LocalTelemetry } from "@/components/telemetry/local-telemetry";
import "./globals.css";

const robotoSlab = Roboto_Slab({
  variable: "--font-roboto-slab",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Arvya OS",
  description: "The AI operating system for Arvya Company Brain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVariables = `${robotoSlab.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`;
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <LocalTelemetry />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
