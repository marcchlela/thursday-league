import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LeagueHeader, LeagueNav } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { fantasyPoints, formatMatchTime } from '@/lib/scoring';
import { getSupabaseClient } from '@/lib/supabase';
import type { FantasyPick, FantasySquad, Game, GameLineup, GamePlayerStat, MatchEvent, Player, Profile, TeamCode } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type Tab = 'team' | 'standings' | 'history';
type DraftPick = { player_id: string; role: 'goalkeeper' | 'outfield'; is_captain: boolean; slot_index: number };

export default function FantasyScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user } = useAuth();
  const { league, membership, loading: leagueLoading, switching } = useScopedLeague(slug);
  const [tab, setTab] = useState<Tab>('team');
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [lineups, setLineups] = useState<GameLineup[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [stats, setStats] = useState<GamePlayerStat[]>([]);
  const [squads, setSquads] = useState<FantasySquad[]>([]);
  const [picks, setPicks] = useState<FantasyPick[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [draft, setDraft] = useState<DraftPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'error' | 'success'>('error');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!league || !user) return;
    setLoading(true);
    const supabase = getSupabaseClient();
    const responses = await Promise.all([
      supabase.from('players').select('*').eq('league_id', league.id).order('name'),
      supabase.from('games').select('*').eq('league_id', league.id).order('game_date'),
      supabase.from('game_lineups').select('*').eq('league_id', league.id),
      supabase.from('events').select('*').eq('league_id', league.id),
      supabase.from('game_player_stats').select('*').eq('league_id', league.id),
      supabase.from('fantasy_squads').select('*').eq('league_id', league.id),
      supabase.from('fantasy_picks').select('*').eq('league_id', league.id).order('slot_index'),
      supabase.rpc('get_league_member_directory', { target_league_id: league.id }),
    ]);
    setLoading(false);
    const failure = responses.find(item => item.error)?.error;
    if (failure) {
      setMessageTone('error');
      setMessage(friendlyMobileError(failure, 'Fantasy could not be loaded.'));
      return;
    }
    const nextPlayers = (responses[0].data || []) as Player[];
    const nextGames = (responses[1].data || []) as Game[];
    const nextSquads = (responses[5].data || []) as FantasySquad[];
    const nextPicks = (responses[6].data || []) as FantasyPick[];
    setPlayers(nextPlayers);
    setGames(nextGames);
    setLineups((responses[2].data || []) as GameLineup[]);
    setEvents((responses[3].data || []) as MatchEvent[]);
    setStats((responses[4].data || []) as GamePlayerStat[]);
    setSquads(nextSquads);
    setPicks(nextPicks);
    setProfiles((responses[7].data || []) as Profile[]);
    const active = activeFantasyGame(nextGames);
    const ownSquad = active ? nextSquads.find(item => item.game_id === active.id && item.user_id === user.id) : null;
    setDraft(ownSquad ? nextPicks.filter(item => item.squad_id === ownSquad.id).sort((a, b) => a.slot_index - b.slot_index).map(item => ({ player_id: item.player_id, role: item.role, is_captain: item.is_captain, slot_index: item.slot_index })) : []);
  }, [league, user]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const game = useMemo(() => activeFantasyGame(games, now), [games, now]);
  const gameLineups = useMemo(() => game ? lineups.filter(item => item.game_id === game.id) : [], [game, lineups]);
  const locked = !game || game.status === 'live' || game.status === 'final' || now >= new Date(game.game_date).getTime();
  const eligibleRows = gameLineups.filter(lineup => {
    const player = players.find(item => item.id === lineup.player_id);
    return player && player.active && player.fantasy_eligible !== false && !(player.fantasy_eligible == null && player.competition_eligible === false);
  });

  function togglePlayer(lineup: GameLineup) {
    if (locked) return;
    setMessage(null);
    setDraft(current => {
      if (current.some(item => item.player_id === lineup.player_id)) return current.filter(item => item.player_id !== lineup.player_id).map((item, index) => ({ ...item, slot_index: index }));
      if (current.length >= 5) {
        setMessageTone('error');
        setMessage('Your Fantasy team can contain exactly five players.');
        return current;
      }
      return [...current, { player_id: lineup.player_id, role: lineup.role, is_captain: false, slot_index: current.length }];
    });
  }

  function captain(playerId: string) {
    if (locked) return;
    setDraft(current => current.map(item => ({ ...item, is_captain: item.player_id === playerId })));
  }

  async function save() {
    if (!game) return;
    if (draft.length !== 5) return setMessage('Pick exactly five players.');
    if (draft.filter(item => item.is_captain).length !== 1) return setMessage('Choose one captain.');
    const eligibleKeepers = eligibleRows.filter(item => item.role === 'goalkeeper').length;
    if (eligibleKeepers >= 2 && draft.filter(item => item.role === 'goalkeeper').length !== 1) return setMessage('Choose exactly one goalkeeper.');
    setSaving(true);
    setMessage(null);
    const result = await getSupabaseClient().rpc('save_fantasy_squad', { target_game_id: game.id, submitted_picks: draft });
    setSaving(false);
    if (result.error) {
      setMessageTone('error');
      setMessage(friendlyMobileError(result.error, 'Your Fantasy team could not be saved.'));
      return;
    }
    setMessageTone('success');
    setMessage('Fantasy team saved. You can change it until kickoff.');
    await load();
  }

  if (leagueLoading || switching || !league) return <Loading label="Loading Fantasy..." />;
  if (!league.fantasy_enabled) return <Screen><LeagueHeader league={league} /><LeagueNav league={league} /><Message>Fantasy is turned off for this league.</Message></Screen>;
  const board = fantasyLeaderboard({ games, profiles, squads, picks, players, lineups, events, stats });

  const history = [...games].filter(item => item.status === 'final').sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime());
  return <Screen><LeagueHeader league={league} /><LeagueNav league={league} /><View style={styles.playSwitch}><Pressable accessibilityRole="tab" accessibilityState={{ selected: true }} style={[styles.playTab, styles.playTabActive]}><Text style={styles.playTabActiveText}>Fantasy</Text></Pressable>{league.betting_enabled ? <Pressable accessibilityRole="tab" onPress={() => router.push(`/l/${league.slug}/bets`)} style={styles.playTab}><Text style={styles.playTabText}>Predictions</Text></Pressable> : null}</View><Eyebrow>FANTASY FIVE</Eyebrow><Title>{tab === 'team' ? 'Set your team.' : tab === 'standings' ? 'Standings.' : 'History.'}</Title><Body>{tab === 'team' ? 'Pick five from both lineups and choose one 2x captain.' : tab === 'standings' ? 'Points from every completed matchweek in this league.' : 'Your saved squads and points from completed matchweeks.'}</Body><View style={styles.tabs}>{(['team', 'standings', 'history'] as const).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}><Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item === 'team' ? 'Set team' : item === 'standings' ? 'Table' : 'History'}</Text></Pressable>)}</View>{message ? <Message tone={messageTone}>{message}</Message> : null}{loading ? <Card><Text style={styles.muted}>Loading Fantasy...</Text></Card> : tab === 'team' ? !game ? <Card><Text style={styles.emptyTitle}>No Fantasy game open</Text><Text style={styles.muted}>{membership?.role === 'owner' || membership?.role === 'admin' ? 'Schedule a game and save both lineups from League Admin.' : 'A league admin has not opened the next matchweek yet.'}</Text></Card> : <><Card><Text style={styles.gameDate}>{formatMatchTime(game.game_date)}</Text><Text style={styles.gameStatus}>{locked ? 'Picks locked' : draft.length === 5 ? '5/5 selected' : `${draft.length}/5 selected`}</Text></Card>{gameLineups.length ? <View style={styles.teamColumns}>{(['A', 'B'] as TeamCode[]).map(team => <Card key={team} style={styles.teamCard}><View style={styles.teamHeading}><View style={styles.crest}><Text style={styles.crestText}>{team}</Text></View><Text style={styles.teamTitle}>Team {team}</Text></View>{eligibleRows.filter(item => item.team === team).map(lineup => { const player = players.find(item => item.id === lineup.player_id); if (!player) return null; const selected = draft.find(item => item.player_id === player.id); return <View key={lineup.id} style={[styles.pickRow, selected && styles.pickSelected]}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!selected }} onPress={() => togglePlayer(lineup)} style={styles.pickMain}><View style={[styles.checkbox, selected && styles.checkboxOn]}><Text style={styles.checkText}>{selected ? '✓' : ''}</Text></View><View style={styles.pickCopy}><Text style={styles.pickName}>{player.name}</Text><Text style={styles.position}>{lineup.role === 'goalkeeper' ? 'Goalkeeper' : 'Outfield'}</Text></View></Pressable>{selected ? <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected.is_captain }} onPress={() => captain(player.id)} style={[styles.captain, selected.is_captain && styles.captainOn]}><Text style={[styles.captainText, selected.is_captain && styles.captainTextOn]}>{selected.is_captain ? '2x' : 'C'}</Text></Pressable> : null}</View>; })}</Card>)}</View> : <Card><Text style={styles.emptyTitle}>Lineups pending</Text><Text style={styles.muted}>Fantasy selection opens when both match lineups are saved.</Text></Card>}<Button onPress={save} disabled={locked || saving || draft.length !== 5}>{saving ? 'Saving...' : locked ? 'Picks locked' : 'Save Fantasy team'}</Button></> : tab === 'standings' ? <Card><Text style={styles.boardTitle}>Fantasy table</Text>{board.length ? board.map(row => <View key={row.userId} style={[styles.boardRow, row.userId === user?.id && styles.boardMe]}><Text style={styles.rank}>#{row.rank}</Text><Text style={styles.boardName}>{row.username}{row.userId === user?.id ? ' · you' : ''}</Text><Text style={styles.points}>{row.points} pts</Text></View>) : <Text style={styles.muted}>No Fantasy points have been recorded yet.</Text>}</Card> : <Card><Text style={styles.boardTitle}>Completed matchweeks</Text>{history.length ? history.map(item => { const personal = user ? weeklyFantasyResult(item, user.id, squads, picks, players, lineups, events, stats) : null; return <View key={item.id} style={styles.historyRow}><View style={styles.historyCopy}><Text style={styles.historyDate}>{formatMatchTime(item.game_date)}</Text><Text style={styles.muted}>{personal ? `${personal.pickCount}/5 saved players` : 'No squad saved'}</Text></View><Text style={styles.points}>{personal ? `${personal.points} pts` : '—'}</Text></View>; }) : <Text style={styles.muted}>No completed Fantasy matchweeks yet.</Text>}</Card>}<Button variant="secondary" onPress={load}>Refresh Fantasy</Button></Screen>;
}

function activeFantasyGame(games: Game[], now = Date.now()) {
  return [...games].filter(game => game.status === 'draft' && new Date(game.game_date).getTime() > now).sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime())[0]
    || [...games].filter(game => game.status === 'live' || game.status === 'draft').sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime())[0]
    || null;
}

