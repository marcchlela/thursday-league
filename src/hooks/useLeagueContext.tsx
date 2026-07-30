"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { friendlyActionError } from "@/lib/actionErrors";
import { describeLoadProblem, LoadProblem, withLoadTimeout } from "@/lib/loadProblems";
import { supabase } from "@/lib/supabase";
import type { League, LeagueMembership } from "@/lib/types";

type LeagueContextValue = {
  memberships: LeagueMembership[];
  leagues: League[];
  league: League | null;
  membership: LeagueMembership | null;
  loading: boolean;
  error: LoadProblem | null;
  isLeagueAdmin: boolean;
  isLeagueOwner: boolean;
  isPlatformAdmin: boolean;
  leaguePath: (path?: string) => string;
  switchLeague: (leagueId: string) => Promise<void>;
  reloadLeagues: () => Promise<void>;
};

const LeagueContext = createContext<LeagueContextValue | null>(null);

const globalPaths = [
  "/login",
  "/forgot-password",
  "/leagues",
  "/invite",
  "/settings",
  "/platform-admin"
];

function routeLeagueSlug(pathname: string) {
  const match = pathname.match(/^\/l\/([^/]+)(?:\/|$)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function leagueRelativePath(pathname: string) {
  const match = pathname.match(/^\/l\/[^/]+(\/.*)?$/);
  return match ? match[1] || "/" : pathname;
}

function isGlobalPath(pathname: string) {
  return globalPaths.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

export function LeagueContextProvider({
  userId,
  preferredLeagueId,
  children
}: {
  userId: string;
  preferredLeagueId?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [memberships, setMemberships] = useState<LeagueMembership[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadProblem | null>(null);

  const load = useCallback(async () => {
    setError(null);
    let membershipResult;
    let roleResult;
    try {
      [membershipResult, roleResult] = await withLoadTimeout(Promise.all([
        supabase
          .from("league_memberships")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("joined_at", { ascending: true }),
        supabase
          .from("app_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "platform_admin")
          .maybeSingle()
      ]));
    } catch (loadError) {
      setError(describeLoadProblem(loadError, "Your leagues could not be loaded. Try again."));
      setLoading(false);
      return;
    }

    if (membershipResult.error) {
      setError(describeLoadProblem(
        membershipResult.error,
        friendlyActionError(
          membershipResult.error,
          "Your leagues could not be loaded. Check your connection and try again."
        )
      ));
      setLoading(false);
      return;
    }

    const membershipRows = (membershipResult.data || []) as LeagueMembership[];
    const leagueIds = membershipRows.map(item => item.league_id);
    let leagueResult: { data: unknown[] | null; error: { message: string } | null };
    try {
      leagueResult = leagueIds.length
        ? await withLoadTimeout(Promise.resolve(
            supabase
              .from("leagues")
              .select("*")
              .in("id", leagueIds)
              .eq("status", "active")
              .order("name")
          ))
        : { data: [], error: null };
    } catch (loadError) {
      setError(describeLoadProblem(loadError, "Your leagues could not be loaded. Try again."));
      setLoading(false);
      return;
    }

    if (leagueResult.error) {
      setError(describeLoadProblem(
        leagueResult.error,
        friendlyActionError(
          leagueResult.error,
          "Your leagues could not be loaded. Check your connection and try again."
        )
      ));
      setLoading(false);
      return;
    }

    setMemberships(membershipRows);
    setLeagues((leagueResult.data || []) as League[]);
    setIsPlatformAdmin(!roleResult.error && !!roleResult.data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const requestedSlug = routeLeagueSlug(pathname);
  const preferredLeague =
    leagues.find(item => item.slug === requestedSlug)
    || leagues.find(item => item.id === preferredLeagueId)
    || leagues[0]
    || null;
  const membership =
    memberships.find(item => item.league_id === preferredLeague?.id)
    || null;

  useEffect(() => {
    if (loading || error) return;

    if (requestedSlug && !leagues.some(item => item.slug === requestedSlug)) {
      router.replace("/leagues?notice=unavailable");
      return;
    }
    if (!leagues.length && !isGlobalPath(pathname)) {
      router.replace("/leagues");
      return;
    }
    if (
      leagues.length
      && !requestedSlug
      && !isGlobalPath(pathname)
      && preferredLeague
    ) {
      const destination = pathname === "/"
        ? `/l/${preferredLeague.slug}`
        : `/l/${preferredLeague.slug}${pathname}`;
      router.replace(queryString ? `${destination}?${queryString}` : destination);
    }
  }, [
    error,
    leagues,
    loading,
    pathname,
    preferredLeague,
    queryString,
    requestedSlug,
    router
  ]);

  useEffect(() => {
    if (!preferredLeague || preferredLeague.id === preferredLeagueId) return;
    void supabase.rpc("set_active_league", {
      target_league_id: preferredLeague.id
    });
  }, [preferredLeague, preferredLeagueId]);

  const leaguePath = useCallback((path = "/") => {
    if (!preferredLeague) return path;
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return normalized === "/"
      ? `/l/${preferredLeague.slug}`
      : `/l/${preferredLeague.slug}${normalized}`;
  }, [preferredLeague]);

  const switchLeague = useCallback(async (leagueId: string) => {
    const target = leagues.find(item => item.id === leagueId);
    if (!target) throw new Error("League not found.");
    if (target.id === preferredLeague?.id) return;

    const { error: switchError } = await supabase.rpc("set_active_league", {
      target_league_id: target.id
    });
    if (switchError) throw switchError;

    const relativePath = requestedSlug ? leagueRelativePath(pathname) : "/";
    const destination = relativePath === "/"
        ? `/l/${target.slug}`
        : `/l/${target.slug}${relativePath}`;
    router.push(queryString ? `${destination}?${queryString}` : destination);
  }, [leagues, pathname, preferredLeague?.id, queryString, requestedSlug, router]);

  const value = useMemo<LeagueContextValue>(() => ({
    memberships,
    leagues,
    league: preferredLeague,
    membership,
    loading,
    error,
    isLeagueAdmin: membership?.role === "owner" || membership?.role === "admin",
    isLeagueOwner: membership?.role === "owner",
    isPlatformAdmin,
    leaguePath,
    switchLeague,
    reloadLeagues: load
  }), [
    memberships,
    leagues,
    preferredLeague,
    membership,
    loading,
    error,
    isPlatformAdmin,
    leaguePath,
    switchLeague,
    load
  ]);

  return (
    <LeagueContext.Provider value={value}>
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeagueContext() {
  const value = useContext(LeagueContext);
  if (!value) {
    throw new Error("useLeagueContext must be used inside LeagueContextProvider.");
  }
  return value;
}

export function useOptionalLeagueContext() {
  return useContext(LeagueContext);
}
