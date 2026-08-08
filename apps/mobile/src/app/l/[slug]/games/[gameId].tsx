import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { FootballPitch, PitchPlayer, type PitchSlot } from '@/components/FootballPitch';
import { GameBettingPanel } from '@/components/GameBettingPanel';
import { LeagueHeader } from '@/components/LeagueChrome';
import { TeamCrest } from '@/components/TeamCrest';
import { Button, Card, Icon, Loading, Message, Pill, Screen } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { calculateScore, fantasyPoints, formatMatchTime } from '@/lib/scoring';
import { getSupabaseClient } from '@/lib/supabase';
import type { Game, GameLineup, GamePlayerStat, MatchEvent, Player, PlayerPosition, TeamCode } from '@/lib/types';

type MatchTab = 'lineups' | 'stats' | 'fantasy' | 'bets';
const tabs: { id: MatchTab; label: string }[] = [
  { id: 'lineups', label: 'Lineups' }, { id: 'stats', label: 'Stats' }, { id: 'fantasy', label: 'Fantasy' }, { id: 'bets', label: 'Bets' },
];

export default function GameDetailScreen() {
  const router = useRouter();
  const { slug, gameId } = useLocalSearchParams<{ slug: string; gameId: string }>();
  const { league, loading: leagueLoading, switching } = useScopedLeague(slug);
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [lineups, setLineups] = useState<GameLineup[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [stats, setStats] = useState<GamePlayerStat[]>([]);
  const [tab, setTab] = useState<MatchTab>('lineups');
  const [now] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!league || !gameId) return;
    setLoading(true);
    const supabase = getSupabaseClient();
    const responses = await Promise.all([
      supabase.from('games').select('*').eq('league_id', league.id).eq('id', gameId).maybeSingle(),
      supabase.from('players').select('*').eq('league_id', league.id),
      supabase.from('game_lineups').select('*').eq('league_id', league.id).eq('game_id', gameId).order('slot_index'),
      supabase.from('events').select('*').eq('league_id', league.id).eq('game_id', gameId).order('created_at'),
      supabase.from('game_player_stats').select('*').eq('league_id', league.id).eq('game_id', gameId),
    ]);
    setLoading(false);
    const failure = responses.find(item => item.error)?.error;
    if (failure) return setError(friendlyMobileError(failure, 'Match details could not be loaded.'));
    const nextGame = (responses[0].data || null) as Game | null;
    setGame(nextGame);
    setPlayers((responses[1].data || []) as Player[]);
    setLineups((responses[2].data || []) as GameLineup[]);
    setEvents((responses[3].data || []) as MatchEvent[]);
    setStats((responses[4].data || []) as GamePlayerStat[]);
    if (nextGame?.status === 'final') setTab('stats');
  }, [gameId, league]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const score = useMemo(() => calculateScore(events, lineups, stats), [events, lineups, stats]);

  if (leagueLoading || switching || loading || !league) return <Loading label="Loading match details..." />;
  if (!game) return <Screen><Message tone="error">{error || 'This match is not available.'}</Message><Button onPress={() => router.back()}>Back to games</Button></Screen>;

  return (
    <Screen compact>
      <LeagueHeader league={league} />
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>← All games</Text></Pressable>
      <MatchHero game={game} score={score} ready={lineups.length >= 10} players={players} now={now} />
      <View accessibilityRole="tablist" style={styles.tabs}>{tabs.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} onPress={() => setTab(item.id)} style={[styles.tab, tab === item.id && styles.tabActive]}><Text style={[styles.tabText, tab === item.id && styles.tabTextActive]}>{item.label}</Text>{tab === item.id ? <View style={styles.tabLine} /> : null}</Pressable>)}</View>
      {error ? <Message tone="error">{error}</Message> : null}
      {tab === 'lineups' ? <MatchPitch game={game} lineups={lineups} players={players} onPlayer={playerId => router.push(`/l/${league.slug}/players/${playerId}`)} /> : null}
      {tab === 'stats' ? <SparseMatchStats game={game} lineups={lineups} events={events} stats={stats} players={players} onPlayer={playerId => router.push(`/l/${league.slug}/players/${playerId}`)} /> : null}
      {tab === 'fantasy' ? <MatchFantasy game={game} lineups={lineups} events={events} stats={stats} players={players} onPlayer={playerId => router.push(`/l/${league.slug}/players/${playerId}`)} onOpen={() => router.push(`/l/${league.slug}/fantasy`)} /> : null}
      {tab === 'bets' ? league.betting_enabled ? <GameBettingPanel game={game} leagueId={league.id} lineups={lineups} /> : <EmptyPredictions /> : null}
    </Screen>
  );
}

