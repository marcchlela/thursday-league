"use client";

import { useEffect, useId, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section {...props} className={cn("panel rounded-3xl border border-white/10 p-5 shadow-glow", className)}>{children}</section>;
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

export function LoadingState({ label = "Loading...", cards = 3 }: { label?: string; cards?: number }) {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label={label}>
      <div className="h-11 w-52 animate-pulse rounded-2xl bg-white/10" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => <div key={index} className="h-44 animate-pulse rounded-3xl border border-white/10 bg-white/[0.04]" />)}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void | Promise<void> }) {
  return (
    <div className="rounded-3xl border border-red-400/30 bg-red-400/10 p-5 text-red-100" role="alert">
      <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 shrink-0" size={20} /><div><h2 className="font-bold">Something went wrong</h2><p className="mt-1 text-sm text-red-100/75">{message}</p></div></div>
      {onRetry ? <SecondaryButton type="button" onClick={onRetry} className="mt-4">Try again</SecondaryButton> : null}
    </div>
  );
}

export function TabList({ idPrefix, label, tabs, active, onChange }: { idPrefix: string; label: string; tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.03] p-1" role="tablist" aria-label={label}>
      {tabs.map(tab => <button key={tab.id} id={`${idPrefix}-${tab.id}-tab`} type="button" role="tab" aria-selected={active === tab.id} aria-controls={`${idPrefix}-${tab.id}-panel`} tabIndex={active === tab.id ? 0 : -1} onClick={() => onChange(tab.id)} className={cn("min-w-28 flex-1 rounded-2xl px-4 py-3 font-bold transition", active === tab.id ? "bg-perimeter-400/20 text-chalk ring-1 ring-perimeter-400/30" : "text-chalk/55 hover:text-chalk")}>{tab.label}</button>)}
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

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea {...rest} className={cn("w-full resize-y rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-chalk outline-none ring-perimeter-400 transition placeholder:text-chalk/35 focus:border-perimeter-400 focus:ring-2", className)} />;
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
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [onClose, open]);

  if (!open) return null;
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded-3xl border border-white/10 bg-ink-900 p-5 shadow-glow"><span id={titleId} className="sr-only">{title}</span>{children}</div></div>;
}
