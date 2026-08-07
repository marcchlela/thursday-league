import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LeagueHeader } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Field, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { apiRequest, friendlyMobileError } from '@/lib/api';
import { formatMatchTime } from '@/lib/scoring';
import { getSupabaseClient } from '@/lib/supabase';
import type { Game, GameLineup, GamePlayerStat, Player, PlayerPosition, TeamCode } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type Assignment = { team: TeamCode; role: PlayerPosition };
type GoalkeeperMode = 'fixed' | 'rotating';
type StatDraft = { goals: string; assists: string; saves: string; own_goals: string };

export default function AdminGameDetailScreen() {
  const router = useRouter();
  const { slug, gameId } = useLocalSearchParams<{ slug: string; gameId: string }>();
  const { session } = useAuth();
  const { league, membership, loading: leagueLoading, switching } = useScopedLeague(slug);
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [savedLineups, setSavedLineups] = useState<GameLineup[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [teamAMode, setTeamAMode] = useState<GoalkeeperMode>('fixed');
  const [teamBMode, setTeamBMode] = useState<GoalkeeperMode>('fixed');
  const [statDraft, setStatDraft] = useState<Record<string, StatDraft>>({});
  const [potm, setPotm] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'error' | 'success'>('error');
  const allowed = membership?.role === 'owner' || membership?.role === 'admin';

  const load = useCallback(async () => {
    if (!league) return;
    setLoading(true);
    const supabase = getSupabaseClient();
    const responses = await Promise.all([
      supabase.from('games').select('*').eq('league_id', league.id).eq('id', gameId).maybeSingle(),
      supabase.from('players').select('*').eq('league_id', league.id).eq('active', true).is('archived_at', null).order('name'),
      supabase.from('game_lineups').select('*').eq('league_id', league.id).eq('game_id', gameId).order('team').order('slot_index'),
      supabase.from('game_player_stats').select('*').eq('league_id', league.id).eq('game_id', gameId),
    ]);
    setLoading(false);
    const failure = responses.find(item => item.error)?.error;
    if (failure) return setMessage(friendlyMobileError(failure, 'Match controls could not be loaded.'));
    const nextGame = (responses[0].data || null) as Game | null;
    const nextPlayers = (responses[1].data || []) as Player[];
    const nextLineups = (responses[2].data || []) as GameLineup[];
    const nextStats = (responses[3].data || []) as GamePlayerStat[];
    setGame(nextGame);
    setPlayers(nextPlayers);
    setSavedLineups(nextLineups);
    setAssignments(Object.fromEntries(nextLineups.map(item => [item.player_id, { team: item.team, role: item.role }])));
    setTeamAMode(nextGame?.team_a_goalkeeper_mode || 'fixed');
    setTeamBMode(nextGame?.team_b_goalkeeper_mode || 'fixed');
    setPotm(nextGame?.potm_player_id || null);
    setStatDraft(Object.fromEntries(nextLineups.map(lineup => {
      const stat = nextStats.find(item => item.player_id === lineup.player_id);
      return [lineup.player_id, { goals: String(stat?.goals || 0), assists: String(stat?.assists || 0), saves: String(stat?.saves || 0), own_goals: String(stat?.own_goals || 0) }];
    })));
  }, [gameId, league]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  const teamA = useMemo(() => players.filter(player => assignments[player.id]?.team === 'A'), [assignments, players]);
  const teamB = useMemo(() => players.filter(player => assignments[player.id]?.team === 'B'), [assignments, players]);

  function assign(player: Player, team: TeamCode | null) {
    if (game?.status === 'final') return;
    setAssignments(current => {
      const next = { ...current };
      if (!team || current[player.id]?.team === team) {
        delete next[player.id];
        return next;
      }
      const count = Object.values(current).filter(value => value.team === team).length;
      if (count >= 5) {
        setTone('error');
        setMessage(`Team ${team} already has five players.`);
        return current;
      }
      const mode = team === 'A' ? teamAMode : teamBMode;
      const hasKeeper = Object.values(current).some(value => value.team === team && value.role === 'goalkeeper');
      next[player.id] = { team, role: mode === 'fixed' && player.default_position === 'goalkeeper' && !hasKeeper ? 'goalkeeper' : 'outfield' };
      return next;
    });
  }

  function setKeeper(playerId: string, team: TeamCode) {
    const mode = team === 'A' ? teamAMode : teamBMode;
    if (mode === 'rotating') return;
    setAssignments(current => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, value.team === team ? { ...value, role: id === playerId ? 'goalkeeper' : 'outfield' as PlayerPosition } : value])));
  }

  function setMode(team: TeamCode, mode: GoalkeeperMode) {
    if (team === 'A') setTeamAMode(mode); else setTeamBMode(mode);
    setAssignments(current => {
      const next = Object.fromEntries(Object.entries(current).map(([id, value]) => [id, value.team === team ? { ...value, role: 'outfield' as PlayerPosition } : value]));
      if (mode === 'fixed') {
        const candidate = players.find(player => next[player.id]?.team === team && player.default_position === 'goalkeeper') || players.find(player => next[player.id]?.team === team);
        if (candidate) next[candidate.id] = { team, role: 'goalkeeper' };
      }
      return next;
    });
  }

  async function saveLineup() {
    if (!game || !session) return;
    const teamValid = (team: TeamCode, mode: GoalkeeperMode) => {
      const rows = Object.entries(assignments).filter(([, value]) => value.team === team);
      return rows.length === 5 && rows.filter(([, value]) => value.role === 'goalkeeper').length === (mode === 'fixed' ? 1 : 0);
    };
    if (!teamValid('A', teamAMode) || !teamValid('B', teamBMode)) {
      setTone('error');
      return setMessage('Each team needs five players. Fixed mode needs one goalkeeper; rotating mode needs five outfield roles.');
    }
    const submitted = (['A', 'B'] as TeamCode[]).flatMap(team => players.filter(player => assignments[player.id]?.team === team).sort((first, second) => assignments[first.id].role === assignments[second.id].role ? first.name.localeCompare(second.name) : assignments[first.id].role === 'goalkeeper' ? -1 : 1).map((player, slot_index) => ({ player_id: player.id, team, role: assignments[player.id].role, slot_index })));
    setBusy('lineup');
    setMessage(null);
    const result = await getSupabaseClient().rpc('save_game_lineup_v2', { target_game_id: game.id, submitted_lineup: submitted, team_a_mode: teamAMode, team_b_mode: teamBMode });
    if (result.error) {
      setBusy(null);
      setTone('error');
      setMessage(friendlyMobileError(result.error, 'The lineup could not be saved.'));
      return;
    }
    let followup = '';
    try {
      const betting = await apiRequest<{ generated?: boolean; market_count?: number; reason?: string; completed_games?: number; required_games?: number }>({ path: '/api/betting/generate', token: session.access_token, body: { gameId: game.id }, timeoutMs: 30000 });
      if (betting.generated) followup = ' Prediction markets were prepared automatically.';
      else if (betting.reason === 'cold_start') followup = ` Predictions remain locked at ${betting.completed_games || 0}/${betting.required_games || 3} completed games.`;
    } catch { followup = ' The lineup is saved; automatic prediction setup needs another attempt.'; }
    if (savedLineups.length !== 10) {
      try { await apiRequest({ path: '/api/push/admin-event', token: session.access_token, body: { gameId: game.id, event: 'lineups_ready' } }); }
      catch { followup += ' Notification delivery continues separately.'; }
    }
    setBusy(null);
    setTone('success');
    setMessage(`Lineup saved.${followup}`);
    await load();
  }

  function updateStat(playerId: string, field: keyof StatDraft, value: string) {
    const cleaned = value.replace(/[^0-9]/g, '').slice(0, 2);
    setStatDraft(current => ({ ...current, [playerId]: { ...(current[playerId] || { goals: '0', assists: '0', saves: '0', own_goals: '0' }), [field]: cleaned } }));
  }

  async function saveStats() {
    if (!game || savedLineups.length !== 10) return;
    const submitted = savedLineups.map(lineup => ({ player_id: lineup.player_id, team: lineup.team, role: lineup.role, goals: Number(statDraft[lineup.player_id]?.goals || 0), assists: Number(statDraft[lineup.player_id]?.assists || 0), saves: Number(statDraft[lineup.player_id]?.saves || 0), own_goals: Number(statDraft[lineup.player_id]?.own_goals || 0) }));
    setBusy('stats');
    const supabase = getSupabaseClient();
    const statsResult = await supabase.rpc('save_game_stat_grid', { target_game_id: game.id, submitted_stats: submitted });
    const potmResult = statsResult.error ? null : await supabase.from('games').update({ potm_player_id: potm }).eq('league_id', game.league_id).eq('id', game.id);
    setBusy(null);
    if (statsResult.error || potmResult?.error) {
      setTone('error');
      setMessage(friendlyMobileError(statsResult.error || potmResult?.error, 'Match statistics could not be saved.'));
      return;
    }
    setTone('success');
    setMessage('Match statistics saved. Review them before publishing the final result.');
    await load();
  }

  async function changeStatus(status: 'live' | 'final') {
    if (!game || !session) return;
    setBusy(status);
    const result = await getSupabaseClient().rpc('set_game_status', { target_game_id: game.id, new_status: status });
    if (result.error) {
      setBusy(null);
      setTone('error');
      setMessage(friendlyMobileError(result.error, `The match could not be marked ${status}.`));
      return;
    }
    if (status === 'final') {
      try { await apiRequest({ path: '/api/push/admin-event', token: session.access_token, body: { gameId: game.id, event: 'result_finalized' } }); }
      catch { /* Result is authoritative even if delivery needs retry. */ }
    }
    setBusy(null);
    setTone('success');
    setMessage(status === 'live' ? 'Match is live.' : 'Final result published and competitions settled.');
    await load();
  }

  if (leagueLoading || switching || loading || !league) return <Loading label="Loading match controls..." />;
  if (!allowed || !game) return <Screen><Message tone="error">{allowed ? 'This match is not available.' : 'League admin access is required.'}</Message></Screen>;
  return <Screen><LeagueHeader league={league} /><Button variant="secondary" onPress={() => router.back()}>← All admin games</Button><Eyebrow>{game.status.toUpperCase()}</Eyebrow><Title>Match control.</Title><Body>{formatMatchTime(game.game_date)} · changes apply only to {league.name}.</Body>{message ? <Message tone={tone}>{message}</Message> : null}<Card><Text style={styles.sectionTitle}>1. Set both lineups</Text><ModeControl team="A" mode={teamAMode} onChange={mode => setMode('A', mode)} /><ModeControl team="B" mode={teamBMode} onChange={mode => setMode('B', mode)} /><View style={styles.counterRow}><Text style={styles.counter}>Team A {teamA.length}/5</Text><Text style={styles.counter}>Team B {teamB.length}/5</Text></View>{players.map(player => { const value = assignments[player.id]; return <View key={player.id} style={styles.playerAssign}><View style={styles.playerCopy}><Text style={styles.playerName}>{player.name}</Text><Text style={styles.detail}>{player.default_position === 'goalkeeper' ? 'Default GK' : 'Outfield'}{value ? ` · Team ${value.team} ${value.role === 'goalkeeper' ? 'GK' : 'OUT'}` : ''}</Text></View><View style={styles.assignActions}>{(['A', 'B'] as TeamCode[]).map(team => <Pressable key={team} onPress={() => assign(player, team)} style={[styles.teamButton, value?.team === team && styles.teamButtonOn]}><Text style={[styles.teamButtonText, value?.team === team && styles.teamButtonTextOn]}>{team}</Text></Pressable>)}{value && (value.team === 'A' ? teamAMode : teamBMode) === 'fixed' ? <Pressable onPress={() => setKeeper(player.id, value.team)} style={[styles.gkButton, value.role === 'goalkeeper' && styles.gkButtonOn]}><Text style={styles.gkText}>GK</Text></Pressable> : null}</View></View>; })}<Button onPress={saveLineup} disabled={!!busy || game.status === 'final'}>{busy === 'lineup' ? 'Saving lineup...' : game.status === 'final' ? 'Final match locked' : 'Save and publish lineup'}</Button></Card>{savedLineups.length === 10 ? <Card><Text style={styles.sectionTitle}>2. Record match statistics</Text><Text style={styles.detail}>Enter totals for every player. Zero is valid. Choose Player of the Match before publishing.</Text>{savedLineups.map(lineup => { const player = players.find(item => item.id === lineup.player_id); const row = statDraft[lineup.player_id] || { goals: '0', assists: '0', saves: '0', own_goals: '0' }; return <View key={lineup.id} style={styles.statBlock}><View style={styles.statHeading}><Text style={styles.playerName}>{player?.name || 'Player'}</Text><Pressable onPress={() => setPotm(potm === lineup.player_id ? null : lineup.player_id)} style={[styles.potm, potm === lineup.player_id && styles.potmOn]}><Text style={[styles.potmText, potm === lineup.player_id && styles.potmTextOn]}>POTM</Text></Pressable></View><View style={styles.statFields}><View style={styles.statField}><Field label="Goals" value={row.goals} onChangeText={value => updateStat(lineup.player_id, 'goals', value)} keyboardType="number-pad" /></View><View style={styles.statField}><Field label="Assists" value={row.assists} onChangeText={value => updateStat(lineup.player_id, 'assists', value)} keyboardType="number-pad" /></View><View style={styles.statField}><Field label="Saves" value={row.saves} onChangeText={value => updateStat(lineup.player_id, 'saves', value)} keyboardType="number-pad" /></View><View style={styles.statField}><Field label="Own goals" value={row.own_goals} onChangeText={value => updateStat(lineup.player_id, 'own_goals', value)} keyboardType="number-pad" /></View></View></View>; })}<Button onPress={saveStats} disabled={!!busy || game.status === 'final'}>{busy === 'stats' ? 'Saving statistics...' : 'Save statistics'}</Button></Card> : null}<Card><Text style={styles.sectionTitle}>3. Match status</Text>{game.status === 'draft' || game.status === 'upcoming' ? <Button onPress={() => changeStatus('live')} disabled={!!busy || savedLineups.length !== 10}>{busy === 'live' ? 'Starting...' : 'Start live match'}</Button> : null}{game.status === 'live' ? <Button onPress={() => Alert.alert('Publish final result?', 'This settles Fantasy and prediction results. Check every statistic first.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Publish final', style: 'destructive', onPress: () => void changeStatus('final') }])} disabled={!!busy}>{busy === 'final' ? 'Publishing...' : 'Publish final result'}</Button> : null}{game.status === 'final' ? <Message tone="success">This match is final. Corrections remain web-first during the mobile beta because reopening settled competitions needs an audit reason.</Message> : null}</Card></Screen>;
}