function EmptyPredictions() { return <Card style={styles.centerCard}><Icon name={{ ios: 'chart.bar.fill', android: 'query_stats' }} color={colors.gold} size={30} /><Text style={styles.centerTitle}>PREDICTIONS ARE OFF</Text><Text style={styles.centerText}>This league is playing without virtual prediction markets.</Text></Card>; }

function MatchHero({ game, score, ready, players, now }: { game: Game; score: Record<TeamCode, number>; ready: boolean; players: Player[]; now: number }) {
  const showScore = game.status === 'live' || game.status === 'final';
  const pastDraft = game.status === 'draft' && new Date(game.game_date).getTime() < now;
  const label = game.status === 'final' ? 'FINAL RESULT' : game.status === 'live' ? 'LIVE MATCH' : pastDraft ? 'AWAITING UPDATE' : 'NEXT MATCH';
  const state = game.status === 'final' ? 'FULL TIME' : game.status === 'live' ? 'LIVE' : pastDraft ? ready ? 'AWAITING RESULT' : 'SETUP INCOMPLETE' : 'UPCOMING';
  const potm = players.find(player => player.id === game.potm_player_id)?.name;
  return (
    <View style={styles.hero}>
      <View pointerEvents="none" style={styles.heroGlow} /><View pointerEvents="none" style={styles.heroGrass} /><View pointerEvents="none" style={styles.heroHalf} /><View pointerEvents="none" style={styles.heroCircle} />
      <View style={styles.heroTop}><Text style={[styles.heroLabel, pastDraft && styles.heroLabelWaiting]}>{label}</Text><Pill tone={game.status === 'live' ? 'red' : pastDraft ? 'gold' : 'neutral'}>{state}</Pill></View>
      <View style={styles.versus}>
        <HeroTeam game={game} team="A" />
        <View style={styles.scoreWrap}>{showScore ? <Text style={styles.score}>{score.A}<Text style={styles.scoreDash}> – </Text>{score.B}</Text> : <Text style={styles.vs}>VS</Text>}<View style={styles.scoreRule} /></View>
        <HeroTeam game={game} team="B" />
      </View>
      <View style={styles.dateRow}><Icon name={{ ios: 'calendar', android: 'calendar_month' }} size={15} /><Text style={styles.dateText}>{formatMatchTime(game.game_date)}</Text></View>
      <View style={[styles.ready, ready ? styles.readyOn : styles.readyOff]}><Icon name={ready ? { ios: 'checkmark.circle.fill', android: 'check_circle' } : { ios: 'circle.dashed', android: 'pending' }} size={15} color={ready ? colors.turf400 : colors.chalkMuted} /><Text style={[styles.readyText, ready && styles.readyTextOn]}>{potm && game.status === 'final' ? `POTM · ${potm}` : pastDraft ? ready ? 'Result not finalized' : 'Lineups were not completed' : ready ? 'Lineups ready' : 'Lineups not ready yet'}</Text></View>
    </View>
  );
}

function HeroTeam({ game, team }: { game: Game; team: TeamCode }) {
  return <View style={styles.heroTeam}><TeamCrest gameId={game.id} team={team} size={74} /><Text style={styles.heroTeamName}>TEAM {team}</Text></View>;
}

