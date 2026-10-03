import type { User } from "@supabase/supabase-js";

import { requireSupabaseClient } from "@/lib/supabase";

export type ScheduleItem = {
  id: string;
  user_id: string;
  title: string;
  day: number;
  start_time: string;
  end_time: string;
  room: string | null;
  type: string;
  created_at: string;
};

export type ScheduleItemInput = {
  title: string;
  day: number;
  start_time: string;
  end_time: string;
  room: string | null;
  type: string;
};

async function requireVerifiedSession(userId: string): Promise<User> {
  const client = requireSupabaseClient();
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session?.access_token || session.user.id !== userId) {
    throw new Error("Pro načtení rozvrhu se znovu přihlaste.");
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

function validateInput(input: ScheduleItemInput): void {
  if (!input.title.trim()) {
    throw new Error("Název předmětu nesmí být prázdný.");
  }
  if (!Number.isInteger(input.day) || input.day < 1 || input.day > 7) {
    throw new Error("Vyberte platný den v týdnu.");
  }
  const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!validTime.test(input.start_time) || !validTime.test(input.end_time)) {
    throw new Error("Zadejte platný čas.");
  }
  if (input.end_time <= input.start_time) {
    throw new Error("Konec výuky musí být později než její začátek.");
  }
  if (!input.type.trim()) {
    throw new Error("Vyberte typ výuky.");
  }
}

export async function listScheduleItems(userId: string): Promise<ScheduleItem[]> {
  await requireVerifiedSession(userId);
  const { data, error } = await requireSupabaseClient()
    .from("schedule_items")
    .select(
      "id, user_id, title, day, start_time, end_time, room, type, created_at",
    )
    .eq("user_id", userId)
    .order("day", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ScheduleItem[];
}

export async function createScheduleItem(
  userId: string,
  input: ScheduleItemInput,
): Promise<ScheduleItem> {
  await requireVerifiedSession(userId);
  validateInput(input);

  const { data, error } = await requireSupabaseClient()
    .from("schedule_items")
    .insert({
      ...input,
      title: input.title.trim(),
      type: input.type.trim(),
      room: input.room?.trim() || null,
      user_id: userId,
    })
    .select(
      "id, user_id, title, day, start_time, end_time, room, type, created_at",
    )
    .single();

  if (error) throw error;
  return data as ScheduleItem;
}

export async function updateScheduleItem(
  userId: string,
  itemId: string,
  input: ScheduleItemInput,
): Promise<ScheduleItem> {
  await requireVerifiedSession(userId);
  validateInput(input);

  const { data, error } = await requireSupabaseClient()
    .from("schedule_items")
    .update({
      ...input,
      title: input.title.trim(),
      type: input.type.trim(),
      room: input.room?.trim() || null,
    })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select(
      "id, user_id, title, day, start_time, end_time, room, type, created_at",
    )
    .single();

  if (error) throw error;
  return data as ScheduleItem;
}

export async function deleteScheduleItem(
  userId: string,
  itemId: string,
): Promise<void> {
  await requireVerifiedSession(userId);
  const { error } = await requireSupabaseClient()
    .from("schedule_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", userId);

  if (error) throw error;
}