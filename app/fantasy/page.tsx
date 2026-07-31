"use client";

import { useLeagueData } from "@/hooks/useLeagueData";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { FantasyTabs } from "@/components/FantasyTabs";

export default function FantasyPage() {
  const { data, loading, error, reload } = useLeagueData();
  const { league } = useLeagueContext();
  if (loading) return <LoadingState label="Loading fantasy" cards={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!league?.fantasy_enabled) return <EmptyState title="Fantasy is turned off" text="This league is using match tracking without Fantasy." />;
  return <FantasyTabs data={data} reload={reload} />;
}
