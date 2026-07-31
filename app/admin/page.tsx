"use client";

import { useEffect } from "react";
import { useLeagueData } from "@/hooks/useLeagueData";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { ErrorState, LoadingState } from "@/components/ui";
import { AdminPanel } from "@/components/AdminPanel";

export default function AdminPage() {
  const { isLeagueAdmin: isAdmin, loading, leaguePath } = useLeagueContext();

  useEffect(() => {
    if (!loading && !isAdmin) window.location.replace(leaguePath("/"));
  }, [isAdmin, leaguePath, loading]);

  if (loading) return <LoadingState label="Checking admin access" cards={1} />;
  if (!isAdmin) return null;

  return <AdminData />;
}

function AdminData() {
  const { data, loading, error, reload } = useLeagueData();

  if (loading) return <LoadingState label="Loading admin" cards={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return <AdminPanel data={data} reload={reload} />;
}
