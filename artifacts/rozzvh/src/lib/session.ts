import type { User } from "@supabase/supabase-js";

import { requireSupabaseClient } from "@/lib/supabase";

export async function requireVerifiedUser(userId: string): Promise<User> {
  const client = requireSupabaseClient();
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session?.access_token || session.user.id !== userId) {
    throw new Error("Pro pokračování se znovu přihlaste.");
  }

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser(session.access_token);

  if (userError) throw userError;
  if (!user || user.id !== userId) {
    throw new Error("Přihlášení se nepodařilo ověřit. Přihlaste se znovu.");
  }

  return user;
}