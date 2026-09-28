import { createAdminClient } from "@supabase/server/core";

let adminClient: ReturnType<typeof createAdminClient> | undefined;

export function getSupabaseAdminClient(): ReturnType<typeof createAdminClient> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    throw new Error("Supabase Auth is not configured on the API server.");
  }

  adminClient ??= createAdminClient();
  return adminClient;
}

export function createEphemeralSupabaseClient(): ReturnType<typeof createAdminClient> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    throw new Error("Supabase Auth is not configured on the API server.");
  }
  return createAdminClient();
}