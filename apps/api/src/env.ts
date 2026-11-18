import "@hampath/db"; // loads the repo .env (never overriding variables already set)

export const env = {
  port: Number(process.env.API_PORT ?? 4000),
  appOrigin: (process.env.APP_ORIGIN ?? "http://localhost:3000").replace(/\/$/, ""),
  adminToken: process.env.ADMIN_TOKEN ?? "",
  production: process.env.NODE_ENV === "production",
  smtpUrl: process.env.SMTP_URL ?? "smtp://127.0.0.1:1025",
  mailFrom: process.env.MAIL_FROM ?? "HamPath <no-reply@hampath.local>",
  /** "memory" keeps sent mail in-process (tests). */
  mailTransport: process.env.MAIL_TRANSPORT ?? "smtp",
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  },
};

export const googleEnabled = () => Boolean(env.google.clientId && env.google.clientSecret);
