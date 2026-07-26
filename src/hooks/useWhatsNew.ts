"use client";

import { useCallback, useEffect, useState } from "react";
import { latestRelease } from "@/content/whatsNew";

const WHATS_NEW_STORAGE_KEY = "thursday-league:whats-new:last-seen";

export function useWhatsNewStatus() {
  const [hasUnreadRelease, setHasUnreadRelease] = useState(false);

  useEffect(() => {
    setHasUnreadRelease(window.localStorage.getItem(WHATS_NEW_STORAGE_KEY) !== latestRelease.version);
  }, []);

  const markLatestReleaseRead = useCallback(() => {
    window.localStorage.setItem(WHATS_NEW_STORAGE_KEY, latestRelease.version);
    setHasUnreadRelease(false);
  }, []);

  return { hasUnreadRelease, markLatestReleaseRead };
}
