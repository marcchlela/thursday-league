import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { ThemeProvider } from "@/components/ThemeProvider";
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

export const metadata: Metadata = {
  title: "Thursday League",
  applicationName: "Thursday League",
  description: "Weekly 5-a-side match tracker and fantasy league",
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
      </body>
    </html>
  );
}
