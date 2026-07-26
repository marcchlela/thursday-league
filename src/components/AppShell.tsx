"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, List, Shield, Trophy, Users, UserRound } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useCoinBalance } from "@/hooks/useCoinBalance";
import { cn } from "@/lib/utils";
import { CoinAmount, LeagueCoin } from "./LeagueCoin";
import { LaunchScreen } from "./LaunchScreen";
import { NotificationNudge } from "./NotificationOnboarding";
import leagueLogo from "../../Thursday League logo (no bg).png";

const baseLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/games", label: "Games", icon: List },
  { href: "/fantasy", label: "Play", icon: Trophy },
  { href: "/profile", label: "Profile", icon: UserRound }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading } = useAuthProfile();
  const balanceUnits = useCoinBalance(user?.id);
  const isLogin = pathname === "/login";
  const [launchReady, setLaunchReady] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeout = window.setTimeout(() => setLaunchReady(true), reduceMotion ? 150 : 950);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!loading && !user && !isLogin) router.replace("/login");
    if (!loading && user && isLogin) router.replace("/");
  }, [loading, user, isLogin, router]);

  if (loading || !launchReady) {
    return <LaunchScreen />;
  }

  if (isLogin) return <>{children}</>;
  if (!user) return null;

  const links = profile?.is_admin ? [...baseLinks, { href: "/admin", label: "Admin", icon: Shield }] : baseLinks;

  return (
    <div className="min-h-screen bg-ink-900 bg-turfMuted text-chalk">
      <NotificationNudge userId={user.id} />
      <header className="sticky top-0 z-40 border-b border-league-gold/10 bg-ink-900/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 pb-2.5 pt-[calc(.625rem+env(safe-area-inset-top))] sm:gap-3 sm:px-4">
          <Link href="/" className="group flex min-w-0 items-center gap-1.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:gap-2.5">
            <Image src={leagueLogo} alt="" priority className="h-9 w-9 shrink-0 scale-125 object-contain sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <p className="max-w-[6.6rem] truncate font-display text-base uppercase leading-none tracking-wide min-[380px]:max-w-none sm:text-2xl">Thursday League</p>
            </div>
          </Link>

          <div className="hidden items-center gap-2 lg:flex">
            {links.map(link => {
              const Icon = link.icon;
              const active = pathname === link.href || (link.href === "/games" && pathname.startsWith("/games/")) || (link.href === "/fantasy" && (pathname.startsWith("/fantasy/") || pathname.startsWith("/betting"))) || (link.href === "/profile" && pathname.startsWith("/settings"));
              return (
                <Link key={link.href} href={link.href} className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-chalk/55 transition hover:bg-league-gold/[.05] hover:text-chalk", active && "bg-league-gold/[.08] text-league-gold ring-1 ring-league-gold/20")}>
                  <Icon size={16} /> {link.label}
                </Link>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link href="/players" aria-current={pathname.startsWith("/players") ? "page" : undefined} className={cn("inline-flex h-10 items-center gap-1.5 rounded-xl border px-2 text-[11px] font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:h-11 sm:px-3 sm:text-sm", pathname.startsWith("/players") ? "border-league-gold/35 bg-league-gold/[.09] text-league-gold" : "border-league-gold/15 bg-ink-850 text-chalk/55 hover:border-league-gold/30 hover:text-chalk")}>
              <Users size={16} />
              <span>Players</span>
            </Link>
            <Link href="/betting" aria-label={balanceUnits == null ? "Betting coin balance loading" : `${balanceUnits / 100} betting coins`} className="flex h-10 items-center gap-1.5 rounded-xl border border-league-gold/15 bg-ink-850 px-2 transition hover:border-league-gold/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:h-11 sm:gap-2 sm:px-2.5">
              {balanceUnits == null ? <><LeagueCoin size={19} /><span className="font-mono text-xs text-chalk/50">—</span></> : <CoinAmount units={balanceUnits} iconSize={19} className="text-xs font-bold sm:text-base" />}
            </Link>
          </div>
        </div>
      </header>

      <main className={cn("mx-auto max-w-6xl px-4 pb-24", pathname === "/" ? "py-4 md:py-6" : "py-8")}>{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-league-gold/30 bg-ink-900/95 px-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
          {links.map(link => {
            const Icon = link.icon;
            const active = pathname === link.href || (link.href === "/games" && pathname.startsWith("/games/")) || (link.href === "/fantasy" && (pathname.startsWith("/fantasy/") || pathname.startsWith("/betting"))) || (link.href === "/profile" && pathname.startsWith("/settings"));
            return (
              <Link key={link.href} href={link.href} className={cn("flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] text-chalk/45 transition", active && "bg-league-gold/[.08] text-league-gold")}>
                <Icon size={18} /> {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
