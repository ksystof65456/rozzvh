import { requireVerifiedUser } from "@/lib/session";
import { requireSupabaseClient } from "@/lib/supabase";
import { getOwnProfile, updateOwnProfile } from "@/lib/friends";

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FILE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function validateAvatar(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Vyberte obrázek ve formátu JPG, PNG nebo WebP.");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Profilová fotka může mít nejvýše 5 MB.");
  }
}

export async function uploadProfilePhoto(userId: string, file: File) {
  await requireVerifiedUser(userId);
  validateAvatar(file);
  const client = requireSupabaseClient();
  const path = `${userId}/${crypto.randomUUID()}.${FILE_EXTENSIONS[file.type]}`;
  const { error: uploadError } = await client.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
  if (uploadError) throw uploadError;

  let current: Awaited<ReturnType<typeof getOwnProfile>>;
  try {
    current = await getOwnProfile(userId);
    const updated = await updateOwnProfile(userId, {
      username: current.username,
      display_name: current.display_name,
      avatar_path: path,
    });
    if (current.avatar_path) {
      try {
        const { error: removeError } = await client.storage
          .from(AVATAR_BUCKET)
          .remove([current.avatar_path]);
        if (removeError) console.warn("Previous profile photo could not be removed.", removeError);
      } catch (removeError) {
        console.warn("Previous profile photo could not be removed.", removeError);
      }
    }
    return updated;
  } catch (error) {
    await client.storage.from(AVATAR_BUCKET).remove([path]);
    throw error;
  }
}

export async function removeProfilePhoto(userId: string, oldPath: string | null) {
  await requireVerifiedUser(userId);
  const client = requireSupabaseClient();
  const current = await getOwnProfile(userId);
  const updated = await updateOwnProfile(userId, {
    username: current.username,
    display_name: current.display_name,
    avatar_path: null,
  });
  if (oldPath) {
    const { error: deleteError } = await client.storage.from(AVATAR_BUCKET).remove([oldPath]);
    if (deleteError) console.warn("Removed profile photo could not be deleted from storage.", deleteError);
  }
  return updated;
}
