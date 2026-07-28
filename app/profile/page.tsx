"use client";

import Link from "next/link";
import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Camera, LoaderCircle, Settings, ShieldCheck, Shirt, UserRound } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useLeagueData } from "@/hooks/useLeagueData";
import { formatCoins } from "@/lib/betting";
import { friendlyActionError } from "@/lib/actionErrors";
import { allTimeLeaderboard } from "@/lib/scoring";
import { supabase } from "@/lib/supabase";
import { BettingStanding } from "@/lib/types";
import { cn, currentSeason } from "@/lib/utils";
import { LeagueCoin } from "@/components/LeagueCoin";
import { ErrorState, Toast, ToastTone } from "@/components/ui";

const AVATAR_BUCKET = "profile-avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const avatarExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

async function prepareAvatar(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const size = 512;
    const sourceSize = Math.min(bitmap.width, bitmap.height);
    const sourceX = (bitmap.width - sourceSize) / 2;
    const sourceY = (bitmap.height - sourceSize) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    context.drawImage(bitmap, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.86));
    if (!blob) throw new Error("The photo could not be prepared.");
    return blob;
  } finally {
    bitmap.close();
  }
}

type CoinSummary = {
  balanceUnits: number;
  rank: number;
};

export default function ProfilePage() {
  const { user, profile, loading: authLoading, reloadProfile } = useAuthProfile();
  const { data, loading: leagueLoading, error, reload } = useLeagueData();
  const [coinSummary, setCoinSummary] = useState<CoinSummary | null>(null);
  const [coinLoading, setCoinLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);

  const allTime = useMemo(() => allTimeLeaderboard(data), [data]);
  const fantasySummary = profile ? allTime.find(row => row.userId === profile.id) : null;
  const season = useMemo(() => currentSeason(data), [data]);
  const avatarUrl = useMemo(() => {
    if (!profile?.avatar_path) return null;
    return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(profile.avatar_path).data.publicUrl;
  }, [profile?.avatar_path]);

  useEffect(() => {
    let active = true;

    async function loadCoinStanding() {
      if (!profile?.id || !season?.id) {
        if (active) {
          setCoinSummary(null);
          setCoinLoading(false);
        }
        return;
      }

      setCoinLoading(true);
      const { data: rows, error: standingsError } = await supabase.rpc("get_betting_standings", {
        target_season_id: season.id
      });
      if (!active) return;

      if (standingsError) {
        setCoinSummary(null);
      } else {
        setCoinSummary(findCoinSummary((rows || []) as BettingStanding[], profile.id));
      }
      setCoinLoading(false);
    }

    void loadCoinStanding();
    return () => {
      active = false;
    };
  }, [profile?.id, season?.id]);

  async function importAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user || !profile || uploading) return;

    const extension = avatarExtensions[file.type];
    if (!extension) {
      setToast({ message: "Choose a JPG, PNG, or WebP image.", tone: "warning" });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setToast({ message: "Choose an image smaller than 5 MB.", tone: "warning" });
      return;
    }

    setUploading(true);
    let optimizedAvatar: Blob;
    try {
      optimizedAvatar = await prepareAvatar(file);
    } catch (processingError) {
      setUploading(false);
      setToast({ message: friendlyActionError(processingError, "The photo could not be prepared. Try a different image."), tone: "error" });
      return;
    }
    const previousPath = profile.avatar_path;
    const avatarPath = `${user.id}/avatar-${Date.now()}.webp`;
    const upload = await supabase.storage.from(AVATAR_BUCKET).upload(avatarPath, optimizedAvatar, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: false
    });

    if (upload.error) {
      setUploading(false);
      setToast({ message: friendlyActionError(upload.error, "The photo could not be uploaded. Please try again."), tone: "error" });
      return;
    }

    const update = await supabase.rpc("set_profile_avatar", { new_avatar_path: avatarPath });
    if (update.error) {
      await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath]);
      setUploading(false);
      setToast({ message: friendlyActionError(update.error, "The uploaded photo could not be saved. Please try again."), tone: "error" });
      return;
    }

    await reloadProfile();
    if (previousPath && previousPath !== avatarPath) {
      void supabase.storage.from(AVATAR_BUCKET).remove([previousPath]);
    }
    setUploading(false);
    setToast({ message: "Profile photo updated.", tone: "success" });
  }

  if (authLoading || leagueLoading) return <ProfileSkeleton />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!user || !profile) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-4 md:space-y-5">
      <Toast message={toast?.message || null} tone={toast?.tone} onDone={() => setToast(null)} />

      <header className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.2em] text-league-gold/65">Your account</div>
          <h1 className="mt-1 font-display text-4xl uppercase sm:text-5xl">Profile</h1>
        </div>
        <Link
          href="/settings"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-league-gold/25 bg-ink-850 px-3.5 text-sm font-bold text-chalk/65 shadow-[0_7px_20px_rgba(0,0,0,.13)] transition hover:border-league-gold/40 hover:text-league-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold"
        >
          <Settings size={17} />
          <span className="hidden sm:inline">Settings</span>
        </Link>
      </header>

      <section className="flex min-h-[7.5rem] items-center gap-4 rounded-[1.35rem] border border-league-gold/25 bg-ink-850 px-4 py-4 shadow-[0_9px_24px_rgba(0,0,0,.13)] sm:px-5">
        <input
          ref={avatarInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={importAvatar}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => avatarInput.current?.click()}
          className="group relative h-[5.25rem] w-[5.25rem] shrink-0 overflow-hidden rounded-[1.2rem] border border-league-gold/30 bg-league-gold/[.055] text-chalk/35 transition hover:border-league-gold/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold disabled:cursor-wait sm:h-24 sm:w-24"
          aria-label={avatarUrl ? "Change profile photo" : "Import profile photo"}
        >
          {avatarUrl ? (
            // The avatar host is the current Supabase project and is determined at runtime.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center">
              <UserRound size={42} strokeWidth={1.45} />
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-black/65 py-1.5 text-[9px] font-black uppercase tracking-wider text-league-gold backdrop-blur-sm transition group-hover:bg-black/75">
            {uploading ? <LoaderCircle size={13} className="animate-spin" /> : <Camera size={13} />}
            {uploading ? "Saving" : "Photo"}
          </span>
        </button>

        <div className="min-w-0">
          <div className="text-[9px] font-black uppercase tracking-[.18em] text-chalk/30">Username</div>
          <h2 className="mt-1 truncate font-display text-3xl uppercase sm:text-4xl">{profile.username}</h2>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-chalk/40">
            {profile.is_admin ? <ShieldCheck size={14} className="text-league-gold/75" /> : <UserRound size={14} />}
            {profile.is_admin ? "League administrator" : "League member"}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <ProfileMetric
          eyebrow="All time"
          title="Fantasy"
          icon={<Shirt size={23} />}
          value={String(fantasySummary?.points ?? 0)}
          valueLabel="Total points"
          rank={fantasySummary?.rank ?? null}
        />
        <ProfileMetric
          eyebrow={season?.name || "Current season"}
          title="Coins"
          icon={<LeagueCoin size={30} />}
          value={coinLoading ? "…" : coinSummary ? formatCoins(coinSummary.balanceUnits) : "—"}
          valueLabel="Total coins"
          rank={coinLoading ? null : coinSummary?.rank ?? null}
          gold
        />
      </div>
    </div>
  );
}

