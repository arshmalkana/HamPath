"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Feedback } from "@hampath/ui";
import { ApiError, api } from "@/lib/api";
import type { User } from "@/lib/types";

export function ProfileForm({ user }: { user: User }) {
  const router = useRouter();
  const [name, setName] = useState(user.displayName ?? "");
  const [call, setCall] = useState(user.callSign ?? "");
  const [locale, setLocale] = useState(user.locale);
  const [status, setStatus] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const save = async () => {
    setStatus(null);
    setCallError(null);
    try {
      await api("PATCH", "/me", { display_name: name.trim() || null, call_sign: call.trim(), locale });
      setStatus({ tone: "good", text: "Saved." });
      router.refresh();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Couldn't save.";
      if (/call sign/i.test(msg)) setCallError(msg);
      else setStatus({ tone: "bad", text: msg });
    }
  };
  const signOut = async () => {
    await api("POST", "/auth/logout").catch(() => undefined);
    router.push("/");
    router.refresh();
  };

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="field">
        <label className="field-label" htmlFor="name">Display name</label>
        <input id="name" className="input" autoComplete="nickname" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="call">Call sign (optional)</label>
        <input id="call" className="input" autoCapitalize="characters" spellCheck={false} value={call} aria-invalid={Boolean(callError)}
          aria-describedby="call-help" onChange={(e) => setCall(e.target.value.toUpperCase())} />
        <span id="call-help" className={callError ? "field-error" : "field-help"}>{callError ?? "Once you're licensed, e.g. VA3RAC."}</span>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="locale">Language</label>
        <select id="locale" className="select" value={locale} onChange={(e) => setLocale(e.target.value as "en" | "fr")}>
          <option value="en">English</option>
          <option value="fr">Français (questions now; lessons later)</option>
        </select>
      </div>
      <div className="actions" style={{ marginTop: 0 }}>
        <Button type="submit">Save</Button>
        <Button variant="quiet" onClick={() => void signOut()}>Sign out</Button>
      </div>
      <div aria-live="polite">{status && <Feedback tone={status.tone} title={status.text} />}</div>
    </form>
  );
}
