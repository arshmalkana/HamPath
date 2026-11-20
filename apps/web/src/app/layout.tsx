import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Azeret_Mono } from "next/font/google";
import { headers } from "next/headers";
import Link from "next/link";
import { ThemeToggle } from "@hampath/ui";
import { OfflineSupport } from "@/components/OfflineSupport";
import { ThemeScript } from "@/components/ThemeScript";
import { serverApi } from "@/lib/server";
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import type { User } from "@/lib/types";
import "./globals.css";

const body = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson", display: "swap" });
const mono = Azeret_Mono({ subsets: ["latin"], variable: "--font-azeret", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s · HamPath" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  category: "education",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_CA",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true, googleBot: { "max-image-preview": "large", "max-snippet": -1 } },
  // Set GOOGLE_SITE_VERIFICATION to verify in Search Console with a meta tag (a DNS record works too).
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#101419" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await serverApi<{ user: User }>("/me");
  // Set by src/proxy.ts with the Content-Security-Policy; inline scripts must carry it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const user = me.ok ? me.data.user : null;
  return (
    <html lang="en" className={`${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript nonce={nonce} />
        <style>{`:root{--font-display:var(--font-atkinson),ui-sans-serif,sans-serif;--font-body:var(--font-atkinson),ui-sans-serif,sans-serif;--font-outlier:var(--font-azeret),ui-monospace,monospace}`}</style>
      </head>
      {/* Browser extensions often tag <body> before React hydrates; don't treat that as a mismatch. */}
      <body suppressHydrationWarning>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="topbar">
          <div className="container topbar-inner">
            <Link href="/" className="wordmark">
              Ham<span className="wordmark-mark">Path</span>
            </Link>
            <nav className="topbar-nav" aria-label="Main">
              <Link className="toplink" href="/">
                Dashboard
              </Link>
              <Link className="toplink" href="/review">
                Review
              </Link>
              <Link className="toplink" href="/mocks">
                Mocks
              </Link>
              <Link className="toplink" href="/classes">
                Classes
              </Link>
              {user?.role === "admin" && (
                <Link className="toplink" href="/admin">
                  Admin
                </Link>
              )}
              {user && !user.isGuest ? (
                <Link className="toplink" href="/profile">
                  {user.callSign ?? user.displayName ?? "Profile"}
                </Link>
              ) : (
                <Link className="toplink" href="/sign-in">
                  Sign in
                </Link>
              )}
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <OfflineSupport />
        {children}
      </body>
    </html>
  );
}
