"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppWindow, BellRing, CheckCircle2, ChevronLeft, ChevronRight, Download, Share, ShieldCheck, Smartphone } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import {
  enablePushNotifications,
  consumeNotificationInstallHandoff,
  markNotificationInstallHandoff,
  OPEN_NOTIFICATION_ONBOARDING_EVENT,
  PUSH_STATE_EVENT,
  PushDeviceState,
  readNotificationOnboardingStatus,
  readPushDeviceState,
  saveNotificationOnboardingStatus
} from "@/lib/pushClient";
import { Modal, Pill, PrimaryButton, SecondaryButton } from "./ui";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const emptyDeviceState: PushDeviceState = {
  supported: false,
  installed: false,
  isIOS: false,
  permission: "unsupported",
  enabled: false
};

export function NotificationOnboarding() {
  const { user } = useAuthProfile();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [device, setDevice] = useState<PushDeviceState>(emptyDeviceState);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const refreshDevice = useCallback(async () => {
    const next = await readPushDeviceState();
    setDevice(next);
    if (next.enabled && user) {
      if (readNotificationOnboardingStatus(user.id) !== "completed") {
        saveNotificationOnboardingStatus(user.id, "completed");
      }
      setOpen(false);
    }
    return next;
  }, [user]);

  useEffect(() => {
    function captureInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }
    function installed() {
      setDevice(current => ({ ...current, installed: true }));
      setInstallPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let timeout: number | undefined;

    async function initialize() {
      const next = await refreshDevice();
      if (cancelled || next.enabled) return;

      const hasInstallHandoff = next.installed
        ? await consumeNotificationInstallHandoff(user!.id)
        : false;
      if (cancelled) return;

      const url = new URL(window.location.href);
      const explicitlyRequested = url.searchParams.get("notificationSetup") === "1";
      const requestedStep = Number(url.searchParams.get("notificationStep"));
      if (explicitlyRequested) {
        url.searchParams.delete("notificationSetup");
        url.searchParams.delete("notificationStep");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }

      const status = readNotificationOnboardingStatus(user!.id);
      if (explicitlyRequested || hasInstallHandoff || status === null) {
        timeout = window.setTimeout(() => {
          setStep(hasInstallHandoff ? 2 : explicitlyRequested && (requestedStep === 1 || requestedStep === 2) ? requestedStep : explicitlyRequested ? 1 : 0);
          setMessage(null);
          setOpen(true);
        }, explicitlyRequested ? 0 : 650);
      }
    }

    function openOnboarding(event: Event) {
      const requestedStep = (event as CustomEvent<{ step?: number }>).detail?.step;
      setStep(requestedStep === 2 ? 2 : 1);
      setMessage(null);
      setOpen(true);
      void refreshDevice();
    }

    void initialize();
    window.addEventListener(OPEN_NOTIFICATION_ONBOARDING_EVENT, openOnboarding);
    window.addEventListener(PUSH_STATE_EVENT, refreshDevice);
    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
      window.removeEventListener(OPEN_NOTIFICATION_ONBOARDING_EVENT, openOnboarding);
      window.removeEventListener(PUSH_STATE_EVENT, refreshDevice);
    };
  }, [refreshDevice, user]);

  useEffect(() => {
    if (!user || !open || step !== 1 || !device.isIOS || device.installed) return;
    void markNotificationInstallHandoff(user.id).catch(() => {
      setMessage("We could not prepare the installed-app handoff. You can still continue setup after signing in there.");
    });
  }, [device.installed, device.isIOS, open, step, user]);

  function dismiss() {
    if (user) saveNotificationOnboardingStatus(user.id, "dismissed");
    setOpen(false);
  }

  function next() {
    setMessage(null);
    setStep(current => Math.min(current + 1, 2));
  }

  function previous() {
    setMessage(null);
    setStep(current => Math.max(current - 1, 0));
  }

  async function install() {
    if (!installPrompt) return;
    setBusy(true);
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setMessage(choice.outcome === "accepted" ? "App installation started." : "You can install it later from your browser menu.");
    setBusy(false);
  }

  async function allowNotifications() {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      await enablePushNotifications();
      saveNotificationOnboardingStatus(user.id, "completed");
      setDevice(await readPushDeviceState());
      setMessage("Notifications are ready on this device.");
      window.setTimeout(() => setOpen(false), 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable notifications.");
      setDevice(await readPushDeviceState());
    } finally {
      setBusy(false);
    }
  }

  function onTouchEnd(event: React.TouchEvent) {
    if (!touchStart.current) return;
    const end = event.changedTouches[0];
    const deltaX = end.clientX - touchStart.current.x;
    const deltaY = end.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX < 0 && step < 2) next();
    if (deltaX > 0 && step > 0) previous();
  }

  return (
    <Modal open={open} title="Notification setup" onClose={dismiss}>
      <div
        className="min-h-[29rem]"
        onTouchStart={event => {
          const touch = event.touches[0];
          touchStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex items-center justify-between gap-3">
          <Pill>New feature</Pill>
          <div className="flex gap-1.5" aria-label={`Step ${step + 1} of 3`}>
            {[0, 1, 2].map(index => <span key={index} className={`h-2 rounded-full transition-all ${index === step ? "w-7 bg-floodlight" : "w-2 bg-white/15"}`} />)}
          </div>
        </div>

        {step === 0 ? (
          <div className="mt-8">
            <div className="grid h-16 w-16 place-items-center rounded-3xl border border-floodlight/30 bg-floodlight/10 text-floodlight"><BellRing size={30} /></div>
            <h2 className="mt-5 font-display text-4xl uppercase">Never miss league news</h2>
            <p className="mt-3 text-chalk/65">Enable push notifications for Thursday League.</p>
            <div className="mt-6 grid gap-2">
              {["New game is scheduled", "Lineups are ready and fantasy opens", "Final score and fantasy results are ready"].map(item => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-chalk/75"><CheckCircle2 size={18} className="shrink-0 text-perimeter-400" />{item}</div>
              ))}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="mt-8">
            <div className="grid h-16 w-16 place-items-center rounded-3xl border border-perimeter-400/30 bg-perimeter-400/10 text-perimeter-400"><Smartphone size={30} /></div>
            <h2 className="mt-5 font-display text-4xl uppercase">Add it to your Home Screen</h2>
            {device.installed ? (
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-perimeter-400/30 bg-perimeter-400/10 p-4 text-perimeter-400"><CheckCircle2 /> Thursday League is already running as an installed app.</div>
            ) : device.isIOS ? (
              <div className="mt-5 space-y-3 text-sm text-chalk/70">
                <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"><Share className="shrink-0 text-perimeter-400" size={20} /><span>In your browser, press the <strong>Share</strong> button.</span></div>
                <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"><Download className="shrink-0 text-perimeter-400" size={20} /><span>Choose <strong>Add to Home Screen</strong>, then press Add.</span></div>
                <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"><AppWindow className="shrink-0 text-perimeter-400" size={20} /><span>Open the <strong>new Thursday League app</strong>, sign in and finish setup.</span></div>

                <p>iPhone only allows Web Push from the installed Home Screen app.</p>
              </div>
            ) : installPrompt ? (
              <div className="mt-5">
                <p className="text-chalk/65">Install the app for faster access and a full-screen experience.</p>
                <SecondaryButton type="button" onClick={install} disabled={busy} className="mt-4 inline-flex items-center gap-2"><Download size={17} />{busy ? "Opening..." : "Install app"}</SecondaryButton>
              </div>
            ) : (
              <p className="mt-5 text-chalk/65">Use your browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>. You can still continue on supported desktop browsers.</p>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-8">
            <div className="grid h-16 w-16 place-items-center rounded-3xl border border-perimeter-400/30 bg-perimeter-400/10 text-perimeter-400"><ShieldCheck size={30} /></div>
            <h2 className="mt-5 font-display text-4xl uppercase">Allow notifications</h2>
            <p className="mt-3 text-chalk/65">Finally, press Allow notifications.</p>
            {device.isIOS && !device.installed ? (
              <div className="mt-5 rounded-2xl border border-floodlight/30 bg-floodlight/10 p-4 text-sm text-floodlight">Add it to your Home Screen, open the installed app, and sign in once. We&apos;ll resume directly on this notification step.</div>
            ) : device.permission === "denied" ? (
              <div className="mt-5 rounded-2xl border border-floodlight/30 bg-floodlight/10 p-4 text-sm text-floodlight">Notifications are currently blocked. Open your device or browser notification settings and allow Thursday League.</div>
            ) : device.enabled ? (
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-perimeter-400/30 bg-perimeter-400/10 p-4 text-perimeter-400"><CheckCircle2 /> Notifications are enabled on this device.</div>
            ) : (
              <PrimaryButton type="button" onClick={allowNotifications} disabled={busy || !device.supported} className="mt-5 w-full py-3">{busy ? "Enabling..." : "Allow notifications"}</PrimaryButton>
            )}
          </div>
        ) : null}

        {message ? <p className="mt-4 text-sm text-chalk/65" role="status">{message}</p> : null}

        <div className="mt-7 flex items-center justify-between gap-2 border-t border-white/10 pt-4">
          <SecondaryButton type="button" onClick={dismiss}>Not now</SecondaryButton>
          <div className="flex gap-2">
            {step > 0 ? <SecondaryButton type="button" onClick={previous} aria-label="Previous step"><ChevronLeft size={18} /></SecondaryButton> : null}
            {step < 2 ? <PrimaryButton type="button" onClick={next} className="inline-flex items-center gap-2">Next <ChevronRight size={18} /></PrimaryButton> : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function NotificationNudge({ userId }: { userId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [setupStep, setSetupStep] = useState(1);

  const refresh = useCallback(async () => {
    const device = await readPushDeviceState();
    const status = readNotificationOnboardingStatus(userId);
    setVisible(!device.enabled && status === "dismissed");
    setBlocked(device.permission === "denied");
    setSetupStep(device.permission === "denied" || device.installed || (device.supported && !device.isIOS) ? 2 : 1);
  }, [userId]);

  useEffect(() => {
    void refresh();
    window.addEventListener(PUSH_STATE_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(PUSH_STATE_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  function openSetup() {
    if (pathname === "/") {
      window.dispatchEvent(new CustomEvent(OPEN_NOTIFICATION_ONBOARDING_EVENT, { detail: { step: setupStep } }));
    } else {
      router.push(`/?notificationSetup=1&notificationStep=${setupStep}`);
    }
  }

  if (!visible) return null;
  return (
    <div className="border-b border-floodlight/40 bg-floodlight px-4 py-2 text-ink-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold"><BellRing size={17} className="shrink-0" /><span className="truncate">{blocked ? "Notifications are blocked on this device." : "Get game, lineup, and result notifications."}</span></div>
        <button type="button" onClick={openSetup} className="shrink-0 rounded-xl bg-ink-900 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-chalk">{blocked ? "Review" : "Enable"}</button>
      </div>
    </div>
  );
}
