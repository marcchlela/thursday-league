"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Cpu, Download, Eye, LockKeyhole, PauseCircle, Pencil, RefreshCw, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import { useBettingData } from "@/hooks/useBettingData";
import { BETTING_MODEL_VERSION, formatCoins, generatePlayerLineupMarkets } from "@/lib/betting";
import { buildModelExport, downloadModelExport } from "@/lib/modelExport";
import { supabase } from "@/lib/supabase";
import { BettingMarket, BettingOutcome, LeagueData } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { bettingCategoryOrder } from "./BettingMarketComponents";
import { Card, ConfirmDialog, EmptyState, ErrorState, LoadingState, Modal, Pill, PrimaryButton, SecondaryButton, Select, Toast } from "./ui";

export function AdminBettingManager({ data }: { data: LeagueData }) {
  const betting = useBettingData();
  const eligibleGames = useMemo(() => data.games.slice().sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime()), [data.games]);
  const [gameId, setGameId] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (gameId && eligibleGames.some(game => game.id === gameId)) return;
    const preferred = eligibleGames.find(game => game.status === "draft" || game.status === "upcoming") || eligibleGames[0];
    setGameId(preferred?.id || "");
  }, [eligibleGames, gameId]);

  if (betting.loading) return <LoadingState label="Loading betting control" cards={3} />;
  if (betting.error) return <ErrorState message={`${betting.error} Apply the virtual betting migration in Supabase first.`} onRetry={betting.reload} />;

  const game = data.games.find(item => item.id === gameId);
  const lineups = data.lineups.filter(lineup => lineup.game_id === gameId);
  const markets = betting.data.markets.filter(market => market.game_id === gameId);
  const outcomes = betting.data.outcomes.filter(outcome => markets.some(market => market.id === outcome.market_id));
  const run = betting.data.generations.find(item => item.game_id === gameId);
  const slips = betting.data.slips.filter(slip => slip.game_id === gameId);
  const status = markets[0]?.status;
  const invalidated = markets.some(market => market.invalidated);
  const settings = betting.data.settings;
  const lockAt = game ? new Date(new Date(game.game_date).getTime() - Number(settings?.lock_minutes ?? 5) * 60_000) : null;
  const canGenerate = !!game && (game.status === "upcoming" || game.status === "draft") && lineups.length === 10 && !!lockAt && now < lockAt.getTime() && slips.length === 0;
  const totalStaked = slips.reduce((total, slip) => total + slip.stake_units, 0);
  const totalPotential = slips.reduce((total, slip) => total + slip.potential_payout_units, 0);
  const resultVersions = betting.data.resultVersions.filter(version => version.game_id === gameId);
  const settlementRuns = betting.data.settlementRuns.filter(runItem => runItem.game_id === gameId);
  const predictions = run?.input_snapshot?.predictions as Record<string, number> | undefined;

  async function generate() {
    if (!game) return;
    setBusy(true);
    try {
      const result = generatePlayerLineupMarkets(data, game, Number(settings?.single_margin ?? 0.06));
      const { error } = await supabase.rpc("admin_generate_betting_markets", {
        target_game_id: game.id,
        target_model_version: BETTING_MODEL_VERSION,
        target_input_snapshot: result.snapshot,
        submitted_markets: result.markets
      });
      if (error) throw error;
      setToast(`${result.markets.length} draft markets generated. Review every price before approval.`);
      await betting.reload();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Odds generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(nextStatus: "open" | "suspended") {
    if (!game) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_betting_status", { target_game_id: game.id, new_status: nextStatus });
    setBusy(false);
    setApproveOpen(false);
    setManageOpen(false);
    if (error) return setToast(error.message);
    setToast(nextStatus === "open" ? "Markets approved and open." : "All markets suspended. Existing bets keep their accepted odds.");
    await betting.reload();
  }

  async function prepareEdit() {
    if (!game) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_prepare_betting_edit", { target_game_id: game.id });
    setBusy(false);
    if (error) return setToast(error.message);
    setManageOpen(false);
    setToast("Markets returned to draft. You can edit the offered odds before approving them again.");
    await betting.reload();
  }

  async function deleteMarkets() {
    if (!game) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_delete_betting_markets", { target_game_id: game.id });
    setBusy(false);
    setDeleteOpen(false);
    if (error) return setToast(error.message);
    setToast("Markets deleted. You can now generate a fresh set.");
    await betting.reload();
  }

  async function updateOdds(outcome: BettingOutcome, rawValue: string) {
    const nextOdds = Number(rawValue);
    if (!Number.isFinite(nextOdds) || nextOdds < 1.01 || nextOdds === Number(outcome.offered_odds)) return;
    const { error } = await supabase.rpc("admin_update_betting_odds", { target_outcome_id: outcome.id, new_odds: nextOdds });
    if (error) return setToast(error.message);
    setToast(`${outcome.label} updated to ${nextOdds.toFixed(2)}.`);
    await betting.reload();
  }

  function exportModelData() {
    const payload = buildModelExport(data, betting.data);
    downloadModelExport(payload);
    setToast(`${payload.games.length} finalized games exported without player names or user betting data.`);
  }

  return (
    <div className="space-y-5">
      <Toast message={toast} onDone={() => setToast(null)} />
      <ConfirmDialog open={approveOpen} title="Approve and open these markets?" text={`You are approving ${markets.length} markets generated from the confirmed player lineups. Users can place bets immediately and every accepted price becomes immutable. Betting locks automatically ${settings?.lock_minutes ?? 5} minutes before kick-off.`} confirmLabel="Approve markets" confirmTone="primary" cancelLabel="Keep reviewing" onCancel={() => setApproveOpen(false)} onConfirm={() => setStatus("open")} />
      <ConfirmDialog open={deleteOpen} title="Delete all markets for this game?" text="This removes the generated set so you can create it again. It is allowed only when nobody has placed a bet." confirmLabel="Delete markets" onCancel={() => setDeleteOpen(false)} onConfirm={deleteMarkets} />
      <Modal open={manageOpen} title="Manage betting markets" onClose={() => setManageOpen(false)}>
        <h2 className="font-display text-3xl uppercase">Manage markets</h2>
        <p className="mt-2 text-sm text-chalk/60">Choose what to do with this game&apos;s markets. Accepted bets always keep their original odds.</p>
        {slips.length ? <div className="mt-4 rounded-2xl border border-floodlight/30 bg-floodlight/10 p-3 text-sm text-floodlight">{slips.length} accepted bet{slips.length === 1 ? "" : "s"} exist, so editing and deletion are locked.</div> : null}
        <div className="mt-5 space-y-2">
          <SecondaryButton type="button" className="flex w-full items-center gap-3 p-3 text-left" disabled={busy || slips.length > 0 || invalidated || status === "draft"} onClick={prepareEdit}><Pencil size={18} /><span><span className="block">Edit odds</span><span className="block text-xs font-normal text-chalk/45">Return published markets to a private draft.</span></span></SecondaryButton>
          {status === "open" ? <SecondaryButton type="button" className="flex w-full items-center gap-3 p-3 text-left" disabled={busy} onClick={() => setStatus("suspended")}><PauseCircle size={18} /><span><span className="block">Suspend betting</span><span className="block text-xs font-normal text-chalk/45">Stop new bets without changing accepted ones.</span></span></SecondaryButton> : null}
          {status === "suspended" && !invalidated ? <SecondaryButton type="button" className="flex w-full items-center gap-3 p-3 text-left" disabled={busy} onClick={() => { setManageOpen(false); setApproveOpen(true); }}><RefreshCw size={18} /><span><span className="block">Reopen betting</span><span className="block text-xs font-normal text-chalk/45">Review the confirmation before publishing again.</span></span></SecondaryButton> : null}
          <button type="button" disabled={busy || slips.length > 0} onClick={() => { setManageOpen(false); setDeleteOpen(true); }} className="flex w-full items-center gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 p-3 text-left font-semibold text-red-200 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={18} /><span><span className="block">Delete markets</span><span className="block text-xs font-normal text-red-200/55">Remove this set, then generate fresh lines.</span></span></button>
          <SecondaryButton type="button" className="w-full" onClick={() => setManageOpen(false)}>Cancel</SecondaryButton>
        </div>
      </Modal>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex items-center gap-2 text-floodlight"><ShieldCheck size={18} /><span className="text-xs font-bold uppercase tracking-[.2em]">Admin approval required</span></div><h2 className="mt-2 font-display text-4xl uppercase">Betting control</h2><p className="mt-1 max-w-2xl text-sm text-chalk/55">Generate player-lineup probabilities, inspect fair chances and offered odds, adjust unrealistic draft prices, then approve the full market set.</p></div>
          {status ? <MarketStatus status={status} /> : null}
        </div>
        <label className="mt-5 block max-w-xl"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-chalk/50">Game</span><Select value={gameId} onChange={event => setGameId(event.target.value)}>{eligibleGames.map(item => <option key={item.id} value={item.id}>{formatDateTime(item.game_date)} — {item.status}</option>)}</Select></label>
      </Card>

      {game ? <div className="grid gap-3 md:grid-cols-4">
        <Metric icon={Cpu} label="Model" value={run?.model_version || BETTING_MODEL_VERSION} />
        <Metric icon={BarChart3} label="Expected score" value={predictions ? `${Number(predictions.expected_goals_A).toFixed(2)} – ${Number(predictions.expected_goals_B).toFixed(2)}` : "Not generated"} />
        <Metric icon={LockKeyhole} label="Locks" value={lockAt?.toLocaleString() || "—"} />
        <Metric icon={Eye} label="Exposure" value={`${formatCoins(totalStaked)} → ${formatCoins(totalPotential)}`} />
      </div> : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-display text-3xl uppercase">Workflow</h3><p className="text-sm text-chalk/55">{lineups.length}/10 lineup places saved · {markets.length} markets · {slips.length} accepted slips</p></div>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton type="button" disabled={!data.games.some(item => item.status === "final")} onClick={exportModelData}><span className="flex items-center gap-2"><Download size={16} />Export model data</span></SecondaryButton>
            <SecondaryButton type="button" disabled={!canGenerate || busy} onClick={generate}><span className="flex items-center gap-2"><RefreshCw size={16} />{markets.length ? "Regenerate drafts" : "Generate drafts"}</span></SecondaryButton>
            {status === "draft" ? <PrimaryButton type="button" disabled={busy} onClick={() => setApproveOpen(true)}><span className="flex items-center gap-2"><CheckCircle2 size={16} />Review complete — approve</span></PrimaryButton> : null}
            {markets.length ? <SecondaryButton type="button" disabled={busy} onClick={() => setManageOpen(true)}><span className="flex items-center gap-2"><Settings2 size={16} />Manage</span></SecondaryButton> : null}
          </div>
        </div>
        {!canGenerate && !markets.length ? <div className="mt-4 flex items-start gap-3 rounded-2xl border border-floodlight/30 bg-floodlight/10 p-3 text-sm text-floodlight"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><span>{lineups.length !== 10 ? "Save both complete lineups first." : slips.length ? "Accepted bets prevent regeneration." : "This game is no longer eligible for new odds."}</span></div> : null}
        {invalidated ? <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><span>The lineup or kick-off changed after generation. These prices cannot be reopened. {slips.length ? "Existing slips keep their accepted odds; affected removed-player legs will be void." : "Generate fresh drafts before opening betting."}</span></div> : null}
      </Card>

      {!markets.length ? <EmptyState title="No markets generated" text="Once the full lineup is saved, generate draft probabilities here. Nothing is visible to players until you approve it." /> : (
        <div className="space-y-3">
          {bettingCategoryOrder.map(category => {
            const categoryMarkets = markets.filter(market => market.market_type === category.type);
            if (!categoryMarkets.length) return null;
            return <details key={category.type} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]" open={category.type === "match_result"}><summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4"><span className="font-display text-2xl uppercase">{category.label}</span><Pill>{categoryMarkets.length} markets</Pill></summary><div className="space-y-3 border-t border-white/10 p-3">{categoryMarkets.map(market => <AdminMarketCard key={market.id} market={market} outcomes={outcomes.filter(outcome => outcome.market_id === market.id)} editable={market.status === "draft"} onOddsChange={updateOdds} />)}</div></details>;
          })}
        </div>
      )}

      {run ? <Card><details><summary className="cursor-pointer font-bold text-chalk/75">Model input snapshot</summary><p className="mt-2 text-sm text-chalk/50">Stored with this generation run for auditability and future calibration.</p><pre className="mt-3 max-h-96 overflow-auto rounded-2xl bg-black/30 p-3 text-xs text-chalk/60">{JSON.stringify(run.input_snapshot, null, 2)}</pre></details></Card> : null}

      {resultVersions.length ? <Card><h3 className="font-display text-3xl uppercase">Settlement history</h3><p className="mt-1 text-sm text-chalk/50">Corrections create a new result version and append only the wallet difference.</p><div className="mt-4 space-y-2">{resultVersions.map(version => { const settlement = settlementRuns.find(item => item.result_version_id === version.id); return <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-3"><div><div className="font-semibold">Version {version.version_number} · Team A {version.score_a}–{version.score_b} Team B</div><div className="mt-1 text-xs text-chalk/45">{new Date(version.created_at).toLocaleString()}{version.correction_reason ? ` · ${version.correction_reason}` : ""}</div></div><div className="text-right text-sm"><div>{settlement?.slips_processed || 0} slips processed</div><div className={cn("font-mono", Number(settlement?.total_adjustment_units || 0) >= 0 ? "text-turf-400" : "text-red-300")}>{Number(settlement?.total_adjustment_units || 0) >= 0 ? "+" : ""}{formatCoins(Number(settlement?.total_adjustment_units || 0))} coins</div></div></div>; })}</div></Card> : null}
    </div>
  );
}

function MarketStatus({ status }: { status: BettingMarket["status"] }) {
  const tone = status === "open" ? "border-turf-400/30 bg-turf-400/10 text-turf-400" : status === "draft" ? "border-floodlight/30 bg-floodlight/10 text-floodlight" : status === "settled" ? "border-perimeter-400/30 bg-perimeter-400/10 text-perimeter-400" : "border-white/15 bg-white/5 text-chalk/60";
  return <span className={cn("rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-widest", tone)}>{status}</span>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4"><Icon size={17} className="text-floodlight" /><div className="mt-3 text-[11px] font-bold uppercase tracking-widest text-chalk/45">{label}</div><div className="mt-1 truncate font-mono text-lg text-chalk" title={value}>{value}</div></div>;
}

function AdminMarketCard({ market, outcomes, editable, onOddsChange }: { market: BettingMarket; outcomes: BettingOutcome[]; editable: boolean; onOddsChange: (outcome: BettingOutcome, value: string) => void }) {
  const probabilityTotal = outcomes.reduce((total, outcome) => total + Number(outcome.fair_probability), 0);
  const impliedTotal = outcomes.reduce((total, outcome) => total + 1 / Number(outcome.offered_odds), 0);
  return <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-display text-2xl uppercase">{market.title}</h3>{market.line != null ? <Pill>Line {market.line}</Pill> : null}</div><p className="mt-1 text-xs text-chalk/45">Fair total {(probabilityTotal * 100).toFixed(1)}% · offered book {(impliedTotal * 100).toFixed(1)}%</p></div><MarketStatus status={market.status} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{outcomes.map(outcome => <label key={outcome.id} className="rounded-2xl border border-white/10 bg-black/20 p-3"><span className="flex items-center justify-between gap-2 text-sm font-semibold"><span>{outcome.label}</span><span className="font-mono text-perimeter-400">{(Number(outcome.fair_probability) * 100).toFixed(1)}%</span></span><span className="mt-2 block text-[10px] font-bold uppercase tracking-wider text-chalk/40">Offered decimal odds</span><input key={`${outcome.id}-${outcome.offered_odds}`} disabled={!editable} type="number" min="1.01" step="0.01" defaultValue={Number(outcome.offered_odds).toFixed(2)} onBlur={event => onOddsChange(outcome, event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 font-mono text-lg outline-none focus:border-perimeter-400 disabled:opacity-65" /></label>)}</div></Card>;
}
