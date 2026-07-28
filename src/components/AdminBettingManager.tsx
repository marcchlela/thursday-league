"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, CircleDollarSign, Cpu, Download, Eye, LockKeyhole, PauseCircle, Pencil, RefreshCw, Settings2, ShieldCheck, Trash2, UsersRound, Wrench } from "lucide-react";
import { useBettingData } from "@/hooks/useBettingData";
import { friendlyActionError } from "@/lib/actionErrors";
import { BETTING_MODEL_VERSION, formatCoins, generatePlayerLineupMarkets } from "@/lib/betting";
import { evaluateScoreForecasts } from "@/lib/modelEvaluation";
import { buildModelExport, downloadModelExport } from "@/lib/modelExport";
import { supabase } from "@/lib/supabase";
import { BettingData, BettingMarket, BettingOutcome, Game, LeagueData, Player } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { bettingCategoryOrder } from "./BettingMarketComponents";
import { Card, ConfirmDialog, EmptyState, ErrorState, LoadingState, Modal, Pill, PrimaryButton, SecondaryButton, Select, TextArea, TextInput, Toast, ToastTone } from "./ui";

export function AdminBettingManager({ data }: { data: LeagueData }) {
  const betting = useBettingData();
  const eligibleGames = useMemo(() => data.games.slice().sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime()), [data.games]);
  const [gameId, setGameId] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [repairPlayerId, setRepairPlayerId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [walletUserId, setWalletUserId] = useState("");
  const [walletSeasonId, setWalletSeasonId] = useState("");
  const [walletDirection, setWalletDirection] = useState<"credit" | "debit">("credit");
  const [walletAmount, setWalletAmount] = useState("");
  const [walletReason, setWalletReason] = useState("");
  const [walletConfirmOpen, setWalletConfirmOpen] = useState(false);
  const [walletRequestId, setWalletRequestId] = useState<string | null>(null);

  function notify(message: string, tone: ToastTone = "success") {
    setToast({ message, tone });
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (gameId && eligibleGames.some(game => game.id === gameId)) return;
    const preferred = eligibleGames.find(game => game.status === "draft" || game.status === "upcoming") || eligibleGames[0];
    setGameId(preferred?.id || "");
  }, [eligibleGames, gameId]);

  useEffect(() => {
    if (!walletUserId && data.profiles.length) setWalletUserId(data.profiles[0].id);
    const preferredSeason = data.leagueSettings?.current_season_id || data.seasons[0]?.id || "";
    if (!walletSeasonId && preferredSeason) setWalletSeasonId(preferredSeason);
  }, [data.leagueSettings?.current_season_id, data.profiles, data.seasons, walletSeasonId, walletUserId]);

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
  const selectedWalletProfile = data.profiles.find(profile => profile.id === walletUserId);
  const selectedWalletSeason = data.seasons.find(season => season.id === walletSeasonId);
  const selectedWallet = betting.data.wallets.find(wallet => wallet.user_id === walletUserId && wallet.season_id === walletSeasonId);
  const selectedWalletBalance = Number(selectedWallet?.balance_units ?? betting.data.settings?.starting_balance_units ?? 10000);
  let repairGeneration: ReturnType<typeof generatePlayerLineupMarkets> | null = null;
  if (game && lineups.length === 10 && markets.length && invalidated && lockAt && now < lockAt.getTime()) {
    try {
      repairGeneration = generatePlayerLineupMarkets(data, game, Number(settings?.single_margin ?? 0.06));
    } catch {
      repairGeneration = null;
    }
  }
  const repairPlayerIds = [...new Set(
    (repairGeneration?.markets || [])
      .filter(market => (
        market.subject_player_id
        && !markets.some(existing => (
          existing.subject_player_id === market.subject_player_id
          && existing.market_type === market.market_type
        ))
      ))
      .map(market => market.subject_player_id as string)
  )];
  const repairPlayers = repairPlayerIds
    .map(playerId => data.players.find(player => player.id === playerId))
    .filter((player): player is Player => Boolean(player));
  const repairPlayer = data.players.find(player => player.id === repairPlayerId);

  function walletAdjustmentUnits() {
    const cleanAmount = walletAmount.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(cleanAmount)) return null;
    const units = Math.round(Number(cleanAmount) * 100);
    if (!Number.isSafeInteger(units) || units <= 0) return null;
    return walletDirection === "credit" ? units : -units;
  }

  function requestWalletAdjustment() {
    const units = walletAdjustmentUnits();
    if (!walletUserId || !walletSeasonId) return notify("Choose a user and season.", "warning");
    if (units === null) return notify("Enter a positive coin amount with no more than two decimal places.", "warning");
    if (walletReason.trim().length < 5) return notify("Enter a clear reason of at least five characters.", "warning");
    if (selectedWalletBalance + units < 0) return notify("This adjustment would make the wallet balance negative.", "warning");
    setWalletRequestId(crypto.randomUUID());
    setWalletConfirmOpen(true);
  }

  async function adjustWallet() {
    const units = walletAdjustmentUnits();
    if (units === null || !walletRequestId) return;
    setBusy(true);
    const { data: result, error } = await supabase.rpc("admin_adjust_betting_wallet", {
      target_user_id: walletUserId,
      target_season_id: walletSeasonId,
      adjustment_units: units,
      adjustment_reason: walletReason.trim(),
      request_id: walletRequestId
    });
    setBusy(false);
    setWalletConfirmOpen(false);
    setWalletRequestId(null);
    if (error) return notify(friendlyActionError(error, "The wallet could not be adjusted. Please try again."), "error");
    const nextBalance = Number((result as { balance_units?: number } | null)?.balance_units ?? selectedWalletBalance + units);
    setWalletAmount("");
    setWalletReason("");
    notify(`${selectedWalletProfile?.username || "User"} wallet adjusted. New balance: ${formatCoins(nextBalance)} coins.`);
    await betting.reload();
  }

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
      notify(`${result.markets.length} draft markets generated. Review every price before approval.`);
      await betting.reload();
    } catch (error) {
      notify(friendlyActionError(error, "Odds generation failed. Review the lineup and try again."), "error");
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
    if (error) return notify(friendlyActionError(error), "error");
    notify(nextStatus === "open" ? "Markets approved and open." : "All markets suspended. Existing bets keep their accepted odds.");
    await betting.reload();
  }

  async function prepareEdit() {
    if (!game) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_prepare_betting_edit", { target_game_id: game.id });
    setBusy(false);
    if (error) return notify(friendlyActionError(error), "error");
    setManageOpen(false);
    notify("Markets returned to draft. You can edit the offered odds before approving them again.");
    await betting.reload();
  }

  async function deleteMarkets() {
    if (!game) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_delete_betting_markets", { target_game_id: game.id });
    setBusy(false);
    setDeleteOpen(false);
    if (error) return notify(friendlyActionError(error), "error");
    notify("Markets deleted. You can now generate a fresh set.");
    await betting.reload();
  }

  async function repairMissingPlayerMarkets() {
    if (!game || !repairPlayerId) return;
    setBusy(true);
    try {
      const generated = generatePlayerLineupMarkets(data, game, Number(settings?.single_margin ?? 0.06));
      const { data: result, error } = await supabase.rpc("admin_repair_missing_player_markets", {
        target_game_id: game.id,
        target_player_id: repairPlayerId,
        target_model_version: BETTING_MODEL_VERSION,
        target_input_snapshot: generated.snapshot,
        submitted_markets: generated.markets
      });
      if (error) throw error;
      const addedCount = Number((result as { added_market_count?: number } | null)?.added_market_count || 0);
      notify(`${addedCount} missing ${repairPlayer?.name || "player"} market${addedCount === 1 ? "" : "s"} added. Existing odds and accepted bets were preserved. Review them, then use Manage to reopen betting.`);
      setRepairPlayerId(null);
      await betting.reload();
    } catch (error) {
      notify(friendlyActionError(error, "The missing markets could not be repaired safely."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function updateOdds(outcome: BettingOutcome, rawValue: string) {
    const nextOdds = Number(rawValue);
    if (!Number.isFinite(nextOdds) || nextOdds < 1.01 || nextOdds === Number(outcome.offered_odds)) return;
    const { error } = await supabase.rpc("admin_update_betting_odds", { target_outcome_id: outcome.id, new_odds: nextOdds });
    if (error) return notify(friendlyActionError(error), "error");
    notify(`${outcome.label} updated to ${nextOdds.toFixed(2)}.`);
    await betting.reload();
  }

  function exportModelData() {
    const payload = buildModelExport(data, betting.data);
    downloadModelExport(payload);
    notify(`${payload.games.length} finalized games exported without player names or user betting data.`);
  }

  return (
    <div className="space-y-5">
      <Toast message={toast?.message || null} tone={toast?.tone} onDone={() => setToast(null)} />
      <ConfirmDialog open={approveOpen} title="Approve and open these markets?" text={`You are approving ${markets.length} markets generated from the confirmed player lineups. Users can place bets immediately and every accepted price becomes immutable. Betting locks automatically ${settings?.lock_minutes ?? 5} minutes before kick-off.`} confirmLabel="Approve markets" confirmTone="primary" cancelLabel="Keep reviewing" onCancel={() => setApproveOpen(false)} onConfirm={() => setStatus("open")} />
      <ConfirmDialog open={deleteOpen} title="Delete all markets for this game?" text="This removes the generated set so you can create it again. It is allowed only when nobody has placed a bet." confirmLabel="Delete markets" onCancel={() => setDeleteOpen(false)} onConfirm={deleteMarkets} />
      <ConfirmDialog
        open={Boolean(repairPlayerId)}
        title={`Add ${repairPlayer?.name || "this player"}'s missing markets?`}
        text="This appends only entirely missing personal market families. Existing markets, offered odds, accepted slips, stakes, and payouts are not changed. Betting stays suspended until you review the additions and reopen it."
        confirmLabel={busy ? "Adding..." : "Add missing markets"}
        confirmTone="primary"
        cancelLabel="Cancel"
        onCancel={() => { if (!busy) setRepairPlayerId(null); }}
        onConfirm={repairMissingPlayerMarkets}
      />
      <ConfirmDialog
        open={walletConfirmOpen}
        title={`${walletDirection === "credit" ? "Add" : "Remove"} ${formatCoins(Math.abs(walletAdjustmentUnits() || 0))} coins?`}
        text={`${selectedWalletProfile?.username || "This user"} currently has ${formatCoins(selectedWalletBalance)} coins for ${selectedWalletSeason?.name || "the selected season"}. The new balance will be ${formatCoins(selectedWalletBalance + (walletAdjustmentUnits() || 0))}. Reason: ${walletReason.trim()} This creates permanent ledger and audit entries.`}
        confirmLabel={busy ? "Applying..." : "Confirm adjustment"}
        confirmTone="primary"
        cancelLabel="Cancel"
        onCancel={() => { if (!busy) { setWalletConfirmOpen(false); setWalletRequestId(null); } }}
        onConfirm={adjustWallet}
      />
      <Modal open={manageOpen} title="Manage betting markets" onClose={() => setManageOpen(false)}>
        <h2 className="font-display text-3xl uppercase">Manage markets</h2>
        <p className="mt-2 text-sm text-chalk/60">Choose what to do with this game&apos;s markets. Accepted bets always keep their original odds.</p>
        {slips.length ? <div className="mt-4 rounded-2xl border border-league-gold/30 bg-league-gold/[.07] p-3 text-sm text-league-gold">{slips.length} accepted bet{slips.length === 1 ? "" : "s"} exist, so editing and deletion are locked.</div> : null}
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
          <div><div className="flex items-center gap-2 text-league-gold"><ShieldCheck size={18} /><span className="text-xs font-bold uppercase tracking-[.2em]">Admin approval required</span></div><h2 className="mt-2 font-display text-4xl uppercase">Betting control</h2><p className="mt-1 max-w-2xl text-sm text-chalk/55">Generate player-lineup probabilities, inspect fair chances and offered odds, adjust unrealistic draft prices, then approve the full market set.</p></div>
          {status ? <MarketStatus status={status} /> : null}
        </div>
        <label className="mt-5 block max-w-xl"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-chalk/50">Game</span><Select value={gameId} onChange={event => setGameId(event.target.value)}>{eligibleGames.map(item => <option key={item.id} value={item.id}>{formatDateTime(item.game_date)} — {item.status}</option>)}</Select></label>
      </Card>

      <Card>
        <details>
        <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-4 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold">
          <div>
            <div className="flex items-center gap-2 text-league-gold"><CircleDollarSign size={18} /><span className="text-xs font-bold uppercase tracking-[.2em]">Controlled correction</span></div>
            <h3 className="mt-2 font-display text-3xl uppercase">Adjust wallet</h3>
            <p className="mt-1 max-w-2xl text-sm text-chalk/55">Open only when a balance needs an audited correction.</p>
          </div>
          <div className="rounded-xl border border-league-gold/20 bg-league-gold/[.055] px-4 py-2 text-right">
            <div className="text-[9px] font-black uppercase tracking-wider text-chalk/40">Current balance</div>
            <div className="font-mono text-xl font-black text-league-gold">{formatCoins(selectedWalletBalance)} coins</div>
          </div>
        </summary>
        <p className="mt-5 max-w-2xl text-sm text-chalk/55">Correct a virtual-coin balance without rewriting its history. A reason, ledger entry, and admin audit entry are always required.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label><span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-chalk/45">User</span><Select value={walletUserId} onChange={event => setWalletUserId(event.target.value)}>{data.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.username}</option>)}</Select></label>
          <label><span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-chalk/45">Season</span><Select value={walletSeasonId} onChange={event => setWalletSeasonId(event.target.value)}>{data.seasons.map(season => <option key={season.id} value={season.id}>{season.name}</option>)}</Select></label>
          <label><span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-chalk/45">Adjustment</span><Select value={walletDirection} onChange={event => setWalletDirection(event.target.value as "credit" | "debit")}><option value="credit">Add coins</option><option value="debit">Remove coins</option></Select></label>
          <label><span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-chalk/45">Amount in coins</span><TextInput type="number" min="0.01" step="0.01" inputMode="decimal" value={walletAmount} onChange={event => setWalletAmount(event.target.value)} placeholder="10" /></label>
        </div>
        <label className="mt-3 block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-chalk/45">Mandatory reason</span><TextArea rows={3} maxLength={500} value={walletReason} onChange={event => setWalletReason(event.target.value)} placeholder="Explain why this balance needs to be corrected…" /></label>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-chalk/40">{selectedWallet ? "Existing seasonal wallet selected." : "The seasonal wallet will be initialized before applying this correction."}</p>
          <PrimaryButton type="button" disabled={busy || !walletUserId || !walletSeasonId} onClick={requestWalletAdjustment}>Review adjustment</PrimaryButton>
        </div>
        </details>
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
            {repairPlayers.map(player => <SecondaryButton key={player.id} type="button" disabled={busy} onClick={() => setRepairPlayerId(player.id)}><span className="flex items-center gap-2"><Wrench size={16} />Add {player.name}&apos;s missing markets</span></SecondaryButton>)}
            <SecondaryButton type="button" disabled={!canGenerate || busy} onClick={generate}><span className="flex items-center gap-2"><RefreshCw size={16} />{markets.length ? "Regenerate drafts" : "Generate drafts"}</span></SecondaryButton>
            {status === "draft" ? <PrimaryButton type="button" disabled={busy} onClick={() => setApproveOpen(true)}><span className="flex items-center gap-2"><CheckCircle2 size={16} />Review complete — approve</span></PrimaryButton> : null}
            {markets.length ? <SecondaryButton type="button" disabled={busy} onClick={() => setManageOpen(true)}><span className="flex items-center gap-2"><Settings2 size={16} />Manage</span></SecondaryButton> : null}
          </div>
        </div>
        {!canGenerate && !markets.length ? <div className="mt-4 flex items-start gap-3 rounded-2xl border border-league-gold/30 bg-league-gold/[.07] p-3 text-sm text-league-gold"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><span>{lineups.length !== 10 ? "Save both complete lineups first." : slips.length ? "Accepted bets prevent regeneration." : "This game is no longer eligible for new odds."}</span></div> : null}
        {invalidated ? <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><span>{repairPlayers.length ? `A player's betting eligibility changed after generation. Use the missing-markets repair above; it will preserve all ${slips.length} accepted slip${slips.length === 1 ? "" : "s"} and every existing price.` : `The lineup, kick-off, or player eligibility changed after generation. These prices cannot be reopened automatically. ${slips.length ? "Existing slips keep their accepted odds; affected removed-player legs will be void." : "Generate fresh drafts before opening betting."}`}</span></div> : null}
      </Card>

      {game ? <AdminReadiness game={game} data={data} betting={betting.data} /> : null}

      {!markets.length ? <EmptyState title="No markets generated" text="Once the full lineup is saved, generate draft probabilities here. Nothing is visible to players until you approve it." /> : (
        <div className="space-y-3">
          {bettingCategoryOrder.map(category => {
            const categoryMarkets = markets.filter(market => market.market_type === category.type);
            if (!categoryMarkets.length) return null;
            return <details key={category.type} className="overflow-hidden rounded-[1.3rem] border border-league-gold/25 bg-ink-850" open={category.type === "match_result"}><summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4"><span className="font-display text-2xl uppercase">{category.label}</span><Pill>{categoryMarkets.length} markets</Pill></summary><div className="space-y-3 border-t border-league-gold/20 p-3">{categoryMarkets.map(market => <AdminMarketCard key={market.id} market={market} outcomes={outcomes.filter(outcome => outcome.market_id === market.id)} editable={market.status === "draft"} onOddsChange={updateOdds} />)}</div></details>;
          })}
        </div>
      )}

      <PredictionReview data={data} betting={betting.data} />

      {run ? <Card><details><summary className="cursor-pointer font-bold text-chalk/75">Model input snapshot</summary><p className="mt-2 text-sm text-chalk/50">Stored with this generation run for auditability and future calibration.</p><pre className="mt-3 max-h-96 overflow-auto rounded-2xl bg-black/30 p-3 text-xs text-chalk/60">{JSON.stringify(run.input_snapshot, null, 2)}</pre></details></Card> : null}

      {resultVersions.length ? <Card><h3 className="font-display text-3xl uppercase">Settlement history</h3><p className="mt-1 text-sm text-chalk/50">Corrections create a new result version and append only the wallet difference.</p><div className="mt-4 space-y-2">{resultVersions.map(version => { const settlement = settlementRuns.find(item => item.result_version_id === version.id); return <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-league-gold/15 bg-black/20 p-3"><div><div className="font-semibold">Version {version.version_number} · Team A {version.score_a}–{version.score_b} Team B</div><div className="mt-1 text-xs text-chalk/45">{new Date(version.created_at).toLocaleString()}{version.correction_reason ? ` · ${version.correction_reason}` : ""}</div></div><div className="text-right text-sm"><div>{settlement?.slips_processed || 0} slips processed</div><div className={cn("font-mono", Number(settlement?.total_adjustment_units || 0) >= 0 ? "text-turf-400" : "text-red-300")}>{Number(settlement?.total_adjustment_units || 0) >= 0 ? "+" : ""}{formatCoins(Number(settlement?.total_adjustment_units || 0))} coins</div></div></div>; })}</div></Card> : null}
    </div>
  );
}

function AdminReadiness({ game, data, betting }: { game: Game; data: LeagueData; betting: BettingData }) {
  const activeProfiles = data.profiles.filter(profile => profile.account_status !== "deactivated" && profile.account_status !== "deleted");
  const fantasyUsers = new Set(data.squads.filter(squad => squad.game_id === game.id).map(squad => squad.user_id));
  const bettingUsers = new Set(betting.slips.filter(slip => slip.game_id === game.id && slip.status !== "cashed_out").map(slip => slip.user_id));

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-league-gold"><UsersRound size={18} /><span className="text-xs font-bold uppercase tracking-[.18em]">Private readiness</span></div>
          <h3 className="mt-2 font-display text-3xl uppercase">Matchweek participation</h3>
          <p className="mt-1 text-sm text-chalk/50">Submission status only. Fantasy teams and bet details are not shown here.</p>
        </div>
        <div className="flex gap-2">
          <Pill>{fantasyUsers.size}/{activeProfiles.length} Fantasy</Pill>
          <Pill>{bettingUsers.size}/{activeProfiles.length} bettors</Pill>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {activeProfiles.map(profile => (
          <div key={profile.id} className="flex items-center justify-between gap-3 rounded-xl border border-league-gold/12 bg-black/15 px-3 py-2.5">
            <span className="min-w-0 truncate text-sm font-semibold">{profile.username}</span>
            <span className="flex shrink-0 gap-1.5 text-[9px] font-black uppercase tracking-wider">
              <span className={cn("rounded-md px-2 py-1", fantasyUsers.has(profile.id) ? "bg-turf-400/10 text-turf-400" : "bg-chalk/[.04] text-chalk/30")}>F {fantasyUsers.has(profile.id) ? "Set" : "—"}</span>
              <span className={cn("rounded-md px-2 py-1", bettingUsers.has(profile.id) ? "bg-league-gold/10 text-league-gold" : "bg-chalk/[.04] text-chalk/30")}>B {bettingUsers.has(profile.id) ? "Set" : "—"}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PredictionReview({ data, betting }: { data: LeagueData; betting: BettingData }) {
  const evaluation = evaluateScoreForecasts(buildModelExport(data, betting));
  const readinessLabel = {
    pipeline_only: "Pipeline only",
    early_evaluation: "Early evidence",
    candidate_review: "Candidate review",
    needs_revision: "Needs revision"
  }[evaluation.readiness];
  const brierSkill = evaluation.skillVsUniform.brier;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-league-gold"><BarChart3 size={18} /><span className="text-xs font-bold uppercase tracking-[.18em]">Model review</span></div>
          <h3 className="mt-2 font-display text-3xl uppercase">Prediction vs result</h3>
          <p className="mt-1 text-sm text-chalk/50">Only retained pre-kickoff forecasts are scored. Lower Brier, log loss, and goal error are better.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill>{readinessLabel}</Pill>
          <Pill>{evaluation.evaluatedGames}/{evaluation.finalizedGames} covered</Pill>
          <Pill>{evaluation.correctOutcomes}/{evaluation.evaluatedGames} outcomes</Pill>
        </div>
      </div>
      {evaluation.evaluatedGames ? <>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-league-gold/12 bg-black/15 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-chalk/40">Brier score</div><div className="mt-1 font-mono text-lg">{evaluation.brier?.toFixed(3)}</div><div className="text-xs text-chalk/40">Uniform baseline {evaluation.uniformBaseline.brier?.toFixed(3)}</div></div>
          <div className="rounded-xl border border-league-gold/12 bg-black/15 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-chalk/40">Log loss</div><div className="mt-1 font-mono text-lg">{evaluation.logLoss?.toFixed(3)}</div><div className="text-xs text-chalk/40">Uniform baseline {evaluation.uniformBaseline.logLoss?.toFixed(3)}</div></div>
          <div className="rounded-xl border border-league-gold/12 bg-black/15 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-chalk/40">Team-goal MAE</div><div className="mt-1 font-mono text-lg">{evaluation.goalMae?.toFixed(2)}</div><div className="text-xs text-chalk/40">{brierSkill == null ? "No baseline comparison" : `${brierSkill >= 0 ? "+" : ""}${(brierSkill * 100).toFixed(1)}% Brier skill`}</div></div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-league-gold/12">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="bg-black/20 text-[10px] uppercase tracking-wider text-chalk/40">
              <tr><th className="px-3 py-2.5">Game</th><th className="px-3 py-2.5">Expected</th><th className="px-3 py-2.5">Actual</th><th className="px-3 py-2.5">A / Draw / B</th><th className="px-3 py-2.5">Brier</th><th className="px-3 py-2.5">Outcome</th></tr>
            </thead>
            <tbody>
              {evaluation.rows.slice(0, 8).map(row => {
                const outcomeCorrect = row.predictedOutcome === row.actualOutcome;
                return <tr key={row.gameId} className="border-t border-league-gold/10">
                  <td className="whitespace-nowrap px-3 py-2.5 text-chalk/60">{formatDateTime(row.gameDate)}</td>
                  <td className="px-3 py-2.5 font-mono">{row.expectedA.toFixed(2)}–{row.expectedB.toFixed(2)}</td>
                  <td className="px-3 py-2.5 font-mono font-bold">{row.actualA}–{row.actualB}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{(row.probabilities.A * 100).toFixed(0)} / {(row.probabilities.draw * 100).toFixed(0)} / {(row.probabilities.B * 100).toFixed(0)}</td>
                  <td className="px-3 py-2.5 font-mono">{row.brier.toFixed(3)}</td>
                  <td className={cn("px-3 py-2.5 font-bold", outcomeCorrect ? "text-turf-400" : "text-red-300")}>{outcomeCorrect ? "Correct" : "Missed"}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </> : <div className="mt-4 rounded-2xl border border-league-gold/25 bg-league-gold/[.06] p-4 text-sm text-league-gold">No finalized game has a complete retained pre-kickoff probability forecast yet. The next finalized game will start this evaluation record.</div>}
      <p className="mt-3 text-xs text-chalk/40">Promotion stays blocked until at least 20 genuine walk-forward games exist and the candidate beats its baselines. Synthetic matches never count.</p>
    </Card>
  );
}

function MarketStatus({ status }: { status: BettingMarket["status"] }) {
  const tone = status === "open" ? "border-turf-400/30 bg-turf-400/10 text-turf-400" : status === "draft" ? "border-league-gold/30 bg-league-gold/[.07] text-league-gold" : status === "settled" ? "border-league-gold/30 bg-league-gold/[.07] text-league-gold" : "border-league-gold/15 bg-black/15 text-chalk/60";
  return <span className={cn("rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-widest", tone)}>{status}</span>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return <div className="rounded-[1.2rem] border border-league-gold/18 bg-ink-850 p-4"><Icon size={17} className="text-league-gold" /><div className="mt-3 text-[11px] font-bold uppercase tracking-widest text-chalk/45">{label}</div><div className="mt-1 truncate font-mono text-lg text-chalk" title={value}>{value}</div></div>;
}

function AdminMarketCard({ market, outcomes, editable, onOddsChange }: { market: BettingMarket; outcomes: BettingOutcome[]; editable: boolean; onOddsChange: (outcome: BettingOutcome, value: string) => void }) {
  const probabilityTotal = outcomes.reduce((total, outcome) => total + Number(outcome.fair_probability), 0);
  const impliedTotal = outcomes.reduce((total, outcome) => total + 1 / Number(outcome.offered_odds), 0);
  return <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-display text-2xl uppercase">{market.title}</h3>{market.line != null ? <Pill>Line {market.line}</Pill> : null}</div><p className="mt-1 text-xs text-chalk/45">Fair total {(probabilityTotal * 100).toFixed(1)}% · offered book {(impliedTotal * 100).toFixed(1)}%</p></div><MarketStatus status={market.status} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{outcomes.map(outcome => <label key={outcome.id} className="rounded-2xl border border-league-gold/15 bg-black/20 p-3"><span className="flex items-center justify-between gap-2 text-sm font-semibold"><span>{outcome.label}</span><span className="font-mono text-league-gold">{(Number(outcome.fair_probability) * 100).toFixed(1)}%</span></span><span className="mt-2 block text-[10px] font-bold uppercase tracking-wider text-chalk/40">Offered decimal odds</span><input key={`${outcome.id}-${outcome.offered_odds}`} disabled={!editable} type="number" min="1.01" step="0.01" defaultValue={Number(outcome.offered_odds).toFixed(2)} onBlur={event => onOddsChange(outcome, event.target.value)} className="mt-1 w-full rounded-xl border border-league-gold/15 bg-ink-900 px-3 py-2 font-mono text-lg outline-none focus:border-league-gold disabled:opacity-65" /></label>)}</div></Card>;
}
