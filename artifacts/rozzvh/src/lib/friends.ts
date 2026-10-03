import { requireSupabaseClient } from "@/lib/supabase";
import { requireVerifiedUser } from "@/lib/session";

export type Profile = {
  user_id: string;
  username: string;
  display_name: string;
};

export type FriendshipStatus = "pending" | "accepted";
export type FriendshipDirection = "incoming" | "outgoing" | "friend";
export type FriendshipResponse = "accepted" | "declined";

export type FriendConnection = {
  id: string;
  status: FriendshipStatus;
  direction: FriendshipDirection;
  created_at: string;
  accepted_at: string | null;
  other: Profile;
};

type FriendshipRow = {
  id: string;
  user_id: string;
  friend_id: string;
  status: string;
  created_at: string;
  accepted_at: string | null;
};

const profileColumns = "user_id, username, display_name";
const usernamePattern = /^[a-z0-9_]{3,24}$/;

export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, "").toLocaleLowerCase("en-US");
}

async function loadOwnProfile(userId: string): Promise<Profile> {
  await requireVerifiedUser(userId);
  const { data, error } = await requireSupabaseClient()
    .from("profiles")
    .select(profileColumns)
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function getOwnProfile(userId: string): Promise<Profile> {
  return loadOwnProfile(userId);
}

export async function checkUsernameAvailability(
  userId: string,
  username: string,
): Promise<boolean> {
  await requireVerifiedUser(userId);
  const candidate = normalizeUsername(username);
  if (!usernamePattern.test(candidate)) return false;

  const { data, error } = await requireSupabaseClient().rpc(
    "username_available",
    { candidate },
  );
  if (error) throw error;
  return Boolean(data);
}

export async function updateOwnProfile(
  userId: string,
  input: Pick<Profile, "username" | "display_name">,
): Promise<Profile> {
  await requireVerifiedUser(userId);
  const username = normalizeUsername(input.username);
  const displayName = input.display_name.trim();

  if (!usernamePattern.test(username)) {
    throw new Error("Uživatelské jméno musí mít 3–24 znaků: malá písmena, čísla nebo podtržítko.");
  }
  if (!displayName || displayName.length > 40) {
    throw new Error("Zobrazované jméno musí mít 1–40 znaků.");
  }

  const available = await checkUsernameAvailability(userId, username);
  if (!available) throw new Error("Toto uživatelské jméno už někdo používá.");

  const { data, error } = await requireSupabaseClient()
    .from("profiles")
    .update({ username, display_name: displayName })
    .eq("user_id", userId)
    .select(profileColumns)
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function searchProfiles(
  userId: string,
  rawUsername: string,
): Promise<Profile[]> {
  await requireVerifiedUser(userId);
  const username = normalizeUsername(rawUsername);
  if (!usernamePattern.test(username)) {
    throw new Error("Zadejte přesné uživatelské jméno (3–24 znaků).");
  }

  const { data, error } = await requireSupabaseClient().rpc(
    "search_profiles",
    { search_username: username },
  );
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function listFriendships(
  userId: string,
): Promise<FriendConnection[]> {
  await requireVerifiedUser(userId);
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("friendships")
    .select("id, user_id, friend_id, status, created_at, accepted_at")
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as FriendshipRow[];
  if (!rows.length) return [];

  const otherIds = [...new Set(
    rows.map((row) => row.user_id === userId ? row.friend_id : row.user_id),
  )];
  const { data: profilesData, error: profilesError } = await client
    .from("profiles")
    .select(profileColumns)
    .in("user_id", otherIds);

  if (profilesError) throw profilesError;
  const profiles = new Map(
    ((profilesData ?? []) as Profile[]).map((profile) => [profile.user_id, profile]),
  );

  return rows.map((row) => {
    const otherId = row.user_id === userId ? row.friend_id : row.user_id;
    const other = profiles.get(otherId);
    if (!other) {
      throw new Error("Profil kontaktu se nepodařilo načíst. Zkuste seznam obnovit.");
    }
    if (row.status !== "pending" && row.status !== "accepted") {
      throw new Error("Databáze vrátila neznámý stav žádosti o přátelství.");
    }

    return {
      id: row.id,
      status: row.status,
      direction: row.status === "accepted"
        ? "friend"
        : row.friend_id === userId ? "incoming" : "outgoing",
      created_at: row.created_at,
      accepted_at: row.accepted_at,
      other,
    };
  });
}

export async function requestFriendship(
  userId: string,
  friendId: string,
): Promise<void> {
  await requireVerifiedUser(userId);
  if (!friendId || friendId === userId) {
    throw new Error("Nemůžete poslat žádost sami sobě.");
  }

  const { error } = await requireSupabaseClient()
    .from("friendships")
    .insert({ user_id: userId, friend_id: friendId });
  if (error) throw error;
}

export async function respondToFriendship(
  userId: string,
  friendshipId: string,
  response: FriendshipResponse,
): Promise<void> {
  await requireVerifiedUser(userId);
  const { error } = await requireSupabaseClient()
    .from("friendships")
    .update({ status: response })
    .eq("id", friendshipId)
    .eq("status", "pending");
  if (error) throw error;
}

export async function removeFriendship(
  userId: string,
  friendshipId: string,
): Promise<void> {
  await requireVerifiedUser(userId);
  const { error } = await requireSupabaseClient()
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  if (error) throw error;
}