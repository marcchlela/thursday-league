"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function PlaySwitcher({ active }: { active: "fantasy" | "bets" }) {
  const sections = [
    { id: "fantasy" as const, href: "/fantasy", label: "Fantasy" },
    { id: "bets" as const, href: "/betting", label: "Bets" }
  ];
  return (
    <nav aria-label="Play sections" className="grid grid-cols-2 rounded-[1.15rem] border border-league-gold/25 bg-ink-850 p-1 shadow-[0_7px_20px_rgba(0,0,0,.13)]">
      {sections.map(section => {
        return <Link key={section.id} href={section.href} aria-current={active === section.id ? "page" : undefined} className={cn("relative rounded-[.85rem] px-4 py-3 text-center text-sm font-extrabold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold", active === section.id ? "bg-turf-400/[.09] text-turf-400 after:absolute after:inset-x-8 after:bottom-1 after:h-0.5 after:rounded-full after:bg-turf-400" : "text-chalk/45 hover:bg-chalk/[.035] hover:text-chalk")}>{section.label}</Link>;
      })}
    </nav>
  );
}
