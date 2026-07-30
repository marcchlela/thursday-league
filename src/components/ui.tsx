"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { describeLoadProblem } from "@/lib/loadProblems";
import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section {...props} className={cn("rounded-[1.3rem] border border-league-gold/25 bg-ink-850 p-5 shadow-[0_9px_24px_rgba(0,0,0,.13)]", className)}>{children}</section>;
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border border-league-gold/20 bg-league-gold/[.055] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-chalk/75", className)}>{children}</span>;
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-league-gold/15 bg-black/20 p-3">
      <div className="font-mono text-2xl text-chalk">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-chalk/55">{label}</div>
    </div>
  );
}

export function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className="rounded-[1.3rem] border border-dashed border-league-gold/20 bg-ink-850 p-8 text-center">
      <h3 className="font-display text-2xl uppercase tracking-wide text-chalk">{title}</h3>
      {text ? <p className="mx-auto mt-2 max-w-md text-sm text-chalk/60">{text}</p> : null}
    </div>
  );
}

export function LoadingState({ label = "Loading...", cards = 3 }: { label?: string; cards?: number }) {
  const [slow, setSlow] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const updateConnection = () => setOffline(!navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    const timeout = window.setTimeout(() => setSlow(true), 8_000);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label={label}>
      {offline ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-400/[.07] p-4 text-sm text-red-100">
          <strong className="block">You are offline</strong>
          <span className="mt-1 block text-red-100/70">Reconnect to Wi-Fi or mobile data. Loading will continue automatically.</span>
        </div>
      ) : slow ? (
        <div className="rounded-2xl border border-league-gold/25 bg-league-gold/[.06] p-4 text-sm text-chalk/75">
          <strong className="block text-league-gold">This is taking longer than expected</strong>
          <span className="mt-1 block text-chalk/55">The connection may be slow or the server may be busy. You can keep waiting or refresh the page.</span>
        </div>
      ) : null}
      <div className="skeleton-shimmer h-11 w-52 rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => <div key={index} className="skeleton-shimmer h-44 rounded-[1.3rem] border border-league-gold/15" />)}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorState({ message, title, onRetry }: { message: string; title?: string; onRetry?: () => void | Promise<void> }) {
  const problem = describeLoadProblem(message, message);
  return (
    <div className="rounded-3xl border border-red-400/30 bg-red-400/10 p-5 text-red-100" role="alert">
      <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 shrink-0" size={20} /><div><h2 className="font-bold">{title || problem.title}</h2><p className="mt-1 text-sm text-red-100/75">{problem.kind === "unknown" ? message : problem.message}</p></div></div>
      {onRetry ? <SecondaryButton type="button" onClick={onRetry} className="mt-4">Try again</SecondaryButton> : null}
    </div>
  );
}

