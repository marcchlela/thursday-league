import Link from "next/link";
import { ArrowLeft, ChevronRight, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsHeader({
  title,
  description,
  backHref = "/settings",
  backLabel = "Settings"
}: {
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header>
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-xs font-bold text-chalk/40 transition hover:text-league-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold">
        <ArrowLeft size={14} />
        {backLabel}
      </Link>
      <div className="mt-4 text-[10px] font-black uppercase tracking-[.2em] text-league-gold/65">Account settings</div>
      <h1 className="mt-1 font-display text-4xl uppercase sm:text-5xl">{title}</h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-chalk/42">{description}</p>
    </header>
  );
}

export function SettingsPanel({
  title,
  children,
  danger = false
}: {
  title?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section className={cn(
      "overflow-hidden rounded-[1.35rem] border bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]",
      danger ? "border-red-400/25" : "border-league-gold/25"
    )}>
      {title ? <div className={cn("border-b px-4 py-3 text-[9px] font-black uppercase tracking-[.18em] sm:px-5", danger ? "border-red-400/15 text-red-300/75" : "border-league-gold/15 text-league-gold/65")}>{title}</div> : null}
      {children}
    </section>
  );
}

export function SettingsLinkRow({
  href,
  icon: Icon,
  title,
  detail,
  tone = "gold",
  badge
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  tone?: "gold" | "green";
  badge?: React.ReactNode;
}) {
  return (
    <Link href={href} className="group flex items-center gap-3 px-4 py-4 transition hover:bg-league-gold/[.04] focus:outline-none focus-visible:bg-league-gold/[.06] sm:px-5">
      <span className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
        tone === "green" ? "border-turf-400/20 bg-turf-400/[.045] text-turf-400" : "border-league-gold/20 bg-league-gold/[.055] text-league-gold"
      )}>
        <Icon size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-chalk">{title}</span>
          {badge}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-chalk/35">{detail}</span>
      </span>
      <ChevronRight size={17} className="shrink-0 text-chalk/20 transition group-hover:translate-x-0.5 group-hover:text-league-gold" />
    </Link>
  );
}
