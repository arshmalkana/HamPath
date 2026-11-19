import type { Metadata } from "next";
import { ConfirmSignIn } from "./ConfirmSignIn";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

/**
 * Where a sign-in e-mail lands. Opening the link signs nobody in: mail scanners fetch links
 * automatically, and a GET that signed in would let anyone plant their account in a victim's
 * browser. The button POSTs the token instead.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <main className="container page" id="main">
      <div className="page-head">
        <h1 className="page-title">Sign in to HamPath</h1>
        <p className="page-lead">Press the button to finish signing in on this device.</p>
      </div>
      <ConfirmSignIn queryToken={token} />
    </main>
  );
}
