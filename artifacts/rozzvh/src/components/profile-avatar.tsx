import { useEffect, useState } from "react";
import type { Profile } from "@/lib/friends";

type ProfileAvatarProps = {
  profile: Pick<Profile, "display_name" | "avatar_url">;
  className: string;
};

export function ProfileAvatar({ profile, className }: ProfileAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [profile.avatar_url]);
  const initials = profile.display_name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("cs");

  return (
    <span className={className} aria-hidden="true">
      {profile.avatar_url && !imageFailed ? (
        <img
          src={profile.avatar_url}
          alt=""
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials || "•"
      )}
    </span>
  );
}
