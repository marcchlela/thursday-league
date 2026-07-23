import { cn } from "@/lib/utils";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function PlayerAvatar({ name, className }: { name: string; className?: string }) {
  const variant = [...name].reduce((total, character) => total + character.charCodeAt(0), 0) % 3;
  return (
    <span className={cn(
      "relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-league-gold/30 bg-[#132f1d] font-display font-black uppercase text-chalk shadow-[0_7px_18px_rgba(0,0,0,.2)]",
      className
    )} aria-hidden="true">
      <span className={cn(
        "absolute -right-[22%] -top-[18%] h-[58%] w-[58%] rounded-full",
        variant === 0 ? "bg-league-gold/20" : variant === 1 ? "bg-turf-400/20" : "bg-red-400/15"
      )} />
      <span className="absolute -bottom-[30%] -left-[18%] h-[62%] w-[62%] rounded-full border border-chalk/10" />
      <span className="relative">{initials(name)}</span>
    </span>
  );
}
