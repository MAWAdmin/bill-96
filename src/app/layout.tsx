import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bill 96 Checker",
  description: "Find French-language gaps on Quebec storefronts and get French translations ready for review.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
