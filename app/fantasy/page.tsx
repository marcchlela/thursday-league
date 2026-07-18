"use client";

import { useLeagueData } from "@/hooks/useLeagueData";
import { ErrorState, LoadingState } from "@/components/ui";
import { FantasyTabs } from "@/components/FantasyTabs";

export default function FantasyPage() {
  const { data, loading, error, reload } = useLeagueData();
  if (loading) return <LoadingState label="Loading fantasy" cards={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return <FantasyTabs data={data} reload={reload} />;
}
