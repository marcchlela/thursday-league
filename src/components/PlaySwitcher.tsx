"use client";

import { LeagueLink as Link } from "./LeagueLink";
import { cn } from "@/lib/utils";
import { useLeagueContext } from "@/hooks/useLeagueContext";

export function PlaySwitcher({ active }: { active: "fantasy" | "bets" }) {
  const { league } = useLeagueContext();
  const sections = [
    league?.fantasy_enabled ? { id: "fantasy" as const, href: "/fantasy", label: "Fantasy" } : null,
    league?.betting_enabled ? { id: "bets" as const, href: "/betting", label: "Bets" } : null
  ].filter(Boolean) as { id: "fantasy" | "bets"; href: string; label: string }[];
  return (
    <nav aria-label="Play sections" className="grid rounded-[1.15rem] border border-league-gold/25 bg-ink-850 p-1 shadow-[0_7px_20px_rgba(0,0,0,.13)]" style={{ gridTemplateColumns: `repeat(${Math.max(1, sections.length)}, minmax(0, 1fr))` }}>
      {sections.map(section => {
        return <Link key={section.id} href={section.href} aria-current={active === section.id ? "page" : undefined} className={cn("relative rounded-[.85rem] px-4 py-3 text-center text-sm font-extrabold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold", active === section.id ? "bg-turf-400/[.09] text-turf-400 after:absolute after:inset-x-8 after:bottom-1 after:h-0.5 after:rounded-full after:bg-turf-400" : "text-chalk/45 hover:bg-chalk/[.035] hover:text-chalk")}>{section.label}</Link>;
      })}
    </nav>
  );
}