function fantasyLeaderboard({ games, profiles, squads, picks, players, lineups, events, stats }: { games: Game[]; profiles: Profile[]; squads: FantasySquad[]; picks: FantasyPick[]; players: Player[]; lineups: GameLineup[]; events: MatchEvent[]; stats: GamePlayerStat[] }) {
  const totals = new Map(profiles.map(profile => [profile.id, 0]));
  for (const game of games.filter(item => item.status === 'final')) {
    for (const squad of squads.filter(item => item.game_id === game.id)) {
      const points = picks.filter(item => item.squad_id === squad.id).reduce((sum, pick) => {
        const player = players.find(item => item.id === pick.player_id);
        return sum + (player ? fantasyPoints({ game, player, pick, lineups, events, stats }) : 0);
      }, 0);
      totals.set(squad.user_id, (totals.get(squad.user_id) || 0) + points);
    }
  }
  return profiles.map(profile => ({ userId: profile.id, username: profile.username, points: totals.get(profile.id) || 0, rank: 0 })).sort((a, b) => b.points - a.points || a.username.localeCompare(b.username)).map((row, index) => ({ ...row, rank: index + 1 }));
}

function weeklyFantasyResult(game: Game, userId: string, squads: FantasySquad[], picks: FantasyPick[], players: Player[], lineups: GameLineup[], events: MatchEvent[], stats: GamePlayerStat[]) {
  const squad = squads.find(item => item.game_id === game.id && item.user_id === userId);
  if (!squad) return null;
  const squadPicks = picks.filter(item => item.squad_id === squad.id);
  return {
    pickCount: squadPicks.length,
    points: squadPicks.reduce((sum, pick) => {
      const player = players.find(item => item.id === pick.player_id);
      return sum + (player ? fantasyPoints({ game, player, pick, lineups, events, stats }) : 0);
    }, 0),
  };
}

