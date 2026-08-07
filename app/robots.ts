import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/privacy", "/terms", "/support", "/delete-account"],
      disallow: "/"
    },
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL || "https://thursday-league.vercel.app"}/sitemap.xml`
  };
}
