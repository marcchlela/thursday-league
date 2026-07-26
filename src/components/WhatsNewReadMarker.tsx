"use client";

import { useEffect } from "react";
import { useWhatsNewStatus } from "@/hooks/useWhatsNew";

export function WhatsNewReadMarker() {
  const { markLatestReleaseRead } = useWhatsNewStatus();

  useEffect(() => {
    markLatestReleaseRead();
  }, [markLatestReleaseRead]);

  return null;
}
