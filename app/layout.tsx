import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alles OK AI Cover Maker",
  description: "Design deterministic podcast covers and social artwork for Alles OK AI.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="antialiased">{children}</body>
    </html>
  );
}
