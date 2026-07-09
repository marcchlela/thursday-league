"use client";

import { useLeagueData } from "@/hooks/useLeagueData";
import { FantasyTabs } from "@/components/FantasyTabs";

export default function FantasyPage() {
  const { data, loading, error, reload } = useLeagueData();
  if (loading) return <div>Loading fantasy...</div>;
  if (error) return <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">{error}</div>;
  return <FantasyTabs data={data} reload={reload} />;
}
