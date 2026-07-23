import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegistration} from "@/components/ServiceWorkerRegistration";

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
    statusBarStyle: "black-translucent",
    title: "Thursday League"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
