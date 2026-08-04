"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";
import { fixtureDateKey, fixtureTabDate, isGameAwaitingUpdate } from "@/lib/gameSchedule";
import type { Game } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Modal } from "./ui";

function fixtureTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value));
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(date);
}

function fullDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function GameScheduleNavigator({
  games,
  activeGames,
  selectedGame,
  onSelect,
  onOpenGame,
}: {
  games: Game[];
  activeGames: Game[];
  selectedGame: Game;
  onSelect: (gameId: string) => void;
  onOpenGame: (gameId: string) => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => monthStart(new Date(selectedGame.game_date)));
  const selectedIndex = activeGames.findIndex(game => game.id === selectedGame.id);

  useEffect(() => {
    setCalendarMonth(monthStart(new Date(selectedGame.game_date)));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`fixture-tab-${selectedGame.id}`)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest", inline: "center" });
  }, [selectedGame.game_date, selectedGame.id]);

  function selectAt(index: number) {
    const game = activeGames[index];
    if (game) onSelect(game.id);
  }

  function onFixtureKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? activeGames.length - 1
        : event.key === "ArrowLeft"
          ? Math.max(0, index - 1)
          : Math.min(activeGames.length - 1, index + 1);
    selectAt(next);
    window.setTimeout(() => document.getElementById(`fixture-tab-${activeGames[next].id}`)?.focus(), 0);
  }

  return (
    <>
      <section aria-label="Fixture navigation" className="rounded-[1.2rem] border border-league-gold/25 bg-ink-850 p-2.5 shadow-[0_8px_24px_rgba(0,0,0,.14)] sm:p-3">
        <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
          <div>
            <span className="block text-[10px] font-black uppercase tracking-[.18em] text-league-gold">Fixtures</span>
            <span className="mt-0.5 block text-xs text-chalk/40">{selectedIndex + 1} of {activeGames.length}</span>
          </div>
          <button type="button" onClick={() => setCalendarOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-league-gold/25 bg-league-gold/[.06] px-3 text-xs font-bold text-league-gold transition hover:border-league-gold/45 hover:bg-league-gold/[.1] focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold" aria-label="Open game calendar">
            <CalendarDays size={17} />
            <span className="hidden sm:inline">Calendar</span>
          </button>
        </div>

        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-stretch gap-2">
          <button type="button" aria-label="Previous fixture" disabled={selectedIndex <= 0} onClick={() => selectAt(selectedIndex - 1)} className="grid min-h-14 place-items-center rounded-xl border border-league-gold/20 bg-black/15 text-chalk/65 transition hover:border-league-gold/40 hover:text-league-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold disabled:cursor-not-allowed disabled:opacity-25"><ChevronLeft size={20} /></button>
          <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Choose a fixture">
            {activeGames.map((game, index) => {
              const active = game.id === selectedGame.id;
              return (
                <button key={game.id} id={`fixture-tab-${game.id}`} type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => onSelect(game.id)} onKeyDown={event => onFixtureKeyDown(event, index)} className={cn("min-h-14 min-w-[6.5rem] snap-center rounded-xl border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold", active ? "border-league-gold/55 bg-league-gold/[.11] text-chalk" : "border-league-gold/15 bg-black/15 text-chalk/55 hover:border-league-gold/35 hover:text-chalk")}>
                  <span className={cn("block font-mono text-sm font-black", active && "text-league-gold")}>{fixtureTabDate(game.game_date)}</span>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold"><Clock3 size={10} />{game.status === "live" ? "Live" : fixtureTime(game.game_date)}</span>
                </button>
              );
            })}
          </div>
          <button type="button" aria-label="Next fixture" disabled={selectedIndex >= activeGames.length - 1} onClick={() => selectAt(selectedIndex + 1)} className="grid min-h-14 place-items-center rounded-xl border border-league-gold/20 bg-black/15 text-chalk/65 transition hover:border-league-gold/40 hover:text-league-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold disabled:cursor-not-allowed disabled:opacity-25"><ChevronRight size={20} /></button>
        </div>
        <p className="mt-2 px-1 text-center text-[10px] text-chalk/30 sm:hidden">Swipe the dates or use the arrows.</p>
      </section>

      <GameCalendar open={calendarOpen} month={calendarMonth} games={games} activeGames={activeGames} selectedGame={selectedGame} onMonth={setCalendarMonth} onClose={() => setCalendarOpen(false)} onSelect={game => {
        setCalendarOpen(false);
        if (activeGames.some(item => item.id === game.id)) onSelect(game.id);
        else onOpenGame(game.id);
      }} />
    </>
  );
}

