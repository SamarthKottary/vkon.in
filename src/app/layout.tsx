import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { ThemeScript } from "@/components/theme/ThemeScript";
import { site } from "@/content/site";
import "./globals.css";

/**
 * One sans plus one mono.
 *
 * The previous build paired a geometric display face with Inter, which read
 * friendly and generic. A single neutral grotesque doing all the sizes, with
 * mono reserved for technical labels and spec values, is what makes an
 * industrial catalogue look like one.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono-plex",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — Motor Starters & Control Panels for Agriculture`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  keywords: [
    "motor starter",
    "submersible pump starter",
    "agricultural control panel",
    "dry run protection",
    "phase reversal protection",
    "star delta starter",
    "solar pump controller",
  ],
  authors: [{ name: site.legalName }],
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: site.name,
    url: site.url,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#14171a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: ThemeScript sets data-theme on <html> before
    // React hydrates, so the server and client markup differ by that attribute
    // by design.
    <html
      lang="en-IN"
      suppressHydrationWarning
      className={`${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col bg-surface">{children}</body>
    </html>
  );
}
