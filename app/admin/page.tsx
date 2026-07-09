"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useLeagueData } from "@/hooks/useLeagueData";
import { AdminPanel } from "@/components/AdminPanel";

export default function AdminPage() {
  const router = useRouter();
  const { profile, loading } = useAuthProfile();
  const isAdmin = !!profile?.is_admin;

  useEffect(() => {
    if (!loading && !isAdmin) router.replace("/");
  }, [isAdmin, loading, router]);

  if (loading) return <div>Loading admin...</div>;
  if (!isAdmin) return null;

  return <AdminData />;
}

function AdminData() {
  const { data, loading, error, reload } = useLeagueData();

  if (loading) return <div>Loading admin...</div>;
  if (error) return <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">{error}</div>;

  return <AdminPanel data={data} reload={reload} />;
}
