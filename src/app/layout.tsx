import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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
/*
 * The font files are committed, not fetched.
 *
 * `next/font/google` downloads from fonts.googleapis.com during `next build`.
 * That turns every build — including the Docker build inside `cicd/deploy.sh`
 * — into something that fails on a slow or interrupted connection, and it
 * fails *after* the deploy has already pulled the new commit. It happened
 * locally on 2026-08-12: two font fetches timed out and the build aborted.
 *
 * These are the same latin-subset woff2 files Google would have served, so
 * runtime behaviour and bytes on the wire are unchanged. Only the build-time
 * network dependency is gone. To update a face, download the new woff2 and
 * replace the file.
 */
const inter = localFont({
  variable: "--font-inter",
  display: "swap",
  src: [{ path: "./fonts/Inter-latin.woff2", style: "normal", weight: "100 900" }],
});

const plexMono = localFont({
  variable: "--font-mono-plex",
  display: "swap",
  src: [
    { path: "./fonts/IBMPlexMono-400-latin.woff2", style: "normal", weight: "400" },
    { path: "./fonts/IBMPlexMono-500-latin.woff2", style: "normal", weight: "500" },
  ],
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
