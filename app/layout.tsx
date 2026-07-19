import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegistration} from "@/components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "Thursday League",
  description: "Weekly 5-a-side match tracker and fantasy league"
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
