"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("panel rounded-3xl border border-white/10 p-5 shadow-glow", className)}>{children}</section>;
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-chalk/80", className)}>{children}</span>;
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="font-mono text-2xl text-chalk">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-chalk/55">{label}</div>
    </div>
  );
}

export function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
      <h3 className="font-display text-2xl uppercase tracking-wide text-chalk">{title}</h3>
      {text ? <p className="mx-auto mt-2 max-w-md text-sm text-chalk/60">{text}</p> : null}
    </div>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return (
    <button
      {...rest}
      className={cn(
        "rounded-2xl bg-floodlight px-4 py-2 font-bold text-ink-900 shadow-amber transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50",
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
        "rounded-2xl border border-white/10 bg-white/5 px-4 py-2 font-semibold text-chalk transition hover:border-perimeter-400/60 hover:bg-perimeter-400/10 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    />
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input {...rest} className={cn("w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-chalk outline-none ring-perimeter-400 transition placeholder:text-chalk/35 focus:border-perimeter-400 focus:ring-2", className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return <select {...rest} className={cn("w-full rounded-2xl border border-white/10 bg-ink-900 px-4 py-3 text-chalk outline-none ring-perimeter-400 transition focus:border-perimeter-400 focus:ring-2", className)}>{children}</select>;
}

export function Toast({
  message,
  onDone,
  duration = 3200
}: {
  message: string | null;
  onDone: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(onDone, duration);
    return () => window.clearTimeout(timeout);
  }, [duration, message, onDone]);

  if (!message) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-50 w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-perimeter-400/40 bg-ink-900/95 shadow-glow backdrop-blur">
      <div className="px-4 py-3 text-sm font-semibold text-chalk">{message}</div>
      <div className="h-1 origin-left bg-floodlight" style={{ animation: `toast-progress ${duration}ms linear forwards` }} />
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-ink-900 p-5 shadow-glow">
        <h2 className="font-display text-3xl uppercase text-chalk">{title}</h2>
        {text ? <p className="mt-2 text-sm text-chalk/65">{text}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SecondaryButton type="button" onClick={onCancel}>{cancelLabel}</SecondaryButton>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-2 font-semibold text-red-200 transition hover:bg-red-400/20"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
