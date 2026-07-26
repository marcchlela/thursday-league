import Link from "next/link";
import { CalendarDays, ChevronRight, Sparkles } from "lucide-react";
import { releaseNotes } from "@/content/whatsNew";
import { ReleaseLevelBadge } from "@/components/ReleaseLevelBadge";
import { SettingsHeader } from "@/components/SettingsComponents";
import { WhatsNewReadMarker } from "@/components/WhatsNewReadMarker";

function releaseDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export default function WhatsNewPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <WhatsNewReadMarker />
      <SettingsHeader title="What’s New" description="The newest Thursday League releases, improvements, and fixes—newest first." />

      <div className="space-y-3">
        {releaseNotes.map((release, index) => (
          <Link
            key={release.version}
            href={`/settings/whats-new/${release.version}`}
            className="group block rounded-[1.35rem] border border-league-gold/25 bg-ink-850 p-4 shadow-[0_9px_24px_rgba(0,0,0,.11)] transition hover:border-league-gold/40 hover:bg-ink-800/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:p-5"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-league-gold/20 bg-league-gold/[.065] text-league-gold">
                <Sparkles size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-black text-league-gold">v{release.version}</span>
                  <ReleaseLevelBadge level={release.level} />
                  {index === 0 ? <span className="text-[8px] font-black uppercase tracking-[.16em] text-chalk/35">Latest</span> : null}
                </span>
                <span className="mt-2 block font-display text-2xl uppercase text-chalk sm:text-3xl">{release.title}</span>
                <span className="mt-1.5 block text-sm leading-relaxed text-chalk/45">{release.summary}</span>
                <span className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-chalk/30">
                  <CalendarDays size={13} />
                  {releaseDate(release.releasedAt)}
                </span>
              </span>
              <ChevronRight size={18} className="mt-3 shrink-0 text-chalk/20 transition group-hover:translate-x-0.5 group-hover:text-league-gold" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
