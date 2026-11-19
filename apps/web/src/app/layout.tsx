import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Azeret_Mono } from "next/font/google";
import { headers } from "next/headers";
import Link from "next/link";
import { ThemeToggle, themeInitScript } from "@hampath/ui";
import { OfflineSupport } from "@/components/OfflineSupport";
import { serverApi } from "@/lib/server";
import type { User } from "@/lib/types";
import "./globals.css";

const body = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson", display: "swap" });
const mono = Azeret_Mono({ subsets: ["latin"], variable: "--font-azeret", display: "swap" });

export const metadata: Metadata = {
  title: { default: "HamPath", template: "%s · HamPath" },
  description: "Learn every question of Canada's Basic amateur radio exam by doing: labs, short lessons and checks.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await serverApi<{ user: User }>("/me");
  // Set by src/proxy.ts with the Content-Security-Policy; inline scripts must carry it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const user = me.ok ? me.data.user : null;
  return (
    <html lang="en" className={`${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <style>{`:root{--font-display:var(--font-atkinson),ui-sans-serif,sans-serif;--font-body:var(--font-atkinson),ui-sans-serif,sans-serif;--font-outlier:var(--font-azeret),ui-monospace,monospace}`}</style>
      </head>
      <body>
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
