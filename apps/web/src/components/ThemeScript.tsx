"use client";
import { themeInitScript } from "@hampath/ui";

/**
 * Applies the saved theme before first paint. The server HTML carries it as a normal script.
 * If React ever rebuilds the page in the browser (a browser extension that changes the DOM before
 * hydration makes it do that), it renders a non-running text/plain copy instead: the theme is
 * already applied, React never runs scripts it creates, and a JavaScript <script> made on the
 * client trips a React error that some extensions turn into a crashed page.
 */
export function ThemeScript({ nonce }: { nonce?: string }) {
  const onServer = typeof window === "undefined";
  return (
    <script
      nonce={nonce}
      type={onServer ? undefined : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: themeInitScript }}
    />
  );
}
