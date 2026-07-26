import { ReleaseLevel } from "@/content/whatsNew";
import { cn } from "@/lib/utils";

const labels: Record<ReleaseLevel, string> = {
  major: "Major",
  minor: "Minor",
  patch: "Patch"
};

export function ReleaseLevelBadge({ level }: { level: ReleaseLevel }) {
  return (
    <span className={cn(
      "inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[.16em]",
      level === "major"
        ? "border-league-gold/35 bg-league-gold/[.1] text-league-gold"
        : level === "minor"
          ? "border-turf-400/25 bg-turf-400/[.07] text-turf-400"
          : "border-chalk/10 bg-chalk/[.035] text-chalk/48"
    )}>
      {labels[level]}
    </span>
  );
}
