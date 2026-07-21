"use client";

import Link from "next/link";
import { Coins, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export function PlaySwitcher({ active }: { active: "fantasy" | "bets" }) {
  const sections = [
    { id: "fantasy" as const, href: "/fantasy", label: "Fantasy", icon: Trophy },
    { id: "bets" as const, href: "/betting", label: "Bets", icon: Coins }
  ];
  return (
    <nav aria-label="Play sections" className="grid grid-cols-2 rounded-3xl border border-white/10 bg-white/[0.03] p-1">
      {sections.map(section => {
        const Icon = section.icon;
        return <Link key={section.id} href={section.href} aria-current={active === section.id ? "page" : undefined} className={cn("flex items-center justify-center gap-2 rounded-2xl px-4 py-3 font-bold transition", active === section.id ? "bg-perimeter-400/20 text-chalk ring-1 ring-perimeter-400/30" : "text-chalk/55 hover:text-chalk")}><Icon size={18} />{section.label}</Link>;
      })}
    </nav>
  );
}
