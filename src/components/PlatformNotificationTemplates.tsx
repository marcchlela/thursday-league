"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Check, Eye, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { friendlyActionError } from "@/lib/actionErrors";
import {
  AutomaticNotificationType,
  AUTOMATIC_NOTIFICATION_TYPES,
  defaultNotificationTemplate,
  NOTIFICATION_DESTINATION_LABELS,
  NOTIFICATION_TEMPLATE_BODY_MAX,
  NOTIFICATION_TEMPLATE_DEFINITIONS,
  NOTIFICATION_TEMPLATE_TITLE_MAX,
  NotificationTemplate,
  notificationTemplatePreviewValues,
  renderNotificationText
} from "@/lib/notificationTemplates";
import { pushAccessToken, pushResponseError } from "@/lib/pushClient";
import { Card, ErrorState, LoadingState, Modal, PrimaryButton, SecondaryButton, Select, TextArea, TextInput } from "./ui";

function sameTemplate(first: NotificationTemplate | null, second: NotificationTemplate | null) {
  return Boolean(first && second
    && first.notificationType === second.notificationType
    && first.enabled === second.enabled
    && first.titleTemplate === second.titleTemplate
    && first.bodyTemplate === second.bodyTemplate
    && first.destination === second.destination);
}

export function PlatformNotificationTemplates() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [selectedType, setSelectedType] = useState<AutomaticNotificationType>("new_game");
  const [draft, setDraft] = useState<NotificationTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [pendingType, setPendingType] = useState<AutomaticNotificationType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await pushAccessToken();
      const response = await fetch("/api/platform/notification-templates", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      if (!response.ok) throw new Error(await pushResponseError(response));
      const body = await response.json() as { templates?: NotificationTemplate[] };
      const loaded = body.templates || [];
      setTemplates(loaded);
      const selected = loaded.find(template => template.notificationType === "new_game")
        || loaded[0]
        || defaultNotificationTemplate("new_game");
      setSelectedType(selected.notificationType);
      setDraft({ ...selected });
    } catch (loadError) {
      setError(friendlyActionError(loadError, "Notification templates could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saved = templates.find(template => template.notificationType === selectedType) || null;
  const definition = NOTIFICATION_TEMPLATE_DEFINITIONS[selectedType];
  const changed = !sameTemplate(saved, draft);
  const preview = useMemo(() => draft
    ? renderNotificationText(draft, notificationTemplatePreviewValues(draft.notificationType))
    : { title: "Notification title", body: "Notification message" }, [draft]);

  function selectTemplate(notificationType: AutomaticNotificationType) {
    if (saving || notificationType === selectedType) return;
    if (changed) {
      setPendingType(notificationType);
      return;
    }
    switchTemplate(notificationType);
  }

  function switchTemplate(notificationType: AutomaticNotificationType) {
    const selected = templates.find(template => template.notificationType === notificationType)
      || defaultNotificationTemplate(notificationType);
    setSelectedType(notificationType);
    setDraft({ ...selected });
    setMessage(null);
    setError(null);
    setPendingType(null);
  }

  async function persist(reset = false) {
    if (!draft || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const token = await pushAccessToken();
      const response = await fetch("/api/platform/notification-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(reset ? { notificationType: draft.notificationType, reset: true } : draft)
      });
      if (!response.ok) throw new Error(await pushResponseError(response));
      const body = await response.json() as { template?: NotificationTemplate };
      if (!body.template) throw new Error("The saved notification template was not returned.");
      setTemplates(current => AUTOMATIC_NOTIFICATION_TYPES.map(notificationType => {
        if (notificationType === body.template!.notificationType) return body.template!;
        return current.find(template => template.notificationType === notificationType)
          || defaultNotificationTemplate(notificationType);
      }));
      setDraft({ ...body.template });
      setMessage(reset ? "Default notification restored." : "Notification template saved.");
      setResetOpen(false);
    } catch (saveError) {
      setError(friendlyActionError(saveError, "The notification template could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading automatic notification templates" cards={4} />;
  if (error && !draft) return <ErrorState message={error} onRetry={load} />;
  if (!draft) return <ErrorState message="No notification templates are available." />;

  return (
    <>
      <Card className="border-league-gold/25">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <ShieldCheck className="mt-1 shrink-0 text-league-gold" />
            <div>
              <h2 className="font-display text-3xl uppercase">Automatic templates</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-chalk/50">Control future automatic push messages across every league. Only the platform owner can view or change these settings.</p>
            </div>
          </div>
          <span className="rounded-full border border-turf-400/20 bg-turf-400/[.06] px-3 py-1 text-xs font-bold text-turf-400">Owner only</span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[.72fr_1.28fr]">
        <Card className="h-fit p-2">
          <div className="px-3 pb-2 pt-2 text-[10px] font-black uppercase tracking-[.16em] text-chalk/35">Notification events</div>
          <div className="space-y-1">
            {AUTOMATIC_NOTIFICATION_TYPES.map(notificationType => {
              const item = templates.find(template => template.notificationType === notificationType)
                || defaultNotificationTemplate(notificationType);
              const selected = notificationType === selectedType;
              return (
                <button
                  key={notificationType}
                  type="button"
                  onClick={() => selectTemplate(notificationType)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${selected ? "border-league-gold/35 bg-league-gold/[.08]" : "border-transparent hover:border-league-gold/15 hover:bg-league-gold/[.035]"}`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${item.enabled ? "border-turf-400/20 bg-turf-400/[.05] text-turf-400" : "border-chalk/10 bg-black/15 text-chalk/25"}`}><BellRing size={17} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-chalk">{NOTIFICATION_TEMPLATE_DEFINITIONS[notificationType].label}</span><span className="mt-0.5 block text-xs text-chalk/35">{item.enabled ? "Enabled" : "Disabled"}</span></span>
                  {selected ? <Check size={16} className="shrink-0 text-league-gold" /> : null}
                </button>
              );
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><h3 className="font-display text-3xl uppercase">{definition.label}</h3><p className="mt-1 max-w-xl text-sm leading-relaxed text-chalk/45">{definition.description}</p></div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.enabled}
                onClick={() => setDraft(current => current ? { ...current, enabled: !current.enabled } : current)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition ${draft.enabled ? "border-turf-400/25 bg-turf-400/[.07] text-turf-400" : "border-chalk/12 bg-black/15 text-chalk/40"}`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${draft.enabled ? "bg-turf-400" : "bg-chalk/25"}`} />
                {draft.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-sm font-semibold"><span>Title</span><span className="font-mono text-xs text-chalk/35">{draft.titleTemplate.length}/{NOTIFICATION_TEMPLATE_TITLE_MAX}</span></span>
                <TextInput value={draft.titleTemplate} maxLength={NOTIFICATION_TEMPLATE_TITLE_MAX} onChange={event => setDraft(current => current ? { ...current, titleTemplate: event.target.value } : current)} />
              </label>
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-sm font-semibold"><span>Message</span><span className="font-mono text-xs text-chalk/35">{draft.bodyTemplate.length}/{NOTIFICATION_TEMPLATE_BODY_MAX}</span></span>
                <TextArea rows={4} value={draft.bodyTemplate} maxLength={NOTIFICATION_TEMPLATE_BODY_MAX} onChange={event => setDraft(current => current ? { ...current, bodyTemplate: event.target.value } : current)} />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Opens in</span>
                <Select value={draft.destination} onChange={event => setDraft(current => current ? { ...current, destination: event.target.value as NotificationTemplate["destination"] } : current)}>
                  {definition.allowedDestinations.map(destination => <option key={destination} value={destination}>{NOTIFICATION_DESTINATION_LABELS[destination]}</option>)}
                </Select>
              </label>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-chalk/40">Available details</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {definition.variables.map(variable => <code key={variable.key} title={variable.label} className="rounded-lg border border-league-gold/18 bg-league-gold/[.045] px-2.5 py-1.5 text-xs text-league-gold">{`{${variable.key}}`}</code>)}
                </div>
                <p className="mt-2 text-xs text-chalk/35">Use only these placeholders. They are safely replaced with the relevant league details when the notification is sent.</p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 text-sm font-semibold text-chalk/65"><Eye size={16} /> Preview with example details</div>
            <div className={`mt-3 rounded-[1.35rem] border bg-ink-900/95 p-4 shadow-[0_12px_30px_rgba(0,0,0,.2)] ${draft.enabled ? "border-league-gold/25" : "border-chalk/10 opacity-55"}`}>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-chalk/40"><Image src="/icons/icon-192.png" alt="" width={28} height={28} className="rounded-lg" /> Thursday League <span className="ml-auto normal-case tracking-normal">now</span></div>
              <div className="mt-4 font-semibold text-chalk">{preview.title || "Notification title"}</div>
              <div className="mt-1 min-h-10 text-sm leading-relaxed text-chalk/60">{preview.body || "Notification message"}</div>
              <div className="mt-4 border-t border-league-gold/15 pt-3 text-xs text-league-gold">Opens {NOTIFICATION_DESTINATION_LABELS[draft.destination]}</div>
            </div>
            {!draft.enabled ? <p className="mt-3 text-xs text-chalk/40">This event will not send while disabled.</p> : null}
          </Card>

          {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/[.05] px-4 py-3 text-sm text-red-200">{error}</p> : null}
          {message ? <p role="status" className="rounded-xl border border-turf-400/20 bg-turf-400/[.06] px-4 py-3 text-sm text-chalk">{message}</p> : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <SecondaryButton type="button" disabled={saving} onClick={() => setResetOpen(true)} className="inline-flex items-center justify-center gap-2"><RotateCcw size={16} /> Restore default</SecondaryButton>
            <div className="flex flex-col gap-2 sm:flex-row">
              {changed ? <SecondaryButton type="button" disabled={saving} onClick={() => setDraft(saved ? { ...saved } : defaultNotificationTemplate(selectedType))}>Discard changes</SecondaryButton> : null}
              <PrimaryButton type="button" disabled={!changed || saving} onClick={() => void persist()} className="inline-flex items-center justify-center gap-2"><Save size={16} />{saving ? "Saving..." : "Save template"}</PrimaryButton>
            </div>
          </div>
          {draft.updatedAt ? <p className="text-right text-xs text-chalk/30">Last saved {new Date(draft.updatedAt).toLocaleString()}</p> : null}
        </div>
      </div>

      <Modal open={resetOpen} title="Restore notification default" onClose={() => { if (!saving) setResetOpen(false); }}>
        <h2 className="font-display text-3xl uppercase">Restore {definition.label}?</h2>
        <p className="mt-2 text-sm leading-relaxed text-chalk/55">This replaces the title, message, destination, and enabled state with the safe default. Previously sent notifications will not change.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><SecondaryButton type="button" disabled={saving} onClick={() => setResetOpen(false)}>Cancel</SecondaryButton><PrimaryButton type="button" disabled={saving} onClick={() => void persist(true)} className="inline-flex items-center justify-center gap-2"><RotateCcw size={16} />{saving ? "Restoring..." : "Restore default"}</PrimaryButton></div>
      </Modal>

      <Modal open={Boolean(pendingType)} title="Unsaved notification changes" onClose={() => setPendingType(null)}>
        <h2 className="font-display text-3xl uppercase">Discard these changes?</h2>
        <p className="mt-2 text-sm leading-relaxed text-chalk/55">The current title, message, destination, or enabled state has not been saved.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><SecondaryButton type="button" onClick={() => setPendingType(null)}>Keep editing</SecondaryButton><PrimaryButton type="button" onClick={() => { if (pendingType) switchTemplate(pendingType); }}>Discard and switch</PrimaryButton></div>
      </Modal>
    </>
  );
}