export function GameCalendarLauncher({ games, onOpenGame }: { games: Game[]; onOpenGame: (gameId: string) => void }) {
  const referenceGame = useMemo(
    () => [...games].sort((left, right) => new Date(right.game_date).getTime() - new Date(left.game_date).getTime())[0],
    [games],
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => monthStart(referenceGame ? new Date(referenceGame.game_date) : new Date()));

  return (
    <>
      <button type="button" onClick={() => setCalendarOpen(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-league-gold/25 bg-league-gold/[.06] px-4 text-sm font-bold text-league-gold transition hover:border-league-gold/45 hover:bg-league-gold/[.1] focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold" aria-label="Open game calendar">
        <CalendarDays size={18} />
        Game calendar
      </button>
      <GameCalendar
        open={calendarOpen}
        month={calendarMonth}
        games={games}
        activeGames={[]}
        selectedGame={referenceGame}
        onMonth={setCalendarMonth}
        onClose={() => setCalendarOpen(false)}
        onSelect={game => {
          setCalendarOpen(false);
          onOpenGame(game.id);
        }}
      />
    </>
  );
}

function GameCalendar({
  open,
  month,
  games,
  activeGames,
  selectedGame,
  onMonth,
  onClose,
  onSelect,
}: {
  open: boolean;
  month: Date;
  games: Game[];
  activeGames: Game[];
  selectedGame?: Game;
  onMonth: (month: Date) => void;
  onClose: () => void;
  onSelect: (game: Game) => void;
}) {
  const todayKey = fixtureDateKey(new Date());
  const selectedKey = selectedGame ? fixtureDateKey(selectedGame.game_date) : "";
  const activeIds = useMemo(() => new Set(activeGames.map(game => game.id)), [activeGames]);
  const gamesByDay = useMemo(() => {
    const grouped = new Map<string, Game[]>();
    for (const game of games) {
      const key = fixtureDateKey(game.game_date);
      grouped.set(key, [...(grouped.get(key) || []), game]);
    }
    return grouped;
  }, [games]);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const leadingBlankDays = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlankDays }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(year, monthIndex, index + 1)),
  ];
  while (cells.length % 7) cells.push(null);

  function preferredGame(dayGames: Game[]) {
    return dayGames.find(game => game.status === "live")
      || dayGames.find(game => activeIds.has(game.id))
      || dayGames.find(game => isGameAwaitingUpdate(game))
      || dayGames[0];
  }

  return (
    <Modal open={open} title="Game calendar" onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div><span className="text-[10px] font-black uppercase tracking-[.18em] text-league-gold">Schedule</span><h2 className="font-display text-3xl uppercase text-chalk">Game calendar</h2></div>
        <button type="button" onClick={onClose} aria-label="Close calendar" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-league-gold/20 text-chalk/55 transition hover:border-league-gold/40 hover:text-chalk focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold"><X size={17} /></button>
      </div>
      <div className="mt-4 grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-3 rounded-xl border border-league-gold/15 bg-black/15 p-2">
        <button type="button" onClick={() => onMonth(new Date(year, monthIndex - 1, 1))} aria-label="Previous month" className="grid h-11 w-11 place-items-center rounded-xl border border-league-gold/20 text-chalk/65 transition hover:text-league-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold"><ChevronLeft size={19} /></button>
        <strong className="text-center text-sm text-chalk">{monthLabel(month)}</strong>
        <button type="button" onClick={() => onMonth(new Date(year, monthIndex + 1, 1))} aria-label="Next month" className="grid h-11 w-11 place-items-center rounded-xl border border-league-gold/20 text-chalk/65 transition hover:text-league-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold"><ChevronRight size={19} /></button>
      </div>
      <div className="mt-4 grid grid-cols-7 text-center text-[10px] font-black uppercase tracking-wider text-chalk/35">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <span key={day} className="py-2">{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, index) => {
          if (!date) return <span key={`blank-${index}`} className="aspect-square" aria-hidden="true" />;
          const key = fixtureDateKey(date);
          const dayGames = gamesByDay.get(key) || [];
          const selected = key === selectedKey;
          const today = key === todayKey;
          const chosen = preferredGame(dayGames);
          return (
            <button key={key} type="button" disabled={!chosen} onClick={() => chosen && onSelect(chosen)} aria-label={`${fullDate(date)}${dayGames.length ? `, ${dayGames.length} game${dayGames.length === 1 ? "" : "s"}` : ", no game"}`} className={cn("relative aspect-square min-h-11 rounded-xl border text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold", selected ? "border-league-gold/60 bg-league-gold/[.14] text-league-gold" : today ? "border-chalk/25 bg-chalk/[.04] text-chalk" : dayGames.length ? "border-league-gold/20 bg-black/20 text-chalk hover:border-league-gold/45" : "border-transparent text-chalk/25 disabled:cursor-default")}>
              <span>{date.getDate()}</span>
              {dayGames.length ? <span className="absolute inset-x-1 bottom-1 flex justify-center gap-0.5">{dayGames.slice(0, 3).map(game => <span key={game.id} className={cn("h-1 w-1 rounded-full", game.status === "final" ? "bg-turf-400" : game.status === "live" ? "bg-red-300" : isGameAwaitingUpdate(game) ? "bg-amber-300" : "bg-league-gold")} />)}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-league-gold/12 pt-4 text-[10px] font-semibold text-chalk/45"><Legend color="bg-league-gold" label="Scheduled" /><Legend color="bg-red-300" label="Live" /><Legend color="bg-amber-300" label="Awaiting update" /><Legend color="bg-turf-400" label="Final" /></div>
    </Modal>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn("h-1.5 w-1.5 rounded-full", color)} />{label}</span>;
}
