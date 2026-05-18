import type { Metadata } from "next";
import { Inter, Geist_Mono, Caveat } from "next/font/google";
import { Toaster } from "sonner";
import { TrackingScripts } from "@/components/tracking/tracking-scripts";
import { ClickIdCapture } from "@/components/tracking/click-id-capture";
import { ChatWidgetGate } from "@/components/chat/ChatWidgetGate";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

// Used as the borrower's typed-name "wet signature" on the offer page
// and reflected in the admin authorization-proof card.
const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PennyLime, Fast Cash Advances for Gig Workers",
    template: "%s | PennyLime",
  },
  description: "Merchant cash advances for gig workers and 1099 contractors. $500 to $10,000. Apply in 5 minutes, funding in as fast as 48 hours. No credit checks.",
  metadataBase: new URL("https://pennylime.com"),
  openGraph: {
    siteName: "PennyLime",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/lime-mark-256.png", sizes: "256x256", type: "image/png" },
    ],
    apple: "/lime-mark-512.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <TrackingScripts />
      </head>
      <body
        className={`${inter.variable} ${geistMono.variable} ${caveat.variable} antialiased`}
        style={{ fontFamily: "var(--font-sans), Inter, system-ui, -apple-system, sans-serif" }}
      >
        <ClickIdCapture />
        {children}
        <ChatWidgetGate />
        <Toaster
          toastOptions={{
            style: {
              background: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
              color: '#1a1a1a',
              fontSize: '14px',
            },
          }}
        />
      </body>
    </html>
  );
}
