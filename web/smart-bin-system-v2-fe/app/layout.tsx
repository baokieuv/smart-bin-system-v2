// Root layout: wires global styles, metadata, and top-level providers.

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Smart Bin Platform",
  description: "Monitor, manage, and optimize your smart bin network.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} antialiased text-slate-900`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