function MatchPitch({ game, lineups, players, onPlayer }: { game: Game; lineups: GameLineup[]; players: Player[]; onPlayer: (id: string) => void }) {
  return (
    <FootballPitch tall label="Full match lineup pitch">
      <PitchTeamLabel game={game} team="A" />
      <PitchTeamLabel game={game} team="B" />
      <FormationHalf game={game} team="A" mode={game.team_a_goalkeeper_mode || 'fixed'} lineups={lineups.filter(row => row.team === 'A')} players={players} onPlayer={onPlayer} />
      <FormationHalf game={game} team="B" mode={game.team_b_goalkeeper_mode || 'fixed'} lineups={lineups.filter(row => row.team === 'B')} players={players} onPlayer={onPlayer} />
    </FootballPitch>
  );
}

function PitchTeamLabel({ game, team }: { game: Game; team: TeamCode }) {
  return <View style={[styles.pitchTeamLabel, team === 'A' ? styles.pitchTeamA : styles.pitchTeamB]}><TeamCrest gameId={game.id} team={team} size={33} /><Text style={styles.pitchTeamText}>TEAM {team}</Text></View>;
}

function FormationHalf({ game, team, mode, lineups, players, onPlayer }: { game: Game; team: TeamCode; mode: 'fixed' | 'rotating'; lineups: GameLineup[]; players: Player[]; onPlayer: (id: string) => void }) {
  const ordered = [...lineups].sort((a, b) => (a.slot_index ?? 99) - (b.slot_index ?? 99));
  const keeper = ordered.find(row => row.role === 'goalkeeper');
  const outfield = ordered.filter(row => row.role !== 'goalkeeper');
  const rows = mode === 'fixed' ? [keeper, ...outfield.slice(0, 2), ...outfield.slice(2, 4)] : ordered;
  const fixedA: PitchSlot[] = [{ x: 50, y: 12 }, { x: 28, y: 27 }, { x: 72, y: 27 }, { x: 28, y: 44 }, { x: 72, y: 44 }];
  const fixedB: PitchSlot[] = [{ x: 50, y: 88 }, { x: 28, y: 73 }, { x: 72, y: 73 }, { x: 28, y: 56 }, { x: 72, y: 56 }];
  const rotatingA: PitchSlot[] = [{ x: 32, y: 20 }, { x: 68, y: 20 }, { x: 18, y: 41 }, { x: 50, y: 41 }, { x: 82, y: 41 }];
  const rotatingB: PitchSlot[] = [{ x: 32, y: 80 }, { x: 68, y: 80 }, { x: 18, y: 59 }, { x: 50, y: 59 }, { x: 82, y: 59 }];
  const positions = mode === 'fixed' ? team === 'A' ? fixedA : fixedB : team === 'A' ? rotatingA : rotatingB;
  return <>{positions.map((position, index) => { const row = rows[index]; const player = players.find(item => item.id === row?.player_id); const role: PlayerPosition = mode === 'fixed' && index === 0 ? 'goalkeeper' : 'outfield'; return <PitchPlayer key={row?.id || `${game.id}-${team}-${index}`} x={position.x} y={position.y} name={player?.name || 'TBD'} role={role} team={team} compact empty={!row} onPress={row ? () => onPlayer(row.player_id) : undefined} overlay={<View style={[styles.roleTag, team === 'B' && styles.roleTagB]}><Text style={[styles.roleTagText, team === 'B' && styles.roleTagTextB]}>{role === 'goalkeeper' ? 'GK' : 'OUT'}</Text></View>} />; })}</>;
}

type StatRow = { id: string; name: string; team: TeamCode; role: PlayerPosition; goals: number; assists: number; saves: number; ownGoals: number };

