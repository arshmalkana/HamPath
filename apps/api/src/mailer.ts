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

export function magicLinkMail(to: string, link: string): Mail {
  return {
    to,
    subject: "Your HamPath sign-in link",
    text: `Sign in to HamPath:\n\n${link}\n\nThis link works once and expires in 15 minutes. If you didn't ask for it, ignore this e-mail.`,
    html: `<p>Sign in to HamPath:</p><p><a href="${esc(link)}">Sign in</a></p>
<p>This link works once and expires in 15 minutes. If you didn't ask for it, ignore this e-mail.</p>`,
  };
}
