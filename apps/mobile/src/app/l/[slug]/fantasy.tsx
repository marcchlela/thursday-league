import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { FantasyPitchPicker, type FantasyDraftPick } from '@/components/FantasyPitchPicker';
import { LeagueHeader, LeagueNav } from '@/components/LeagueChrome';
import { Body, Button, Card, EmptyState, Eyebrow, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { fantasyPoints, formatMatchTime } from '@/lib/scoring';
import { getSupabaseClient } from '@/lib/supabase';
import type { FantasyPick, FantasySquad, Game, GameLineup, GamePlayerStat, MatchEvent, Player, Profile } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type Tab = 'team' | 'standings' | 'history';

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
  const [draft, setDraft] = useState<FantasyDraftPick[]>([]);
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

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const game = useMemo(() => activeFantasyGame(games, now), [games, now]);
  const gameLineups = useMemo(() => game ? lineups.filter(item => item.game_id === game.id) : [], [game, lineups]);
  const locked = !game || game.status === 'live' || game.status === 'final' || now >= new Date(game.game_date).getTime();

  async function save() {
    if (!game) return;
    if (draft.length !== 5) return showError('Pick all five players first.');
    if (draft.filter(item => item.is_captain).length !== 1) return showError('Choose one captain.');
    const eligibleKeepers = gameLineups.filter(item => item.role === 'goalkeeper').length;
    if (eligibleKeepers >= 2 && draft.filter(item => item.role === 'goalkeeper').length !== 1) return showError('Choose exactly one goalkeeper.');
    setSaving(true);
    setMessage(null);
    const result = await getSupabaseClient().rpc('save_fantasy_squad', { target_game_id: game.id, submitted_picks: draft });
    setSaving(false);
    if (result.error) return showError(friendlyMobileError(result.error, 'Your Fantasy team could not be saved.'));
    setMessageTone('success');
    setMessage('Picks saved. You can edit them until kickoff.');
    await load();
  }

  function showError(text: string) {
    setMessageTone('error');
    setMessage(text);
  }

  if (leagueLoading || switching || !league) return <Loading label="Loading Fantasy..." />;
  if (!league.fantasy_enabled) return <Screen><LeagueHeader league={league} /><LeagueNav league={league} /><EmptyState title="Fantasy is off" text="Fantasy is not enabled for this league." /></Screen>;

  const board = fantasyLeaderboard({ games, profiles, squads, picks, players, lineups, events, stats });
  const history = [...games].filter(item => item.status === 'final').sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime());

  return (
    <Screen compact>
      <LeagueHeader league={league} />
      <LeagueNav league={league} />
      <View style={styles.playSwitch}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: true }} style={[styles.playTab, styles.playTabActive]}><Text style={styles.playTabActiveText}>Fantasy</Text></Pressable>
        {league.betting_enabled ? <Pressable accessibilityRole="tab" onPress={() => router.push(`/l/${league.slug}/bets`)} style={styles.playTab}><Text style={styles.playTabText}>Predictions</Text></Pressable> : null}
      </View>

      <View style={styles.intro}>
        <Eyebrow>FANTASY FIVE</Eyebrow>
        <Title>{tab === 'team' ? 'Set your team.' : tab === 'standings' ? 'Standings.' : 'History.'}</Title>
        <Body>{tab === 'team' ? 'Pick five players and choose one 2x captain.' : tab === 'standings' ? 'Points from every completed matchweek.' : 'Your saved squads and points.'}</Body>
      </View>

      <View style={styles.tabs}>
        {(['team', 'standings', 'history'] as const).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}><Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item === 'team' ? 'Set team' : item === 'standings' ? 'Table' : 'History'}</Text></Pressable>)}
      </View>

      {message ? <Message tone={messageTone}>{message}</Message> : null}
      {loading ? <Card><Text style={styles.muted}>Loading Fantasy...</Text></Card> : null}

      {!loading && tab === 'team' ? (
        !game ? <EmptyState title="No Fantasy game open" text={membership?.role === 'owner' || membership?.role === 'admin' ? 'Schedule a game and save both lineups from League Admin.' : 'The next matchweek has not opened yet.'} /> : (
          <>
            <Card style={styles.matchCard}><Text style={styles.matchDate}>{formatMatchTime(game.game_date)}</Text><Text style={styles.matchStatus}>{locked ? 'PICKS LOCKED' : draft.length === 5 ? 'TEAM READY' : 'PICKS OPEN'}</Text></Card>
            {gameLineups.length ? <FantasyPitchPicker gameId={game.id} players={players} lineups={gameLineups} value={draft} onChange={next => { setDraft(next); setMessage(null); }} onSave={save} locked={locked} saving={saving} /> : <EmptyState title="Lineups pending" text="Fantasy selection opens when both match lineups are saved." />}
          </>
        )
      ) : null}

      {!loading && tab === 'standings' ? <Card style={styles.board}><Text style={styles.boardTitle}>FANTASY TABLE</Text>{board.length ? board.map(row => <View key={row.userId} style={[styles.boardRow, row.userId === user?.id && styles.boardMe]}><Text style={styles.rank}>#{row.rank}</Text><Text style={styles.boardName}>{row.username}{row.userId === user?.id ? ' · YOU' : ''}</Text><Text style={styles.points}>{row.points} pts</Text></View>) : <Text style={styles.muted}>No Fantasy points have been recorded yet.</Text>}</Card> : null}

      {!loading && tab === 'history' ? <Card style={styles.board}><Text style={styles.boardTitle}>COMPLETED MATCHWEEKS</Text>{history.length ? history.map(item => { const personal = user ? weeklyFantasyResult(item, user.id, squads, picks, players, lineups, events, stats) : null; return <View key={item.id} style={styles.historyRow}><View style={styles.historyCopy}><Text style={styles.historyDate}>{formatMatchTime(item.game_date)}</Text><Text style={styles.muted}>{personal ? `${personal.pickCount}/5 saved players` : 'No squad saved'}</Text></View><Text style={styles.points}>{personal ? `${personal.points} pts` : '—'}</Text></View>; }) : <Text style={styles.muted}>No completed Fantasy matchweeks yet.</Text>}</Card> : null}

      <Button variant="secondary" onPress={load}>Refresh Fantasy</Button>
    </Screen>
  );
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
  playSwitch: { flexDirection: 'row', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md, padding: 4, backgroundColor: colors.ink850 },
  playTab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  playTabActive: { backgroundColor: colors.goldSoft },
  playTabText: { color: colors.chalkMuted, fontFamily: fonts.sansBold, fontSize: 12 },
  playTabActiveText: { color: colors.gold, fontFamily: fonts.sansExtraBold, fontSize: 12 },
  intro: { gap: spacing.xs },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md },
  tabActive: { backgroundColor: colors.goldSoft, borderColor: colors.goldBorderStrong },
  tabText: { color: colors.chalkMuted, fontFamily: fonts.sansBold, fontSize: 11 },
  tabTextActive: { color: colors.gold, fontFamily: fonts.sansExtraBold },
  muted: { color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 },
  matchCard: { alignItems: 'center', paddingVertical: 13, gap: 4 },
  matchDate: { color: colors.chalk, fontFamily: fonts.sansExtraBold, fontSize: 13, textAlign: 'center' },
  matchStatus: { color: colors.gold, fontFamily: fonts.sansBlack, fontSize: 8, letterSpacing: 1.1 },
  board: { padding: spacing.md, gap: 0 },
  boardTitle: { marginBottom: spacing.sm, color: colors.chalk, fontFamily: fonts.display, fontSize: 25 },
  boardRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldBorder, paddingHorizontal: spacing.sm },
  boardMe: { backgroundColor: colors.goldSoft },
  rank: { width: 34, color: colors.gold, fontFamily: fonts.monoBold, fontSize: 11 },
  boardName: { flex: 1, color: colors.chalk, fontFamily: fonts.sansBold, fontSize: 12 },
  points: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 13 },
  historyRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldBorder },
  historyCopy: { flex: 1 },
  historyDate: { color: colors.chalk, fontFamily: fonts.sansBold, fontSize: 11 },
});
