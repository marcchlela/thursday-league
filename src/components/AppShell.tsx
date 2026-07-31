"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Home,
  Link2,
  List,
  Plus,
  Shield,
  Trophy,
  Users,
  UserRound
} from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import {
  LeagueContextProvider,
  leagueRelativePath,
  useLeagueContext
} from "@/hooks/useLeagueContext";
import { useCoinBalance } from "@/hooks/useCoinBalance";
import { LeagueDataProvider } from "@/hooks/useLeagueData";
import { friendlyActionError } from "@/lib/actionErrors";
import { copyText } from "@/lib/clipboard";
import {
  introductionWasSeen,
  POST_AUTH_PATH_KEY
} from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { LoadProblem } from "@/lib/loadProblems";
import { CoinAmount, LeagueCoin } from "./LeagueCoin";
import { LaunchScreen } from "./LaunchScreen";
import {
  NotificationNudge,
  NotificationOnboarding
} from "./NotificationOnboarding";
import { ErrorState, Toast, type ToastTone } from "./ui";
import leagueLogo from "../../Thursday League logo (no bg).png";

const baseLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/games", label: "Games", icon: List },
  { href: "/fantasy", label: "Play", icon: Trophy },
  { href: "/profile", label: "Profile", icon: UserRound }
];

const authPaths = ["/login", "/forgot-password"];
const publicPaths = ["/welcome", "/invite"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading, error, reloadProfile } = useAuthProfile();
  const isAuthPage = authPaths.some(path => pathname === path);
  const isPublicPage = publicPaths.some(path => pathname === path || pathname.startsWith(`${path}/`));
  const isWelcomePage = pathname === "/welcome";
  const [launchReady, setLaunchReady] = useState(false);

  useEffect(() => {
    if (window.sessionStorage.getItem("thursday-league-launch-seen") === "true") {
      setLaunchReady(true);
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeout = window.setTimeout(() => {
      window.sessionStorage.setItem("thursday-league-launch-seen", "true");
      setLaunchReady(true);
    }, reduceMotion ? 100 : 800);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!loading && !user && !isAuthPage && !isPublicPage) {
      if (pathname === "/" && !introductionWasSeen()) {
        router.replace("/welcome");
        return;
      }
      window.sessionStorage.setItem(
        POST_AUTH_PATH_KEY,
        `${window.location.pathname}${window.location.search}`
      );
      router.replace("/login");
    }
    if (!loading && user && isAuthPage) {
      const intendedPath = window.sessionStorage.getItem(
        POST_AUTH_PATH_KEY
      );
      window.sessionStorage.removeItem(POST_AUTH_PATH_KEY);
      router.replace(intendedPath?.startsWith("/") ? intendedPath : "/");
    }
    if (!loading && user && isWelcomePage) {
      router.replace("/");
    }
  }, [
    isAuthPage,
    isPublicPage,
    isWelcomePage,
    loading,
    pathname,
    router,
    user
  ]);

  if (loading || !launchReady) return <LaunchScreen />;
  if (error) return <StartupFailure problem={error} onRetry={reloadProfile} />;
  if (isAuthPage || (isPublicPage && !user)) return <>{children}</>;
  if (isWelcomePage) return <LaunchScreen />;
  if (!user || !profile) return <LaunchScreen />;

  return (
    <LeagueContextProvider
      userId={user.id}
      preferredLeagueId={profile.last_active_league_id}
    >
      <AuthenticatedShell userId={user.id}>{children}</AuthenticatedShell>
    </LeagueContextProvider>
  );
}

