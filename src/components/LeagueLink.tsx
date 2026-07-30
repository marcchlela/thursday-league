"use client";

import NextLink, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes } from "react";
import { useOptionalLeagueContext } from "@/hooks/useLeagueContext";

const leagueRouteRoots = [
  "/games",
  "/players",
  "/fantasy",
  "/betting",
  "/profile",
  "/admin"
];

function shouldScope(href: string) {
  if (href === "/") return true;
  return leagueRouteRoots.some(root => href === root || href.startsWith(`${root}/`) || href.startsWith(`${root}?`));
}

export function LeagueLink({
  href,
  ...props
}: LinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>) {
  const leagueContext = useOptionalLeagueContext();
  const value = typeof href === "string" && shouldScope(href) && leagueContext?.league
    ? leagueContext.leaguePath(href)
    : href;
  return <NextLink href={value} {...props} />;
}

