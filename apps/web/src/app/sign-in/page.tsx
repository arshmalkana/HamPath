import type { Metadata } from "next";
import { serverApi } from "@/lib/server";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: true } };

const ERRORS: Record<string, string> = {
  expired: "That sign-in link has expired or was already used. Ask for a new one.",
  google: "Google sign-in didn’t complete. Try again, or use an e-mail link.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const providers = await serverApi<{ google: boolean }>("/auth/providers");
  return (
    <main className="container page" id="main">
      <div className="page-head">
        <h1 className="page-title">Sign in</h1>
        <p className="page-lead">
          Keep your progress across devices. Anything you’ve done as a guest on this browser comes with you.
        </p>
      </div>
      <SignInForm
        google={providers.ok && providers.data.google}
        next={next ?? "/"}
        error={error ? (ERRORS[error] ?? "Sign-in failed.") : null}
      />
    </main>
  );
}
