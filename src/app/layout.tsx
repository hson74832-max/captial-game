import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Capital Empire — Economic Simulation Game",
  description: "Build your business empire in this realistic economic simulation game. Produce, trade, and dominate the market.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-900 text-white antialiased overflow-hidden">{children}</body>
    </html>
  );
}
