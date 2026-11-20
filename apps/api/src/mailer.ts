import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env.ts";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Mail captured when MAIL_TRANSPORT=memory (tests read it). */
export const sentMail: Mail[] = [];

let transport: Transporter | null = null;

export async function sendMail(mail: Mail): Promise<void> {
  if (env.mailTransport === "memory") {
    sentMail.push(mail);
    return;
  }
  transport ??= nodemailer.createTransport(env.smtpUrl);
  await transport.sendMail({ from: env.mailFrom, ...mail });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * E-mail colours. Mail clients ignore CSS variables and <style> blocks, so these are inline hex
 * equivalents of the tokens in packages/ui/src/styles/tokens.css (--color-paper, --color-ink,
 * --color-ink-2, --color-accent, --shack-panel, --shack-ink, --shack-ink-2, --shack-lamp).
 */
const C = {
  page: "#f2eee6",
  card: "#fcfaf7",
  rule: "#e3ddd3",
  ink: "#141b24",
  ink2: "#38414a",
  muted: "#5f6873",
  accent: "#b54016",
  accentInk: "#ffffff",
  panel: "#1c2830",
  panelInk: "#f2eee6",
  panelInk2: "#c8d3da",
  lamp: "#f7b245",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * The shared e-mail frame: a panel header with the wordmark, a card for the message and a short
 * footer. Tables and inline styles only, so it renders the same in Gmail, Outlook and Apple Mail.
 * `preheader` is the line inboxes show next to the subject.
 */
function layout({ preheader, body }: { preheader: string; body: string }): string {
  const site = env.appOrigin;
  const host = site.replace(/^https?:\/\//, "");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>HamPath</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
      <tr><td style="background:${C.panel};border-radius:14px 14px 0 0;padding:22px 28px;font-family:${FONT};">
        <span style="font-size:22px;font-weight:700;color:${C.panelInk};">Ham</span><span style="font-size:22px;font-weight:700;color:${C.lamp};">Path</span>
        <div style="font-size:13px;color:${C.panelInk2};padding-top:4px;">Canada's Basic amateur radio exam, learned by doing</div>
      </td></tr>
      <tr><td style="background:${C.card};border:1px solid ${C.rule};border-top:0;border-radius:0 0 14px 14px;padding:32px 28px;font-family:${FONT};color:${C.ink};">
        ${body}
      </td></tr>
      <tr><td style="padding:20px 28px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted};text-align:center;">
        Sent by HamPath, a free course for Canada's amateur radio Basic Qualification.<br>
        <a href="${esc(site)}" style="color:${C.muted};">${esc(host)}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** A button that survives Outlook: the link sits in a coloured table cell. */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr><td style="background:${C.accent};border-radius:10px;">
    <a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:${C.accentInk};text-decoration:none;border-radius:10px;">${esc(label)}</a>
  </td></tr>
</table>`;
}

export function magicLinkMail(to: string, link: string, minutes = 15): Mail {
  const p = `margin:0 0 14px;font-size:16px;line-height:1.6;color:${C.ink2};`;
  return {
    to,
    subject: "Your HamPath sign-in link",
    text: [
      "Sign in to HamPath",
      "",
      "Open this link to sign in to your HamPath account:",
      "",
      link,
      "",
      `The link works once and expires in ${minutes} minutes.`,
      "Didn't ask for it? Ignore this e-mail: nobody can sign in without the link.",
      "",
      `HamPath, ${env.appOrigin}`,
    ].join("\n"),
    html: layout({
      preheader: `Your sign-in link. It works once and expires in ${minutes} minutes.`,
      body: `<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:${C.ink};">Sign in to HamPath</h1>
        <p style="${p}">Tap the button to sign in to your HamPath account.</p>
        ${button(link, "Sign in to HamPath")}
        <p style="${p}">The link works once and expires in <strong>${minutes} minutes</strong>.</p>
        <p style="margin:24px 0 0;padding-top:18px;border-top:1px solid ${C.rule};font-size:13px;line-height:1.6;color:${C.muted};">
          Button not working? Copy this link into your browser:<br>
          <a href="${esc(link)}" style="color:${C.accent};word-break:break-all;">${esc(link)}</a>
        </p>
        <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:${C.muted};">Didn't ask for this? Ignore it: nobody can sign in without the link.</p>`,
    }),
  };
}