export function TabList({ idPrefix, label, tabs, active, onChange }: { idPrefix: string; label: string; tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let target = index;
    if (event.key === "ArrowRight") target = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") target = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = tabs.length - 1;
    else return;
    event.preventDefault();
    const next = tabs[target];
    onChange(next.id);
    window.setTimeout(() => document.getElementById(`${idPrefix}-${next.id}-tab`)?.focus(), 0);
  }

  return (
    <div className="flex overflow-x-auto rounded-[1.15rem] border border-league-gold/25 bg-ink-850 p-1 shadow-[0_7px_20px_rgba(0,0,0,.13)]" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => <button key={tab.id} id={`${idPrefix}-${tab.id}-tab`} type="button" role="tab" aria-selected={active === tab.id} aria-controls={`${idPrefix}-${tab.id}-panel`} tabIndex={active === tab.id ? 0 : -1} onClick={() => onChange(tab.id)} onKeyDown={event => onKeyDown(event, index)} className={cn("relative min-h-11 min-w-28 flex-1 rounded-[.85rem] px-3 py-3 text-sm font-extrabold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold", active === tab.id ? "bg-league-gold/[.09] text-league-gold after:absolute after:inset-x-6 after:bottom-1 after:h-0.5 after:rounded-full after:bg-league-gold" : "text-chalk/60 hover:bg-chalk/[.035] hover:text-chalk")}>{tab.label}</button>)}
    </div>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return (
    <button
      {...rest}
      className={cn(
        "min-h-11 rounded-2xl bg-league-gold px-4 py-2 font-bold text-gold-ink transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    />
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return (
    <button
      {...rest}
      className={cn(
        "min-h-11 rounded-2xl border border-league-gold/20 bg-black/15 px-4 py-2 font-semibold text-chalk transition hover:border-league-gold/40 hover:bg-league-gold/[.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    />
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input {...rest} className={cn("w-full rounded-2xl border border-league-gold/15 bg-black/20 px-4 py-3 text-chalk outline-none ring-league-gold transition placeholder:text-chalk/30 focus:border-league-gold focus:ring-2", className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea {...rest} className={cn("w-full resize-y rounded-2xl border border-league-gold/15 bg-black/20 px-4 py-3 text-chalk outline-none ring-league-gold transition placeholder:text-chalk/30 focus:border-league-gold focus:ring-2", className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return <select {...rest} className={cn("w-full rounded-2xl border border-league-gold/15 bg-ink-850 px-4 py-3 text-chalk outline-none ring-league-gold transition focus:border-league-gold focus:ring-2", className)}>{children}</select>;
}

export type ToastTone = "success" | "error" | "warning" | "info";

export function Toast({
  message,
  onDone,
  actionLabel,
  onAction,
  duration = 3200,
  tone = "info"
}: {
  message: string | null;
  onDone: () => void;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
  tone?: ToastTone;
}) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => onDoneRef.current(), duration);
    return () => window.clearTimeout(timeout);
  }, [duration, message]);

  if (!message) return null;

  const styles = {
    success: {
      icon: CheckCircle2,
      label: "Success",
      border: "border-turf-400/35",
      iconBox: "border-turf-400/25 bg-turf-400/10 text-turf-400",
      progress: "bg-turf-400"
    },
    error: {
      icon: AlertCircle,
      label: "Error",
      border: "border-red-400/35",
      iconBox: "border-red-400/25 bg-red-400/10 text-red-300",
      progress: "bg-red-400"
    },
    warning: {
      icon: AlertTriangle,
      label: "Warning",
      border: "border-league-gold/40",
      iconBox: "border-league-gold/25 bg-league-gold/[.08] text-league-gold",
      progress: "bg-league-gold"
    },
    info: {
      icon: Info,
      label: "Notice",
      border: "border-chalk/15",
      iconBox: "border-chalk/10 bg-chalk/[.04] text-chalk/65",
      progress: "bg-chalk/40"
    }
  }[tone];
  const Icon = styles.icon;

  return (
    <div
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      className={cn(
        "fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[80] w-[min(calc(100vw-2rem),31rem)] -translate-x-1/2 overflow-hidden rounded-[1.1rem] border bg-ink-850/95 shadow-[0_18px_48px_rgba(0,0,0,.34)] backdrop-blur-xl md:bottom-6",
        styles.border
      )}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border", styles.iconBox)}>
          <Icon size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-[10px] font-black uppercase tracking-[.16em] text-chalk/35">{styles.label}</span>
          <span className="mt-0.5 block text-sm font-semibold leading-snug text-chalk">{message}</span>
          {actionLabel && onAction ? <button type="button" onClick={onAction} className="mt-2 rounded-lg border border-league-gold/25 bg-league-gold/[.08] px-2.5 py-1.5 text-xs font-bold text-league-gold transition hover:bg-league-gold/[.14]">{actionLabel}</button> : null}
        </div>
        <button type="button" onClick={onDone} aria-label="Dismiss notification" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-chalk/55 transition hover:bg-chalk/[.05] hover:text-chalk focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold">
          <X size={15} />
        </button>
      </div>
      <div key={`${tone}-${message}`} className={cn("h-0.5 origin-left motion-reduce:hidden", styles.progress)} style={{ animation: `toast-progress ${duration}ms linear forwards` }} />
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  confirmTone = "destructive",
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: "destructive" | "primary";
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
        <h2 className="font-display text-3xl uppercase text-chalk">{title}</h2>
        {text ? <p className="mt-2 text-sm text-chalk/65">{text}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SecondaryButton type="button" onClick={onCancel}>{cancelLabel}</SecondaryButton>
          {confirmTone === "primary" ? <PrimaryButton type="button" onClick={onConfirm}>{confirmLabel}</PrimaryButton> : (
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-2 font-semibold text-red-200 transition hover:bg-red-400/20"
            >
              {confirmLabel}
            </button>
          )}
        </div>
    </Modal>
  );
}

export function PromptDialog({ open, title, text, value, placeholder, confirmLabel = "Continue", onChange, onConfirm, onCancel }: { open: boolean; title: string; text?: string; value: string; placeholder?: string; confirmLabel?: string; onChange: (value: string) => void; onConfirm: () => void | Promise<void>; onCancel: () => void }) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <h2 className="font-display text-3xl uppercase text-chalk">{title}</h2>
      {text ? <p className="mt-2 text-sm text-chalk/65">{text}</p> : null}
      <TextInput autoFocus value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="mt-4" />
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><SecondaryButton type="button" onClick={onCancel}>Cancel</SecondaryButton><PrimaryButton type="button" onClick={onConfirm} disabled={!value.trim()}>{confirmLabel}</PrimaryButton></div>
    </Modal>
  );
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') || []);
    window.setTimeout(() => focusable()[0]?.focus(), 0);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/75 px-4 backdrop-blur-[2px]" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded-[1.35rem] border border-league-gold/25 bg-ink-850 p-5 shadow-[0_18px_55px_rgba(0,0,0,.55)]"><span id={titleId} className="sr-only">{title}</span>{children}</div></div>;
}
