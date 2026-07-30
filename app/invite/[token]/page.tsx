"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Link2, ShieldCheck, UsersRound } from "lucide-react";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { friendlyActionError } from "@/lib/actionErrors";
import { supabase } from "@/lib/supabase";
import { Card, LoadingState, PrimaryButton, SecondaryButton } from "@/components/ui";

type InvitePreview = {
  id: string;
  name: string;
  slug: string;
  member_count: number;
  fantasy_enabled: boolean;
  betting_enabled: boolean;
  already_member: boolean;
  expires_at: string;
};

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { reloadLeagues } = useLeagueContext();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.rpc("preview_league_invite_link", {
      submitted_token: params.token
    }).then(({ data, error: previewError }) => {
      if (!active) return;
      if (previewError) {
        setError(friendlyActionError(previewError, "This invitation is invalid or has expired."));
      } else {
        setPreview(data as InvitePreview);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [params.token]);

  async function accept() {
    if (!preview || joining) return;
    if (preview.already_member) {
      router.push(`/l/${preview.slug}`);
      return;
    }
    setJoining(true);
    const { data, error: acceptError } = await supabase.rpc("accept_league_invite_link", {
      submitted_token: params.token
    });
    if (acceptError) {
      setJoining(false);
      setError(friendlyActionError(acceptError, "The invitation could not be accepted."));
      return;
    }
    await reloadLeagues();
    const result = data as { slug: string };
    router.replace(`/l/${result.slug}`);
  }

  if (loading) return <LoadingState label="Checking invitation" cards={1} />;

  return (
    <div className="mx-auto max-w-xl py-4">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-league-gold/15 bg-league-gold/[.04] p-5 text-center sm:p-7">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-league-gold/25 bg-league-gold/[.09] text-league-gold"><Link2 size={25} /></span>
          <div className="mt-4 text-[10px] font-black uppercase tracking-[.2em] text-league-gold/60">League invitation</div>
          <h1 className="mt-1 font-display text-4xl uppercase">You&apos;ve been invited</h1>
        </div>
        <div className="p-5 sm:p-7">
          {error ? (
            <>
              <div role="alert" className="rounded-xl border border-red-400/25 bg-red-400/[.07] p-4 text-sm text-red-200">{error}</div>
              <SecondaryButton type="button" className="mt-4 w-full" onClick={() => router.replace("/leagues")}>Back to leagues</SecondaryButton>
            </>
          ) : preview ? (
            <>
              <h2 className="text-center font-display text-3xl uppercase">{preview.name}</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-league-gold/15 bg-black/15 p-3 text-center"><UsersRound className="mx-auto text-turf-400" size={19} /><div className="mt-1 text-sm font-bold">{preview.member_count} members</div></div>
                <div className="rounded-xl border border-league-gold/15 bg-black/15 p-3 text-center"><ShieldCheck className="mx-auto text-league-gold" size={19} /><div className="mt-1 text-sm font-bold">{[preview.fantasy_enabled && "Fantasy", preview.betting_enabled && "Bets"].filter(Boolean).join(" + ") || "Matches"}</div></div>
              </div>
              <p className="mt-4 text-center text-sm leading-relaxed text-chalk/48">
                Accepting joins this league immediately. You can leave later from league settings.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <PrimaryButton type="button" disabled={joining} onClick={() => void accept()}>
                  {joining ? "Joining…" : preview.already_member ? "Open league" : "Accept invitation"}
                </PrimaryButton>
                <SecondaryButton type="button" onClick={() => router.replace("/leagues")}>Not now</SecondaryButton>
              </div>
            </>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
