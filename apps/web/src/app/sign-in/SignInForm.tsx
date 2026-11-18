"use client";
import { useState } from "react";
import { Button, Feedback } from "@hampath/ui";
import { ApiError, api } from "@/lib/api";

export function SignInForm({ google, next, error }: { google: boolean; next: string; error: string | null }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [problem, setProblem] = useState<string | null>(error);

  const send = async () => {
    setState("sending");
    setProblem(null);
    try {
      await api("POST", "/auth/magic-link", { email, redirect: next });
      setState("sent");
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : "Couldn't send the link. Try again.");
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <Feedback tone="good" title="Check your e-mail">
        <p>We sent a sign-in link to {email}. It works once and expires in 15 minutes.</p>
        <p>
          Running locally? Open the dev inbox at <a href="http://localhost:8025">localhost:8025</a>.
        </p>
      </Feedback>
    );
  }
  return (
    <div className="form">
      {problem && (
        <Feedback tone="bad" title="Couldn't sign you in">
          <p>{problem}</p>
        </Feedback>
      )}
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="field-help">We’ll e-mail you a one-time sign-in link. No password.</span>
        </div>
        <div>
          <Button type="submit" disabled={state === "sending" || !email}>
            {state === "sending" ? "Sending…" : "E-mail me a link"}
          </Button>
        </div>
      </form>
      {google && (
        <>
          <p className="divider">or</p>
          <a className="btn btn-quiet" href={`/api/v1/auth/google/start?redirect=${encodeURIComponent(next)}`}>
            Continue with Google
          </a>
        </>
      )}
    </div>
  );
}
