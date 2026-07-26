"use client";

import { Check, Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const options: { id: ThemePreference; label: string; detail: string; icon: typeof Sun }[] = [
  { id: "system", label: "System", detail: "Match this device", icon: Laptop },
  { id: "light", label: "Light", detail: "Warm and bright", icon: Sun },
  { id: "dark", label: "Dark", detail: "Matchday at night", icon: Moon }
];

export function ThemeSelector() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="grid grid-cols-3 gap-2 p-3 sm:p-4" role="radiogroup" aria-label="App appearance">
      {options.map(option => {
        const Icon = option.icon;
        const selected = preference === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setPreference(option.id)}
            className={cn(
              "relative min-h-24 rounded-xl border px-2 py-3 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:min-h-28",
              selected
                ? "border-league-gold/45 bg-league-gold/[.09] text-league-gold"
                : "border-chalk/[.09] bg-chalk/[.025] text-chalk/48 hover:border-league-gold/25 hover:text-chalk"
            )}
          >
            {selected ? <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-league-gold text-gold-ink"><Check size={12} strokeWidth={3} /></span> : null}
            <Icon className="mx-auto" size={21} />
            <span className="mt-2 block text-xs font-black uppercase tracking-wider sm:text-sm">{option.label}</span>
            <span className="mt-1 block text-[9px] text-chalk/35 sm:text-[10px]">{option.detail}</span>
          </button>
        );
      })}
    </div>
  );
}