function findCoinSummary(rows: BettingStanding[], userId: string): CoinSummary | null {
  const ordered = [...rows].sort((first, second) => (
    Number(second.balance_units) - Number(first.balance_units)
    || first.username.localeCompare(second.username)
  ));
  let rank = 0;
  let previousBalance: number | null = null;

  for (let index = 0; index < ordered.length; index += 1) {
    const row = ordered[index];
    const balance = Number(row.balance_units);
    if (previousBalance === null || balance !== previousBalance) rank = index + 1;
    previousBalance = balance;
    if (row.user_id === userId) return { balanceUnits: balance, rank };
  }
  return null;
}

function ProfileMetric({
  eyebrow,
  title,
  icon,
  value,
  valueLabel,
  rank,
  gold = false
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  value: string;
  valueLabel: string;
  rank: number | null;
  gold?: boolean;
}) {
  return (
    <section className="min-w-0 rounded-[1.3rem] border border-league-gold/25 bg-ink-850 p-3.5 shadow-[0_9px_24px_rgba(0,0,0,.13)] sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl border", gold ? "border-league-gold/20 bg-league-gold/[.055]" : "border-turf-400/20 bg-turf-400/[.045] text-turf-400")}>
          {icon}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[8px] font-black uppercase tracking-[.16em] text-chalk/25 sm:text-[9px]">{eyebrow}</div>
          <h2 className="mt-0.5 font-display text-xl uppercase sm:text-2xl">{title}</h2>
        </div>
      </div>

      <div className="mt-5">
        <div className={cn("truncate font-mono text-3xl font-black sm:text-4xl", gold ? "text-league-gold" : "text-chalk")}>{value}</div>
        <div className="mt-1 text-[9px] font-black uppercase tracking-[.16em] text-chalk/30">{valueLabel}</div>
      </div>

      <div className="mt-4 border-t border-league-gold/10 pt-3">
        <div className="font-mono text-lg font-bold text-chalk/55 sm:text-xl">{rank ? `#${rank}` : "—"}</div>
        <div className="mt-0.5 text-[8px] font-black uppercase tracking-[.16em] text-chalk/25 sm:text-[9px]">League rank</div>
      </div>
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 md:space-y-5" aria-label="Loading profile" aria-busy="true">
      <div className="flex items-center justify-between">
        <div><div className="skeleton-shimmer h-3 w-20 rounded" /><div className="skeleton-shimmer mt-2 h-10 w-32 rounded-lg" /></div>
        <div className="skeleton-shimmer h-11 w-11 rounded-xl sm:w-28" />
      </div>
      <div className="flex min-h-[7.5rem] items-center gap-4 rounded-[1.35rem] border border-league-gold/20 bg-ink-850 px-4 py-4 sm:px-5">
        <div className="skeleton-shimmer h-[5.25rem] w-[5.25rem] shrink-0 rounded-[1.2rem] sm:h-24 sm:w-24" />
        <div className="min-w-0 flex-1"><div className="skeleton-shimmer h-3 w-20 rounded" /><div className="skeleton-shimmer mt-3 h-8 w-44 max-w-full rounded-lg" /><div className="skeleton-shimmer mt-3 h-3 w-28 rounded" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {[0, 1].map(item => <div key={item} className="min-h-[13.5rem] rounded-[1.3rem] border border-league-gold/20 bg-ink-850 p-4"><div className="skeleton-shimmer h-10 w-28 max-w-full rounded-xl" /><div className="skeleton-shimmer mt-6 h-9 w-24 max-w-full rounded-lg" /><div className="skeleton-shimmer mt-7 h-8 w-16 rounded-lg" /></div>)}
      </div>
    </div>
  );
}
