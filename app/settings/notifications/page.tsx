"use client";

import { SettingsHeader } from "@/components/SettingsComponents";
import { NotificationSettings } from "@/components/NotificationSettings";

export default function NotificationSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <SettingsHeader title="Notifications" description="Control push access, match updates, and Fantasy deadline reminders." />
      <NotificationSettings />
    </div>
  );
}
