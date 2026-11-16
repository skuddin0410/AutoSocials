import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoSocials · CanadianSME",
  description: "Schedule and publish CanadianSME posts to every social channel at once.",
  icons: { icon: "https://canadiansme.ca/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Sora:wght@500;600;700;800&display=swap"
        />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
