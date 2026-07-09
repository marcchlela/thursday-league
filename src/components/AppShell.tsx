"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { CalendarDays, List, Shield, Trophy, Users, UserRound, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { cn } from "@/lib/utils";

const baseLinks = [
  { href: "/", label: "Game", icon: CalendarDays },
  { href: "/games", label: "Games", icon: List },
  { href: "/players", label: "Players", icon: Users },
  { href: "/fantasy", label: "Fantasy", icon: Trophy },
  { href: "/profile", label: "Profile", icon: UserRound }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading } = useAuthProfile();
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (!loading && !user && !isLogin) router.replace("/login");
    if (!loading && user && isLogin) router.replace("/");
  }, [loading, user, isLogin, router]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-ink-900 text-chalk">Loading Thursday League...</div>;
  }

  if (isLogin) return <>{children}</>;
  if (!user) return null;

  const links = profile?.is_admin ? [...baseLinks, { href: "/admin", label: "Admin", icon: Shield }] : baseLinks;

  return (
    <div className="min-h-screen bg-ink-900 bg-turfMuted text-chalk">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-900/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="group flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border-2 border-perimeter-400 bg-turf-700 shadow-glow">
              <span className="font-display text-lg">TL</span>
            </div>
            <div>
              <p className="font-display text-xl uppercase leading-none tracking-wide">Thursday League</p>
              <p className="text-xs text-chalk/50">5-a-side fantasy</p>
            </div>
          </Link>

          <div className="hidden items-center gap-2 md:flex">
            {links.map(link => {
              const Icon = link.icon;
              const active = pathname === link.href || (link.href === "/games" && pathname.startsWith("/games/"));
              return (
                <Link key={link.href} href={link.href} className={cn("flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold text-chalk/70 transition hover:bg-white/5 hover:text-chalk", active && "bg-perimeter-400/15 text-chalk ring-1 ring-perimeter-400/30")}>
                  <Icon size={16} /> {link.label}
                </Link>
              );
            })}
          </div>

          <button onClick={logout} className="rounded-2xl border border-white/10 bg-white/5 p-2 text-chalk/70 transition hover:text-chalk" title="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 pb-24">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-ink-900/95 px-2 py-2 backdrop-blur-xl md:hidden">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
          {links.map(link => {
            const Icon = link.icon;
            const active = pathname === link.href || (link.href === "/games" && pathname.startsWith("/games/"));
            return (
              <Link key={link.href} href={link.href} className={cn("flex flex-col items-center gap-1 rounded-2xl py-2 text-[11px] text-chalk/60", active && "bg-perimeter-400/15 text-chalk")}>
                <Icon size={18} /> {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