const styles = StyleSheet.create({
  playSwitch: { flexDirection: 'row', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md, padding: 4, backgroundColor: colors.ink850 },
  playTab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  playTabActive: { backgroundColor: colors.ink800 },
  playTabText: { color: colors.chalkMuted, fontWeight: '800' },
  playTabActiveText: { color: colors.gold, fontWeight: '900' },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md },
  tabActive: { backgroundColor: colors.gold },
  tabText: { color: colors.chalkMuted, fontWeight: '800' },
  tabTextActive: { color: colors.ink900 },
  muted: { color: colors.chalkMuted, fontSize: 12, lineHeight: 18 },
  emptyTitle: { color: colors.chalk, fontSize: 18, fontWeight: '900' },
  gameDate: { color: colors.chalk, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  gameStatus: { color: colors.gold, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  teamColumns: { gap: spacing.md },
  teamCard: { padding: spacing.md },
  teamHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  crest: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.sm, backgroundColor: colors.ink800 },
  crestText: { color: colors.gold, fontWeight: '900' },
  teamTitle: { color: colors.chalk, fontSize: 18, fontWeight: '900' },
  pickRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldMuted },
  pickSelected: { backgroundColor: colors.turf900 },
  pickMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  checkbox: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: 7 },
  checkboxOn: { borderColor: colors.turf400, backgroundColor: colors.turf400 },
  checkText: { color: colors.ink900, fontWeight: '900' },
  pickCopy: { flex: 1 },
  pickName: { color: colors.chalk, fontSize: 13, fontWeight: '800' },
  position: { color: colors.chalkMuted, fontSize: 10 },
  captain: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: 18 },
  captainOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  captainText: { color: colors.gold, fontWeight: '900' },
  captainTextOn: { color: colors.ink900 },
  boardTitle: { color: colors.chalk, fontSize: 20, fontWeight: '900' },
  boardRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldMuted },
  boardMe: { backgroundColor: colors.ink800 },
  rank: { width: 34, color: colors.gold, fontSize: 12, fontWeight: '900' },
  boardName: { flex: 1, color: colors.chalk, fontSize: 13, fontWeight: '800' },
  points: { color: colors.gold, fontSize: 15, fontWeight: '900' },
  historyRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldMuted },
  historyCopy: { flex: 1 },
  historyDate: { color: colors.chalk, fontSize: 12, fontWeight: '800' },
});
