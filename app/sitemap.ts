import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://thursday-league.vercel.app").replace(/\/$/, "");
  const lastModified = new Date("2026-07-31T00:00:00.000Z");
  return ["/privacy", "/terms", "/support", "/delete-account"].map(path => ({
    url: `${baseUrl}${path}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority: path === "/support" ? 0.7 : 0.5
  }));
}

