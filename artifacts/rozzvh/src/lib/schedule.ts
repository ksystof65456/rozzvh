import { requireSupabaseClient } from "@/lib/supabase";
import { requireVerifiedUser } from "@/lib/session";

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

async function listItemsForOwner(ownerId: string): Promise<ScheduleItem[]> {
  const { data, error } = await requireSupabaseClient()
    .from("schedule_items")
    .select(
      "id, user_id, title, day, start_time, end_time, room, type, created_at",
    )
    .eq("user_id", ownerId)
    .order("day", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ScheduleItem[];
}

export async function listScheduleItems(userId: string): Promise<ScheduleItem[]> {
  await requireVerifiedUser(userId);
  return listItemsForOwner(userId);
}

export async function listFriendScheduleItems(
  viewerId: string,
  friendId: string,
): Promise<ScheduleItem[]> {
  await requireVerifiedUser(viewerId);
  if (!friendId || friendId === viewerId) {
    throw new Error("Vyberte platného přítele.");
  }
  // RLS returns rows only while an accepted friendship exists.
  return listItemsForOwner(friendId);
}

export async function createScheduleItem(
  userId: string,
  input: ScheduleItemInput,
): Promise<ScheduleItem> {
  await requireVerifiedUser(userId);
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
  await requireVerifiedUser(userId);
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
  await requireVerifiedUser(userId);
  const { error } = await requireSupabaseClient()
    .from("schedule_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", userId);

  if (error) throw error;
}