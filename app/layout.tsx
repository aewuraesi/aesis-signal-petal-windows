import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://aesis-signal-petal.ewuresiattabra.chatgpt.site"),
  title: "Aesi's Signal Petal — SRE Work Tracker",
  description: "A private local workspace for SRE issue tracking and follow-ups.",
  openGraph: {
    title: "Signal Petal",
    description: "Keep work moving with a focused view of issues, personal actions, and overdue follow-ups.",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Signal Petal — Keep work moving." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Signal Petal",
    description: "Keep work moving with a focused view of issues, personal actions, and overdue follow-ups.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Signal Petal", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#d95191",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
