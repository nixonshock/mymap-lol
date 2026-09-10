import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase access.
 *
 * The service-role key MUST stay server side (Vercel env var, never
 * NEXT_PUBLIC_*). The browser only ever talks to our own /api routes, and RLS
 * on the tables denies anon/authenticated reads and writes outright.
 *
 * When the env vars are absent the app stays in DEMO mode: the API reports
 * mode:"demo" and the client falls back to browser-local state, so local dev
 * and previews keep working before/without a Supabase project.
 */
export function serviceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-application-name": "mymap-lol" } },
    });
  } catch {
    return null;
  }
}

export const dataMode = (): "live" | "demo" => (serviceClient() ? "live" : "demo");
