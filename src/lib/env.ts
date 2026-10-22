// Central place for configuration. Everything optional has a working local default
// so `npm run dev` works with zero accounts. See .env.example for descriptions.

function list(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const isProd = process.env.NODE_ENV === "production";

export const env = {
  isProd,
  // SITE_URL (runtime) wins over NEXT_PUBLIC_SITE_URL (inlined at build time).
  siteUrl: (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  databaseUrl: process.env.DATABASE_URL || "",
  pgliteDir: process.env.PGLITE_DIR || ".data/pglite",
  storageDir: process.env.LOCAL_STORAGE_DIR || ".data/storage",
  appSecret: process.env.APP_SECRET || (isProd && process.env.VERCEL ? "" : "dormdash-local-dev-secret-change-me"),
  allowedEmailDomains: list(process.env.ALLOWED_EMAIL_DOMAINS || "nyu.edu"),
  adminEmails: list(process.env.ADMIN_EMAILS),
  paymentsProvider: (process.env.PAYMENTS_PROVIDER || "demo") as "demo" | "paypal",
  paypal: {
    env: (process.env.PAYPAL_ENV || "sandbox") as "sandbox" | "live",
    clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "",
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
    webhookId: process.env.PAYPAL_WEBHOOK_ID || "",
  },
  resendApiKey: process.env.RESEND_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "Dormdash <hello@dormdash.app>",
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || "",
  vapidSubject: process.env.VAPID_SUBJECT || "mailto:hello@dormdash.app",
  cronSecret: process.env.CRON_SECRET || (isProd && process.env.VERCEL ? "" : "local-cron-secret"),
  devTools: process.env.DEV_TOOLS === "1",
};

export const authMode: "supabase" | "local" =
  env.supabaseUrl && env.supabaseAnonKey ? "supabase" : "local";

export const dbMode: "postgres" | "pglite" = env.databaseUrl ? "postgres" : "pglite";

/** PayPal is only live when the provider is chosen AND credentials are present. */
export const paymentsMode: "paypal" | "demo" =
  env.paymentsProvider === "paypal" && env.paypal.clientId && env.paypal.clientSecret ? "paypal" : "demo";

export function assertConfig() {
  const problems: string[] = [];
  if (process.env.VERCEL) {
    if (dbMode !== "postgres") problems.push("DATABASE_URL is required on Vercel (the local PGlite database is not persistent there).");
    if (authMode !== "supabase") problems.push("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required on Vercel.");
    if (!env.supabaseServiceKey) problems.push("SUPABASE_SERVICE_ROLE_KEY is required on Vercel.");
    if (!env.appSecret) problems.push("APP_SECRET is required on Vercel.");
    if (!env.cronSecret) problems.push("CRON_SECRET is required on Vercel.");
  }
  if (authMode === "supabase" && dbMode === "pglite") {
    problems.push("Supabase auth is configured but DATABASE_URL is missing. Set DATABASE_URL to your Supabase Postgres connection string.");
  }
  if (problems.length) throw new Error("Dormdash config error:\n- " + problems.join("\n- "));
}
