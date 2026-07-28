import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { ThemeProvider } from "@/components/ThemeProvider";
import { VercelObservability } from "@/components/VercelObservability";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const themeBootScript = `
(function () {
  try {
    var preference = localStorage.getItem("${THEME_STORAGE_KEY}");
    if (preference !== "light" && preference !== "dark" && preference !== "system") preference = "system";
    var resolved = preference === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = resolved;
    var themeMeta = document.createElement("meta");
    themeMeta.name = "theme-color";
    themeMeta.dataset.userTheme = "true";
    themeMeta.content = resolved === "light" ? "#f6f2e8" : "#11110f";
    document.head.appendChild(themeMeta);
  } catch (_) {
    document.documentElement.dataset.theme = "dark";
  }
})();
`;

function metadataUrl() {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: metadataUrl(),
  title: {
    default: "Thursday League",
    template: "%s · Thursday League"
  },
  applicationName: "Thursday League",
  description: "Your weekly five-a-side league in one place: lineups, Fantasy, virtual betting, results, player stats, and match history.",
  keywords: ["five-a-side", "football league", "fantasy football", "match tracker"],
  category: "sports",
  creator: "Thursday League",
  openGraph: {
    type: "website",
    title: "Thursday League",
    description: "Lineups, Fantasy, virtual betting, results, and league history built around your weekly five-a-side game.",
    siteName: "Thursday League",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Thursday League" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Thursday League",
    description: "Your weekly five-a-side league in one place.",
    images: ["/opengraph-image"]
  },
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false }
  },
  icons: {
    icon: [
      { url: "/icons/icon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" }
    ],
    shortcut: "/icons/icon-32.png",
    apple: [{ url: "/icons/apple-touch-icon.png", type: "image/png", sizes: "180x180" }]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Thursday League"
  }
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f2e8" },
    { media: "(prefers-color-scheme: dark)", color: "#11110f" }
  ]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <ServiceWorkerRegistration />
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
        <VercelObservability />
      </body>
    </html>
  );
}