function ModeControl({ team, mode, onChange }: { team: TeamCode; mode: GoalkeeperMode; onChange: (mode: GoalkeeperMode) => void }) { return <View style={styles.modeRow}><Text style={styles.modeLabel}>Team {team} goalkeeper</Text><View style={styles.modeOptions}>{(['fixed', 'rotating'] as const).map(item => <Pressable key={item} onPress={() => onChange(item)} style={[styles.modeButton, mode === item && styles.modeButtonOn]}><Text style={[styles.modeText, mode === item && styles.modeTextOn]}>{item}</Text></Pressable>)}</View></View>; }

const styles = StyleSheet.create({ sectionTitle: { color: colors.chalk, fontSize: 20, fontWeight: '900' }, detail: { marginTop: 3, color: colors.chalkMuted, fontSize: 10, lineHeight: 15 }, modeRow: { gap: spacing.sm }, modeLabel: { color: colors.chalk, fontSize: 12, fontWeight: '800' }, modeOptions: { flexDirection: 'row', padding: 3, borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.sm }, modeButton: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8 }, modeButtonOn: { backgroundColor: colors.gold }, modeText: { color: colors.chalkMuted, fontSize: 11, fontWeight: '800', textTransform: 'capitalize' }, modeTextOn: { color: colors.ink900 }, counterRow: { flexDirection: 'row', justifyContent: 'space-between' }, counter: { color: colors.gold, fontSize: 11, fontWeight: '900' }, playerAssign: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldMuted }, playerCopy: { flex: 1 }, playerName: { color: colors.chalk, fontSize: 12, fontWeight: '800' }, assignActions: { flexDirection: 'row', gap: 4 }, teamButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: 8 }, teamButtonOn: { backgroundColor: colors.gold }, teamButtonText: { color: colors.gold, fontWeight: '900' }, teamButtonTextOn: { color: colors.ink900 }, gkButton: { width: 38, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.turf400, borderRadius: 8 }, gkButtonOn: { backgroundColor: colors.turf400 }, gkText: { color: colors.chalk, fontSize: 9, fontWeight: '900' }, statBlock: { borderTopWidth: 1, borderTopColor: colors.goldMuted, paddingTop: spacing.sm }, statHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, potm: { borderWidth: 1, borderColor: colors.goldMuted, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 5 }, potmOn: { backgroundColor: colors.gold }, potmText: { color: colors.gold, fontSize: 9, fontWeight: '900' }, potmTextOn: { color: colors.ink900 }, statFields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, statField: { width: '48.5%' } });
