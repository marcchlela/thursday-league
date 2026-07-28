import { supabase } from "@/lib/supabase";
import { Profile } from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";
import { cn } from "@/lib/utils";

const AVATAR_BUCKET = "profile-avatars";

export function AccountAvatar({
  profile,
  name,
  className
}: {
  profile?: Pick<Profile, "username" | "avatar_path"> | null;
  name?: string;
  className?: string;
}) {
  const label = profile?.username || name || "League member";
  if (!profile?.avatar_path) return <PlayerAvatar name={label} className={className} />;
  const avatarUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(profile.avatar_path).data.publicUrl;
  return (
    // The configured Supabase project owns this public profile-avatar URL.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl} alt="" className={cn("shrink-0 rounded-full border border-league-gold/30 object-cover", className)} />
  );
}
