"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { redactObservabilityUrl } from "@/lib/observability";

export function VercelObservability() {
  if (process.env.NODE_ENV !== "production") return null;

  return (
    <>
      <Analytics
        debug={false}
        beforeSend={event => {
          const url = redactObservabilityUrl(event.url);
          return url ? { ...event, url } : null;
        }}
      />
      <SpeedInsights
        debug={false}
        beforeSend={event => {
          const url = redactObservabilityUrl(event.url);
          return url ? { ...event, url } : null;
        }}
      />
    </>
  );
}
