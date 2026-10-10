import { requireSupabaseClient } from "@/lib/supabase";
import { requireVerifiedUser } from "@/lib/session";
import { getProfileAvatarUrl, type Profile } from "@/lib/friends";

export type FriendEventType = "lunch" | "phone_call" | "other";
export type FriendEventStatus = "proposed" | "accepted" | "declined" | "cancelled";
export type FriendEventResponse = "accepted" | "declined";

export type FriendEventInput = {
  invitee_id: string;
  title: string;
  description: string | null;
  event_type: FriendEventType;
  starts_at: string;
};

export type FriendEvent = {
  id: string;
  proposer_id: string;
  invitee_id: string;
  title: string;
  description: string | null;
  event_type: FriendEventType;
  starts_at: string;
  status: FriendEventStatus;
  created_at: string;
  responded_at: string | null;
  other: Profile;
};

type FriendEventRow = Omit<FriendEvent, "other">;

const EVENT_COLUMNS =
  "id, proposer_id, invitee_id, title, description, event_type, starts_at, status, created_at, responded_at";
const PROFILE_COLUMNS = "user_id, username, display_name, avatar_path";

export async function listFriendEvents(userId: string): Promise<FriendEvent[]> {
  await requireVerifiedUser(userId);
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("friend_events")
    .select(EVENT_COLUMNS)
    .or(`proposer_id.eq.${userId},invitee_id.eq.${userId}`)
    .order("starts_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as FriendEventRow[];
  if (rows.length === 0) return [];
  const profileIds = [...new Set(rows.map((row) =>
    row.proposer_id === userId ? row.invitee_id : row.proposer_id,
  ))];
  const { data: profilesData, error: profilesError } = await client
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("user_id", profileIds);
  if (profilesError) throw profilesError;

  const profiles = await Promise.all(
    ((profilesData ?? []) as Profile[]).map(async (profile) => ({
      ...profile,
      avatar_url: profile.avatar_path
        ? await getProfileAvatarUrl(profile.avatar_path)
        : null,
    })),
  );
  const profileById = new Map(profiles.map((profile) => [profile.user_id, profile]));

  return rows.map((row) => {
    const otherId = row.proposer_id === userId ? row.invitee_id : row.proposer_id;
    const other = profileById.get(otherId);
    if (!other) throw new Error("Profil přítele nelze načíst.");
    return { ...row, other };
  });
}

export async function proposeFriendEvent(
  userId: string,
  input: FriendEventInput,
): Promise<void> {
  await requireVerifiedUser(userId);
  const title = input.title.trim();
  const start = new Date(input.starts_at);
  if (!input.invitee_id || input.invitee_id === userId) {
    throw new Error("Vyberte přítele, kterému chcete návrh poslat.");
  }
  if (!title || title.length > 80) {
    throw new Error("Název musí mít 1 až 80 znaků.");
  }
  if (input.description && input.description.length > 240) {
    throw new Error("Poznámka může mít nejvýše 240 znaků.");
  }
  if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) {
    throw new Error("Vyberte datum a čas v budoucnosti.");
  }
  if (!["lunch", "phone_call", "other"].includes(input.event_type)) {
    throw new Error("Vyberte platný typ setkání.");
  }

  const { error } = await requireSupabaseClient().from("friend_events").insert({
    proposer_id: userId,
    invitee_id: input.invitee_id,
    title,
    description: input.description?.trim() || null,
    event_type: input.event_type,
    starts_at: start.toISOString(),
    status: "proposed",
  });
  if (error) throw error;
}

export async function respondToFriendEvent(
  userId: string,
  eventId: string,
  response: FriendEventResponse,
): Promise<void> {
  await requireVerifiedUser(userId);
  if (response !== "accepted" && response !== "declined") {
    throw new Error("Neplatná odpověď na návrh.");
  }
  const { error } = await requireSupabaseClient()
    .from("friend_events")
    .update({ status: response })
    .eq("id", eventId)
    .eq("invitee_id", userId)
    .eq("status", "proposed");
  if (error) throw error;
}

export async function cancelFriendEvent(userId: string, eventId: string): Promise<void> {
  await requireVerifiedUser(userId);
  const { error } = await requireSupabaseClient()
    .from("friend_events")
    .update({ status: "cancelled" })
    .eq("id", eventId)
    .in("status", ["proposed", "accepted"]);
  if (error) throw error;
}