function AuthenticatedShell({
  userId,
  children
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const {
    league,
    leagues,
    loading,
    error,
    isLeagueAdmin,
    isPlatformAdmin,
    leaguePath,
    switchLeague,
    reloadLeagues
  } = useLeagueContext();
  const balanceUnits = useCoinBalance(userId, league?.id);
  const relativePath = leagueRelativePath(pathname);
  const isFocusedFlow = pathname.startsWith("/onboarding") || pathname.startsWith("/invite/");
  const isLeaguePage = pathname.startsWith("/l/") || [
    "/",
    "/games",
    "/players",
    "/fantasy",
    "/betting",
    "/profile",
    "/admin"
  ].some(path => pathname === path || pathname.startsWith(`${path}/`));
  const [leagueMenuOpen, setLeagueMenuOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const leagueMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!leagueMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!leagueMenuRef.current?.contains(event.target as Node)) {
        setLeagueMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [leagueMenuOpen]);

  if (loading) return <LaunchScreen />;
  if (error) return <StartupFailure problem={error} onRetry={reloadLeagues} />;
  if (!league && isLeaguePage) return <LaunchScreen />;

  if (isFocusedFlow) {
    return (
      <div className="min-h-[100svh] bg-ink-900 bg-turfMuted text-chalk">
        <NotificationOnboarding userId={userId} />
        {children}
      </div>
    );
  }

  async function createInviteLink() {
    if (!league || inviteBusy) return;
    setInviteBusy(true);
    try {
      const { data, error: inviteError } = await supabase.rpc(
        "create_league_invite_link",
        { target_league_id: league.id, valid_hours: 72 }
      );
      if (inviteError) throw inviteError;
      const token = (data as { token?: string } | null)?.token;
      if (!token) throw new Error("The invite link was not returned.");
      const inviteUrl = `${window.location.origin}/invite/${token}`;
      await copyText(inviteUrl);
      setLeagueMenuOpen(false);
      setToast({
        message: "Invite link copied. It works once and expires in 72 hours.",
        tone: "success"
      });
    } catch (inviteError) {
      setToast({
        message: friendlyActionError(inviteError, "The invite link could not be created."),
        tone: "error"
      });
    } finally {
      setInviteBusy(false);
    }
  }

  async function copyLeagueCode() {
    if (!league) return;
    try {
      await copyText(league.join_code);
      setLeagueMenuOpen(false);
      setToast({ message: "League code copied. Code joins require admin approval.", tone: "success" });
    } catch (copyError) {
      setToast({
        message: friendlyActionError(copyError, "The league code could not be copied."),
        tone: "error"
      });
    }
  }

  const playerLinks = league
    ? baseLinks
        .filter(link => link.href !== "/fantasy" || league.fantasy_enabled || league.betting_enabled)
        .map(link => link.href === "/fantasy" && !league.fantasy_enabled
          ? { ...link, href: "/betting" }
          : link)
    : [];
  const links = isLeagueAdmin
    ? [...playerLinks, { href: "/admin", label: "Admin", icon: Shield }]
    : playerLinks;
  const pageContent = league && isLeaguePage
    ? <LeagueDataProvider key={league.id} leagueId={league.id}>{children}</LeagueDataProvider>
    : children;

  return (
    <div className="min-h-screen bg-ink-900 bg-turfMuted text-chalk">
      <NotificationOnboarding userId={userId} />
      <a href="#main-content" className="fixed left-3 top-3 z-[100] -translate-y-24 rounded-xl bg-league-gold px-4 py-2 font-bold text-gold-ink transition focus:translate-y-0">
        Skip to content
      </a>
      {league ? <NotificationNudge userId={userId} /> : null}
      <header className="sticky top-0 z-40 border-b border-league-gold/10 bg-ink-900/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 pb-2.5 pt-[calc(.625rem+env(safe-area-inset-top))] sm:gap-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
            <Link
              href={league ? leaguePath("/") : "/leagues"}
              aria-label="League home"
              className="shrink-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold"
            >
              <Image src={leagueLogo} alt="" priority className="h-9 w-9 scale-125 object-contain sm:h-12 sm:w-12" />
            </Link>
            <div ref={leagueMenuRef} className="relative min-w-0">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={leagueMenuOpen}
                onClick={() => setLeagueMenuOpen(open => !open)}
                className="flex h-10 max-w-[10rem] items-center gap-1.5 rounded-xl border border-league-gold/18 bg-ink-850 px-2.5 text-left transition hover:border-league-gold/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold min-[430px]:max-w-[14rem] sm:h-11 sm:px-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[8px] font-black uppercase tracking-[.16em] text-league-gold/55">League</span>
                  <span className="block truncate text-xs font-extrabold text-chalk/85 sm:text-sm">
                    {league?.name || "Add a league"}
                  </span>
                </span>
                <ChevronDown size={15} className={cn("shrink-0 text-chalk/40 transition", leagueMenuOpen && "rotate-180")} />
              </button>

              {leagueMenuOpen ? (
                <div
                  role="menu"
                  className="absolute left-0 top-[calc(100%+.5rem)] z-50 w-64 overflow-hidden rounded-[1rem] border border-league-gold/25 bg-ink-850 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,.45)]"
                >
                  <div className="px-3 py-2 text-[9px] font-black uppercase tracking-[.17em] text-chalk/35">Your leagues</div>
                  {leagues.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setLeagueMenuOpen(false);
                        if (item.id !== league?.id) void switchLeague(item.id);
                      }}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold transition hover:bg-league-gold/[.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold",
                        item.id === league?.id && "bg-league-gold/[.08] text-league-gold"
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      {item.id === league?.id ? <Check size={16} /> : null}
                    </button>
                  ))}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void copyLeagueCode()}
                    className="mx-1 mt-1 flex min-h-10 w-[calc(100%_-_0.5rem)] items-center gap-2 rounded-xl border border-league-gold/30 bg-league-gold/[.035] px-2.5 text-left transition hover:border-league-gold/50 hover:bg-league-gold/[.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[8px] font-black uppercase tracking-wider text-chalk/30">Current league code</span>
                      <span className="font-mono text-xs font-bold tracking-wider text-league-gold/80">{league?.join_code}</span>
                    </span>
                    <Copy size={14} className="text-chalk/35" />
                  </button>
                  <div className="my-1 border-t border-league-gold/12" />
                  <Link
                    href="/leagues"
                    role="menuitem"
                    onClick={() => setLeagueMenuOpen(false)}
                    className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-turf-400 transition hover:bg-turf-400/[.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-turf-400"
                  >
                    <Plus size={16} /> Add league
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={inviteBusy}
                    onClick={() => void createInviteLink()}
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-chalk/65 transition hover:bg-league-gold/[.06] hover:text-chalk focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold disabled:opacity-50"
                  >
                    <Link2 size={16} /> {inviteBusy ? "Creating link..." : "Invite a friend"}
                  </button>
                  {isPlatformAdmin ? (
                    <Link
                      href="/platform-admin"
                      role="menuitem"
                      onClick={() => setLeagueMenuOpen(false)}
                      className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-chalk/45 transition hover:bg-chalk/[.04] hover:text-chalk"
                    >
                      <Shield size={15} /> Platform controls
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            {league ? links.map(link => {
              const Icon = link.icon;
              const active =
                relativePath === link.href
                || (link.href === "/games" && relativePath.startsWith("/games/"))
                || (link.href === "/fantasy" && (relativePath.startsWith("/fantasy/") || relativePath.startsWith("/betting")))
                || (link.href === "/profile" && relativePath.startsWith("/settings"));
              return (
                <Link
                  key={link.href}
                  href={leaguePath(link.href)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-chalk/55 transition hover:bg-league-gold/[.05] hover:text-chalk",
                    active && "bg-league-gold/[.08] text-league-gold ring-1 ring-league-gold/20"
                  )}
                >
                  <Icon size={16} /> {link.label}
                </Link>
              );
            }) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {league ? (
              <>
                <Link
                  href={leaguePath("/players")}
                  aria-current={relativePath.startsWith("/players") ? "page" : undefined}
                  className={cn(
                    "inline-flex h-10 items-center gap-1.5 rounded-xl border px-2 text-[11px] font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:h-11 sm:px-3 sm:text-sm",
                    relativePath.startsWith("/players")
                      ? "border-league-gold/35 bg-league-gold/[.09] text-league-gold"
                      : "border-league-gold/15 bg-ink-850 text-chalk/55 hover:border-league-gold/30 hover:text-chalk"
                  )}
                >
                  <Users size={16} />
                  <span className="hidden min-[390px]:inline">Players</span>
                </Link>
                {league.betting_enabled ? (
                  <Link
                    href={leaguePath("/betting")}
                    aria-label={balanceUnits == null ? "Betting coin balance loading" : `${balanceUnits / 100} betting coins`}
                    className="flex h-10 items-center gap-1.5 rounded-xl border border-league-gold/15 bg-ink-850 px-2 transition hover:border-league-gold/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:h-11 sm:gap-2 sm:px-2.5"
                  >
                    {balanceUnits == null
                      ? <><LeagueCoin size={19} /><span className="font-mono text-xs text-chalk/50">—</span></>
                      : <CoinAmount units={balanceUnits} iconSize={19} className="text-xs font-bold sm:text-base" />}
                  </Link>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "mx-auto max-w-6xl px-4 pb-24 outline-none",
          relativePath === "/" ? "py-4 md:py-6" : "py-8"
        )}
      >
        {error ? (
          <div role="alert" className="rounded-2xl border border-red-400/25 bg-red-400/[.07] p-4 text-sm text-red-200">
            {error}
          </div>
        ) : pageContent}
      </main>

      {league && isLeaguePage ? (
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-league-gold/30 bg-ink-900/95 px-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
            {links.map(link => {
              const Icon = link.icon;
              const active =
                relativePath === link.href
                || (link.href === "/games" && relativePath.startsWith("/games/"))
                || (link.href === "/fantasy" && (relativePath.startsWith("/fantasy/") || relativePath.startsWith("/betting")));
              return (
                <Link
                  key={link.href}
                  href={leaguePath(link.href)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 flex-col items-center gap-1 rounded-xl py-2 text-[11px] text-chalk/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold",
                    active && "bg-league-gold/[.08] text-league-gold"
                  )}
                >
                  <Icon size={18} /> {link.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
      <Toast
        message={toast?.message || null}
        tone={toast?.tone}
        onDone={() => setToast(null)}
      />
    </div>
  );
}

function StartupFailure({
  problem,
  onRetry
}: {
  problem: LoadProblem;
  onRetry: () => void | Promise<void>;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-ink-900 bg-turfMuted px-4 text-chalk">
      <div className="w-full max-w-lg">
        <ErrorState title={problem.title} message={problem.message} onRetry={onRetry} />
      </div>
    </main>
  );
}
