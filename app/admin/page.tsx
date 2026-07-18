"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useLeagueData } from "@/hooks/useLeagueData";
import { ErrorState, LoadingState } from "@/components/ui";
import { AdminPanel } from "@/components/AdminPanel";

export default function AdminPage() {
  const router = useRouter();
  const { profile, loading } = useAuthProfile();
  const isAdmin = !!profile?.is_admin;

  useEffect(() => {
    if (!loading && !isAdmin) router.replace("/");
  }, [isAdmin, loading, router]);

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