function SparseMatchStats({ game, lineups, events, stats, players, onPlayer }: { game: Game; lineups: GameLineup[]; events: MatchEvent[]; stats: GamePlayerStat[]; players: Player[]; onPlayer: (id: string) => void }) {
  const ids = [...new Set([...lineups.map(row => row.player_id), ...stats.map(row => row.player_id)])];
  const rows = ids.map(id => {
    const player = players.find(item => item.id === id); if (!player) return null;
    const lineup = lineups.find(item => item.player_id === id); const stat = stats.find(item => item.player_id === id);
    const row: StatRow = { id, name: player.name, team: lineup?.team || stat?.team || 'A', role: lineup?.role || stat?.role || 'outfield', goals: events.filter(event => event.event_type === 'goal' && event.player_id === id).length + (stat?.goals || 0), assists: events.filter(event => event.event_type === 'goal' && event.assist_player_id === id).length + (stat?.assists || 0), saves: stat?.saves || 0, ownGoals: events.filter(event => event.event_type === 'own_goal' && event.player_id === id).length + (stat?.own_goals || 0) };
    return row.goals || row.assists || row.saves || row.ownGoals ? row : null;
  }).filter((row): row is StatRow => !!row);
  return <View style={styles.statColumns}>{(['A', 'B'] as TeamCode[]).map(team => <TeamStats key={team} game={game} team={team} rows={rows.filter(row => row.team === team)} onPlayer={onPlayer} />)}</View>;
}

function TeamStats({ game, team, rows, onPlayer }: { game: Game; team: TeamCode; rows: StatRow[]; onPlayer: (id: string) => void }) {
  const ordered = [...rows].sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.saves - a.saves || a.name.localeCompare(b.name));
  return <View style={styles.teamStats}><View style={styles.teamStatsHead}><TeamCrest gameId={game.id} team={team} size={41} /><View><Text style={styles.statsEyebrow}>MATCH STATS</Text><Text style={styles.statsTeam}>TEAM {team}</Text></View></View><View style={styles.statList}>{ordered.map(row => <Pressable key={row.id} onPress={() => onPlayer(row.id)} style={styles.statPlayer}><Text style={styles.statPlayerName}>{row.name}</Text><View style={styles.chips}>{row.goals ? <StatChip value={row.goals} label="G" /> : null}{row.assists ? <StatChip value={row.assists} label="A" /> : null}{row.saves ? <StatChip value={row.saves} label="S" /> : null}{row.ownGoals ? <StatChip value={row.ownGoals} label="OG" warning /> : null}</View></Pressable>)}{!ordered.length ? <Text style={styles.noStats}>No positive stats recorded for Team {team} yet.</Text> : null}</View></View>;
}

function StatChip({ value, label, warning }: { value: number; label: string; warning?: boolean }) { return <View style={[styles.chip, warning && styles.chipWarning]}><Text style={[styles.chipText, warning && styles.chipTextWarning]}>{value} {label}</Text></View>; }

