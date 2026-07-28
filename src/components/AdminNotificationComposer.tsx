"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Eye, RefreshCw, Send, Smartphone, Users } from "lucide-react";
import {
  CUSTOM_NOTIFICATION_BODY_MAX,
  CUSTOM_NOTIFICATION_TITLE_MAX,
  CustomNotificationDestination,
  customNotificationDestinationLabel
} from "@/lib/customNotifications";
import { pushAccessToken, pushResponseError } from "@/lib/pushClient";
import { Game } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { friendlyActionError } from "@/lib/actionErrors";
import { Card, Modal, Pill, PrimaryButton, SecondaryButton, Select, TextArea, TextInput } from "./ui";

type RecipientCount = { users: number; devices: number };
type SendResult = { total: number; sent: number; failed: number; removed: number; skipped?: boolean };

const emptyRecipients: RecipientCount = { users: 0, devices: 0 };

export function AdminNotificationComposer({ games, onSent }: { games: Game[]; onSent: () => void | Promise<void> }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [destination, setDestination] = useState<CustomNotificationDestination>("home");
  const [recipients, setRecipients] = useState(emptyRecipients);
  const [recipientsLoading, setRecipientsLoading] = useState(true);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const upcomingGame = useMemo(() => games
    .filter(game => (game.status === "upcoming" || game.status === "draft") && new Date(game.game_date).getTime() > Date.now())
    .sort((first, second) => new Date(first.game_date).getTime() - new Date(second.game_date).getTime())[0], [games]);

  const loadRecipients = useCallback(async () => {
    setRecipientsLoading(true);
    setRecipientsError(null);
    try {
      const token = await pushAccessToken();
      const response = await fetch("/api/push/custom", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(await pushResponseError(response));
      const result = await response.json() as { recipients?: RecipientCount };
      setRecipients(result.recipients || emptyRecipients);
    } catch (error) {
      setRecipientsError(friendlyActionError(error, "Recipients could not be counted. Please try again."));
    } finally {
      setRecipientsLoading(false);
    }
  }, []);

  useEffect(() => { void loadRecipients(); }, [loadRecipients]);
  useEffect(() => { setRequestId(null); }, [title, body, destination]);
  useEffect(() => {
    if (!upcomingGame && destination === "upcoming_game") setDestination("home");
  }, [destination, upcomingGame]);

  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  const canSend = cleanTitle.length >= 2
    && cleanTitle.length <= CUSTOM_NOTIFICATION_TITLE_MAX
    && cleanBody.length >= 2
    && cleanBody.length <= CUSTOM_NOTIFICATION_BODY_MAX
    && recipients.devices > 0
    && !recipientsLoading;

  function requestConfirmation(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    setRequestId(current => current || crypto.randomUUID());
    setSendError(null);
    setConfirmOpen(true);
  }

  async function sendAnnouncement() {
    if (!requestId || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const token = await pushAccessToken();
      const response = await fetch("/api/push/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: cleanTitle, body: cleanBody, destination, gameId: destination === "upcoming_game" ? upcomingGame?.id : null, requestId })
      });
      if (!response.ok) throw new Error(await pushResponseError(response));
      const responseBody = await response.json() as { result?: SendResult };
      const result = responseBody.result || { total: 0, sent: 0, failed: 0, removed: 0 };
      setConfirmOpen(false);
      setMessage(`Announcement sent: ${result.sent} delivered${result.failed ? `, ${result.failed} failed` : ""}${result.removed ? `, ${result.removed} expired` : ""}.`);
      setTitle("");
      setBody("");
      setRequestId(null);
      await Promise.all([loadRecipients(), Promise.resolve(onSent())]);
    } catch (error) {
      setSendError(friendlyActionError(error, "The announcement could not be sent. Please try again."));
    } finally {
      setSending(false);
    }
  }

  const destinationLabel = destination === "upcoming_game" && upcomingGame
    ? `Upcoming game · ${formatDateTime(upcomingGame.game_date)}`
    : customNotificationDestinationLabel(destination);

  return (
    <>
      <Card className="border-league-gold/30 bg-ink-850 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3"><BellRing className="mt-1 shrink-0 text-league-gold" /><div><h2 className="font-display text-3xl uppercase">Send announcement</h2><p className="mt-1 max-w-2xl text-sm text-chalk/55">Write a one-time league update and choose where it opens when pressed.</p></div></div>
          <div className="flex items-center gap-2" aria-live="polite">
            <Pill>{recipientsLoading ? "Counting..." : `${recipients.users} users · ${recipients.devices} devices`}</Pill>
            <button type="button" onClick={() => void loadRecipients()} disabled={recipientsLoading} aria-label="Refresh announcement recipient count" title="Refresh recipient count" className="rounded-xl border border-league-gold/15 bg-black/15 p-2 text-chalk/55 transition hover:text-league-gold disabled:opacity-40"><RefreshCw size={16} className={recipientsLoading ? "animate-spin" : ""} /></button>
          </div>
        </div>

        <form onSubmit={requestConfirmation} className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <div className="space-y-4">
            <label className="block"><span className="mb-2 flex items-center justify-between text-sm font-semibold"><span>Title</span><span className="font-mono text-xs text-chalk/40">{title.length}/{CUSTOM_NOTIFICATION_TITLE_MAX}</span></span><TextInput value={title} onChange={event => setTitle(event.target.value)} maxLength={CUSTOM_NOTIFICATION_TITLE_MAX} placeholder="Thursday update" required /></label>
            <label className="block"><span className="mb-2 flex items-center justify-between text-sm font-semibold"><span>Description</span><span className="font-mono text-xs text-chalk/40">{body.length}/{CUSTOM_NOTIFICATION_BODY_MAX}</span></span><TextArea value={body} onChange={event => setBody(event.target.value)} maxLength={CUSTOM_NOTIFICATION_BODY_MAX} rows={4} placeholder="Write the message users will see..." required /></label>
            <label className="block"><span className="mb-2 block text-sm font-semibold">Open notification in</span><Select value={destination} onChange={event => setDestination(event.target.value as CustomNotificationDestination)}><option value="home">Home</option>{upcomingGame ? <option value="upcoming_game">Upcoming game · {formatDateTime(upcomingGame.game_date)}</option> : null}<option value="fantasy">Fantasy</option><option value="bets">Bets</option></Select></label>
            {recipientsError ? <p className="text-sm text-red-200" role="alert">{recipientsError} <button type="button" onClick={() => void loadRecipients()} className="font-bold underline underline-offset-4">Retry</button></p> : null}
            {!recipientsLoading && !recipientsError && recipients.devices === 0 ? <p className="text-sm text-league-gold">Nobody with the Announcements preference enabled currently has a subscribed device.</p> : null}
            {message ? <p className="rounded-2xl border border-turf-400/25 bg-turf-400/[.07] px-4 py-3 text-sm text-chalk" role="status">{message}</p> : null}
            <PrimaryButton type="submit" disabled={!canSend} className="inline-flex items-center justify-center gap-2"><Send size={17} /> Review and send</PrimaryButton>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-chalk/70"><Eye size={16} /> Preview</div>
            <div className="rounded-[1.35rem] border border-league-gold/25 bg-ink-900/90 p-4 shadow-[0_10px_28px_rgba(0,0,0,.2)]">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-chalk/40"><Image src="/icons/icon-192.png" alt="" width={28} height={28} className="rounded-lg" />Thursday League</div>
              <div className="mt-4 font-semibold text-chalk">{cleanTitle || "Your notification title"}</div>
              <div className="mt-1 min-h-10 text-sm text-chalk/60">{cleanBody || "Your description will appear here."}</div>
              <div className="mt-4 border-t border-league-gold/20 pt-3 text-xs text-league-gold">Opens {destinationLabel}</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl border border-league-gold/15 bg-black/20 p-3"><Users size={16} className="text-league-gold" /><div className="mt-2 font-mono text-xl">{recipients.users}</div><div className="text-xs text-chalk/40">Opted-in users</div></div><div className="rounded-xl border border-league-gold/15 bg-black/20 p-3"><Smartphone size={16} className="text-league-gold" /><div className="mt-2 font-mono text-xl">{recipients.devices}</div><div className="text-xs text-chalk/40">Device deliveries</div></div></div>
          </div>
        </form>
      </Card>

      <Modal open={confirmOpen} title="Confirm announcement" onClose={() => { if (!sending) setConfirmOpen(false); }}>
        <h2 className="font-display text-3xl uppercase">Send announcement?</h2>
        <p className="mt-2 text-sm text-chalk/55">This will immediately send to {recipients.devices} device{recipients.devices === 1 ? "" : "s"} across {recipients.users} opted-in user{recipients.users === 1 ? "" : "s"}.</p>
        <div className="mt-4 rounded-2xl border border-league-gold/15 bg-black/20 p-4"><div className="font-semibold">{cleanTitle}</div><div className="mt-1 text-sm text-chalk/60">{cleanBody}</div><div className="mt-3 text-xs text-league-gold">Opens {destinationLabel}</div></div>
        {sendError ? <p className="mt-3 text-sm text-red-200" role="alert">{sendError}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><SecondaryButton type="button" disabled={sending} onClick={() => setConfirmOpen(false)}>Cancel</SecondaryButton><PrimaryButton type="button" disabled={sending} onClick={() => void sendAnnouncement()} className="inline-flex items-center justify-center gap-2"><Send size={16} />{sending ? "Sending..." : "Send now"}</PrimaryButton></div>
      </Modal>
    </>
  );
}