function MatchFantasy({ game, lineups, events, stats, players, onPlayer, onOpen }: { game: Game; lineups: GameLineup[]; events: MatchEvent[]; stats: GamePlayerStat[]; players: Player[]; onPlayer: (id: string) => void; onOpen: () => void }) {
  if (game.status !== 'final') return <Card style={styles.centerCard}><Icon name={{ ios: 'crown.fill', android: 'workspace_premium' }} color={colors.gold} size={30} /><Text style={styles.centerTitle}>FANTASY POINTS AFTER FULL TIME</Text><Text style={styles.centerText}>Fantasy points will be shown after the game ends.</Text><View style={styles.fullButton}><Button variant="secondary" onPress={onOpen}>Open Fantasy</Button></View></Card>;
  const eligible = players.filter(player => player.active && player.fantasy_eligible !== false && !(player.fantasy_eligible == null && player.competition_eligible === false));
  const ids = [...new Set([...lineups.map(row => row.player_id), ...stats.map(row => row.player_id)])].filter(id => eligible.some(player => player.id === id));
  const rows = ids.map(id => { const player = players.find(item => item.id === id)!; const lineup = lineups.find(item => item.player_id === id); return { id, name: player.name, team: lineup?.team, role: lineup?.role || 'outfield', points: fantasyPoints({ game, player, pick: { is_captain: false }, lineups, events, stats }) }; }).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return <Card style={styles.fantasyCard}><Text style={styles.centerTitle}>FANTASY POINTS</Text><Text style={styles.listHint}>Highest to lowest</Text>{rows.map((row, index) => <Pressable key={row.id} onPress={() => onPlayer(row.id)} style={styles.fantasyRow}><Text style={styles.fantasyRank}>#{index + 1}</Text><View style={styles.fantasyCopy}><Text style={styles.fantasyName}>{row.name}</Text><Text style={styles.fantasyMeta}>TEAM {row.team || '—'} · {row.role === 'goalkeeper' ? 'GK' : 'OUT'}</Text></View><Text style={styles.fantasyPoints}>{row.points}</Text></Pressable>)}{!rows.length ? <Text style={styles.noStats}>No eligible fantasy players were recorded for this game.</Text> : null}</Card>;
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }, backText: { color: colors.gold, fontFamily: fonts.sansBold, fontSize: 12 },
  hero: { position: 'relative', overflow: 'hidden', minHeight: 250, borderWidth: 1, borderColor: colors.goldBorderStrong, borderRadius: 26, backgroundColor: colors.ink850, padding: spacing.md },
  heroGlow: { position: 'absolute', right: -40, top: -48, width: 128, height: 128, borderRadius: 64, backgroundColor: 'rgba(247,183,51,0.08)' },
  heroGrass: { position: 'absolute', left: -30, right: 0, bottom: -30, height: 135, backgroundColor: 'rgba(49,185,78,0.055)', transform: [{ rotate: '-5deg' }] },
  heroHalf: { position: 'absolute', left: '50%', bottom: 0, height: 110, borderLeftWidth: 1, borderLeftColor: 'rgba(245,242,232,0.055)' },
  heroCircle: { position: 'absolute', left: '50%', bottom: 20, width: 64, height: 64, marginLeft: -32, borderWidth: 1, borderColor: 'rgba(245,242,232,0.055)', borderRadius: 32 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, heroLabel: { color: colors.turf400, fontFamily: fonts.sansBlack, fontSize: 9, letterSpacing: 1.7 }, heroLabelWaiting: { color: '#FDE68A' },
  versus: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }, heroTeam: { width: 95, alignItems: 'center', gap: 3 }, heroTeamName: { color: colors.chalk, fontFamily: fonts.display, fontSize: 20 },
  scoreWrap: { alignItems: 'center' }, score: { color: colors.chalk, fontFamily: fonts.monoBold, fontSize: 31 }, scoreDash: { color: colors.chalk30 }, vs: { color: colors.chalk45, fontFamily: fonts.displayBold, fontSize: 31 }, scoreRule: { marginTop: 3, width: 28, borderTopWidth: 1, borderTopColor: colors.gold },
  dateRow: { marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, dateText: { color: colors.chalk72, fontFamily: fonts.sansMedium, fontSize: 11 },
  ready: { alignSelf: 'center', marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 7 }, readyOn: { borderColor: 'rgba(49,185,78,0.2)', backgroundColor: colors.successSoft }, readyOff: { borderColor: 'rgba(245,242,232,0.09)', backgroundColor: 'rgba(0,0,0,0.2)' }, readyText: { color: colors.chalkMuted, fontFamily: fonts.sansBold, fontSize: 9 }, readyTextOn: { color: colors.turf100 },
  tabs: { flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 19, backgroundColor: colors.ink850, padding: 4 }, tab: { position: 'relative', flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14 }, tabActive: { backgroundColor: colors.goldSoft }, tabText: { color: colors.chalk45, fontFamily: fonts.sansExtraBold, fontSize: 10 }, tabTextActive: { color: colors.gold }, tabLine: { position: 'absolute', left: 12, right: 12, bottom: 4, height: 2, borderRadius: 1, backgroundColor: colors.gold },
  pitchTeamLabel: { position: 'absolute', zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(239,255,237,0.1)', borderRadius: radius.sm, backgroundColor: 'rgba(17,17,15,0.78)', paddingHorizontal: 8, paddingVertical: 5 }, pitchTeamA: { left: 19, top: 19 }, pitchTeamB: { right: 19, bottom: 19, flexDirection: 'row-reverse' }, pitchTeamText: { color: '#EFFFF1', fontFamily: fonts.sansBlack, fontSize: 8, letterSpacing: 1 },
  roleTag: { position: 'absolute', right: -5, top: 1, borderWidth: 1, borderColor: 'rgba(49,185,78,0.25)', borderRadius: 5, backgroundColor: 'rgba(17,17,15,0.92)', paddingHorizontal: 4, paddingVertical: 2 }, roleTagB: { borderColor: 'rgba(248,113,113,0.25)' }, roleTagText: { color: colors.turf100, fontFamily: fonts.sansBlack, fontSize: 6 }, roleTagTextB: { color: '#FECACA' },
  statColumns: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, teamStats: { flex: 1, overflow: 'hidden', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 21, backgroundColor: colors.ink850 }, teamStatsHead: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 7, borderBottomWidth: 1, borderBottomColor: colors.goldBorder, padding: 10 }, statsEyebrow: { color: colors.chalk45, fontFamily: fonts.sansBlack, fontSize: 7, letterSpacing: 1 }, statsTeam: { color: colors.chalk, fontFamily: fonts.display, fontSize: 19 }, statList: { padding: 8, gap: 7 }, statPlayer: { borderWidth: 1, borderColor: 'rgba(245,242,232,0.06)', borderRadius: radius.sm, backgroundColor: 'rgba(0,0,0,0.2)', padding: 9 }, statPlayerName: { color: colors.chalk, fontFamily: fonts.sansBold, fontSize: 10 }, chips: { marginTop: 7, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, chip: { borderRadius: 7, backgroundColor: colors.successSoft, paddingHorizontal: 6, paddingVertical: 4 }, chipWarning: { backgroundColor: colors.dangerSoft }, chipText: { color: colors.turf100, fontFamily: fonts.monoBold, fontSize: 8 }, chipTextWarning: { color: '#FCA5A5' }, noStats: { color: colors.chalk45, fontFamily: fonts.sans, fontSize: 9, lineHeight: 14, textAlign: 'center', paddingVertical: spacing.lg },
  centerCard: { alignItems: 'center', paddingVertical: spacing.xxl }, centerTitle: { color: colors.chalk, fontFamily: fonts.displayBold, fontSize: 25, textAlign: 'center' }, centerText: { maxWidth: 390, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, textAlign: 'center' }, fullButton: { alignSelf: 'stretch', marginTop: spacing.sm },
  fantasyCard: { padding: 0, overflow: 'hidden', gap: 0 }, listHint: { color: colors.chalk45, fontFamily: fonts.sans, fontSize: 9, paddingHorizontal: spacing.md, paddingBottom: spacing.sm }, fantasyRow: { minHeight: 61, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.goldBorder, paddingHorizontal: spacing.md }, fantasyRank: { width: 27, color: colors.chalk45, fontFamily: fonts.mono, fontSize: 9 }, fantasyCopy: { flex: 1 }, fantasyName: { color: colors.chalk, fontFamily: fonts.sansSemiBold, fontSize: 12 }, fantasyMeta: { marginTop: 2, color: colors.chalk45, fontFamily: fonts.sansBold, fontSize: 7, letterSpacing: 0.7 }, fantasyPoints: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 19 },
});
