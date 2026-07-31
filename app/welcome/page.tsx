"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  BarChart3,
  BellRing,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coins,
  History,
  Shirt,
  Sparkles,
  Trophy
} from "lucide-react";
import {
  saveIntroductionSeen,
  savePostAuthPath
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
import leagueLogo from "../../Thursday League logo (no bg).png";

const SLIDE_COUNT = 3;

export default function WelcomePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function goToAccount(mode: "login" | "signup") {
    saveIntroductionSeen();
    savePostAuthPath("/onboarding/league?from=welcome");
    router.push(`/login?mode=${mode}`);
  }

  function next() {
    setStep(current => Math.min(current + 1, SLIDE_COUNT - 1));
  }

  function previous() {
    setStep(current => Math.max(current - 1, 0));
  }

  function onTouchEnd(event: React.TouchEvent) {
    if (!touchStart.current) return;
    const end = event.changedTouches[0];
    const deltaX = end.clientX - touchStart.current.x;
    const deltaY = end.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX < 0) next();
    if (deltaX > 0) previous();
  }

  return (
    <main
      className="relative min-h-[100svh] overflow-hidden bg-ink-900 text-chalk"
      onTouchStart={event => {
        const touch = event.touches[0];
        touchStart.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={onTouchEnd}
    >
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full border-[52px] border-league-gold/[.02]" />
      <div className="pointer-events-none absolute -bottom-52 -right-40 h-[34rem] w-[34rem] rounded-full border border-league-gold/[.05]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_80%,rgba(218,165,32,.035),transparent_32%)]" />

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-6xl flex-col px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6 sm:pb-7 sm:pt-5">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Image src={leagueLogo} priority alt="" className="h-11 w-11 scale-125 object-contain sm:h-12 sm:w-12" />
            <div>
              <div className="text-[9px] font-black uppercase tracking-[.2em] text-league-gold/65">Weekly football</div>
              <div className="font-display text-xl uppercase leading-none sm:text-2xl">Thursday League</div>
            </div>
          </div>
          {step < SLIDE_COUNT - 1 ? (
            <button
              type="button"
              onClick={() => setStep(SLIDE_COUNT - 1)}
              className="min-h-11 rounded-xl px-3 text-sm font-bold text-chalk/55 transition hover:bg-chalk/[.04] hover:text-chalk focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold"
            >
              Skip intro
            </button>
          ) : null}
        </header>

        <SegmentedProgress current={step} />

        <section
          key={step}
          aria-live="polite"
          aria-label={`Introduction step ${step + 1} of ${SLIDE_COUNT}`}
          className="onboarding-enter flex min-h-0 flex-1 items-center py-5 sm:py-7"
        >
          {step === 0 ? <WelcomeSlide /> : null}
          {step === 1 ? <CompetitionSlide /> : null}
          {step === 2 ? <TogetherSlide /> : null}
        </section>

        <footer className="mt-auto border-t border-league-gold/12 pt-4">
          {step < SLIDE_COUNT - 1 ? (
            <div className="flex items-center justify-between gap-3">
              <SecondaryButton
                type="button"
                onClick={previous}
                disabled={step === 0}
                aria-label="Previous introduction step"
                className={cn("inline-flex items-center gap-2", step === 0 && "invisible")}
              >
                <ChevronLeft size={18} /> Back
              </SecondaryButton>
              <button
                type="button"
                onClick={next}
                className="inline-flex min-h-11 items-center gap-3 rounded-2xl border border-league-gold/35 bg-league-gold/[.08] py-2 pl-4 pr-2 font-bold text-league-gold transition hover:border-league-gold/55 hover:bg-league-gold/[.13] focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold"
              >
                Continue
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-league-gold text-gold-ink">
                  <ChevronRight size={18} />
                </span>
              </button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <PrimaryButton type="button" onClick={() => goToAccount("signup")} className="w-full py-3">
                Create account
              </PrimaryButton>
              <SecondaryButton type="button" onClick={() => goToAccount("login")} className="w-full py-3">
                I already have an account
              </SecondaryButton>
            </div>
          )}
        </footer>
      </div>
    </main>
  );
}

function SegmentedProgress({ current }: { current: number }) {
  return (
    <div className="mt-4">
      <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
        {Array.from({ length: SLIDE_COUNT }, (_, index) => (
          <span key={index} className="h-1.5 overflow-hidden rounded-full bg-league-gold/12">
            <span
              className={cn(
                "block h-full origin-left rounded-full bg-league-gold transition-transform duration-300 motion-reduce:transition-none",
                index <= current ? "scale-x-100" : "scale-x-0"
              )}
            />
          </span>
        ))}
      </div>
      <p className="mt-2 text-right text-[10px] font-bold uppercase tracking-[.16em] text-chalk/40">
        Step {current + 1} of {SLIDE_COUNT}
      </p>
    </div>
  );
}

function WelcomeSlide() {
  return (
    <div className="grid w-full items-center gap-5 lg:grid-cols-[1fr_.86fr] lg:gap-12">
      <div className="order-2 text-center lg:order-1 lg:text-left">
        <div className="text-[10px] font-black uppercase tracking-[.22em] text-league-gold">Your football, organized</div>
        <h1 className="mx-auto mt-2 max-w-2xl font-display text-5xl uppercase leading-[.92] tracking-tight sm:text-6xl lg:mx-0 lg:text-7xl">
          Your league<br /><span className="text-league-gold">lives here.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-chalk/58 sm:text-base lg:mx-0">
          Plan matches, publish lineups and keep every result and player stat together.
        </p>
        <div className="mx-auto mt-5 grid max-w-xl grid-cols-3 gap-2 lg:mx-0">
          <MiniFeature icon={CalendarDays} label="Matches" />
          <MiniFeature icon={BarChart3} label="Stats" />
          <MiniFeature icon={History} label="History" />
        </div>
      </div>
      <div className="order-1 flex min-h-[14rem] items-end justify-center lg:order-2 lg:min-h-[29rem]">
        <div className="relative flex h-52 w-52 items-end justify-center rounded-full border border-league-gold/20 bg-league-gold/[.035] shadow-[0_12px_28px_rgba(0,0,0,.2)] sm:h-64 sm:w-64 lg:h-96 lg:w-96">
          <div className="absolute inset-7 rounded-full border border-league-gold/10" />
          <Image
            src="/mascot/tilo-matchday-ready.png"
            alt="Tilo welcoming you, ready for matchday with one boot on a football"
            width={290}
            height={512}
            priority
            sizes="(min-width: 1024px) 350px, (min-width: 640px) 245px, 195px"
            className="relative z-10 max-h-[15rem] w-auto object-contain drop-shadow-[0_18px_18px_rgba(0,0,0,.34)] sm:max-h-[18rem] lg:max-h-[27rem]"
          />
        </div>
      </div>
    </div>
  );
}

function CompetitionSlide() {
  return (
    <div className="grid w-full items-center gap-6 lg:grid-cols-[.92fr_1.08fr] lg:gap-12">
      <div className="text-center lg:text-left">
        <div className="text-[10px] font-black uppercase tracking-[.22em] text-league-gold">More than a scoreline</div>
        <h1 className="mx-auto mt-2 max-w-2xl font-display text-5xl uppercase leading-[.92] tracking-tight sm:text-6xl lg:mx-0 lg:text-7xl">
          Turn form into<br /><span className="text-turf-400">competition.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-chalk/58 sm:text-base lg:mx-0">
          Pick a Fantasy five and predict results with virtual coins, all powered by your real matches.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FeaturePanel
          icon={Shirt}
          eyebrow="Fantasy"
          title="Pick your five"
          text="Choose both teams, name a captain and score from the match."
          tone="green"
        />
        <FeaturePanel
          icon={Coins}
          eyebrow="Predictions"
          title="Back your call"
          text="Use virtual coins on match and player markets after three results."
          tone="gold"
        />
        <div className="sm:col-span-2 grid grid-cols-3 gap-2 rounded-[1.35rem] border border-league-gold/20 bg-ink-850 p-3 shadow-[0_12px_30px_rgba(0,0,0,.18)]">
          <StatPreview value="5" label="Player team" />
          <StatPreview value="2×" label="Captain score" />
          <StatPreview value="Coins" label="Virtual currency" />
        </div>
      </div>
    </div>
  );
}

function TogetherSlide() {
  return (
    <div className="grid w-full items-center gap-5 lg:grid-cols-[1fr_.86fr] lg:gap-12">
      <div className="order-2 text-center lg:order-1 lg:text-left">
        <div className="text-[10px] font-black uppercase tracking-[.22em] text-perimeter-400">Stay ready</div>
        <h1 className="mx-auto mt-2 max-w-2xl font-display text-5xl uppercase leading-[.92] tracking-tight sm:text-6xl lg:mx-0 lg:text-7xl">
          Keep the whole<br /><span className="text-league-gold">league in sync.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-chalk/58 sm:text-base lg:mx-0">
          Get the matchday updates that help you act on time.
        </p>
        <div className="mx-auto mt-5 grid max-w-xl gap-2 sm:grid-cols-3 lg:mx-0">
          {[
            "Matchday reminders",
            "Lineups and deadlines",
            "Final results"
          ].map(item => (
            <div key={item} className="flex min-h-12 items-center gap-3 rounded-2xl border border-league-gold/20 bg-league-gold/[.035] px-3 text-left text-xs font-semibold text-chalk/72">
              <BellRing size={16} className="shrink-0 text-perimeter-400" /> {item}
            </div>
          ))}
        </div>
      </div>
      <div className="order-1 flex min-h-[14rem] items-end justify-center lg:order-2 lg:min-h-[29rem]">
        <div className="relative flex h-52 w-52 items-end justify-center rounded-full border border-league-gold/20 bg-league-gold/[.035] shadow-[0_12px_28px_rgba(0,0,0,.2)] sm:h-64 sm:w-64 lg:h-96 lg:w-96">
          <Sparkles className="absolute right-5 top-7 text-league-gold/55 sm:right-8 sm:top-10" size={28} />
          <Image
            src="/mascot/tilo-celebration.png"
            alt="Tilo celebrating and ready to point out the next useful league update"
            width={304}
            height={512}
            priority
            sizes="(min-width: 1024px) 350px, (min-width: 640px) 245px, 195px"
            className="relative z-10 max-h-[15rem] w-auto object-contain drop-shadow-[0_18px_18px_rgba(0,0,0,.34)] sm:max-h-[18rem] lg:max-h-[27rem]"
          />
        </div>
      </div>
    </div>
  );
}

function MiniFeature({ icon: Icon, label }: { icon: typeof CalendarDays; label: string }) {
  return (
    <div className="rounded-2xl border border-league-gold/18 bg-ink-850 px-2 py-3 text-center shadow-[0_8px_20px_rgba(0,0,0,.14)]">
      <Icon size={18} className="mx-auto text-league-gold" />
      <div className="mt-1.5 text-[10px] font-black uppercase tracking-[.12em] text-chalk/55">{label}</div>
    </div>
  );
}

function FeaturePanel({
  icon: Icon,
  eyebrow,
  title,
  text,
  tone
}: {
  icon: typeof Trophy;
  eyebrow: string;
  title: string;
  text: string;
  tone: "green" | "gold";
}) {
  return (
    <article className={cn(
      "relative min-h-44 overflow-hidden rounded-[1.35rem] border bg-ink-850 p-4 shadow-[0_12px_30px_rgba(0,0,0,.18)]",
      "border-league-gold/25"
    )}>
      <div className={cn("absolute -right-8 -top-8 h-24 w-24 rounded-full", tone === "green" ? "bg-turf-400/[.045]" : "bg-league-gold/[.045]")} />
      <span className={cn("grid h-11 w-11 place-items-center rounded-2xl", tone === "green" ? "bg-turf-400/10 text-turf-400" : "bg-league-gold/10 text-league-gold")}>
        <Icon size={21} />
      </span>
      <div className={cn("mt-4 text-[9px] font-black uppercase tracking-[.18em]", tone === "green" ? "text-turf-400" : "text-league-gold")}>{eyebrow}</div>
      <h2 className="mt-1 font-display text-2xl uppercase">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-chalk/52">{text}</p>
    </article>
  );
}

function StatPreview({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-black/15 px-2 py-3 text-center">
      <div className="font-mono text-xl font-bold text-league-gold sm:text-2xl">{value}</div>
      <div className="mt-1 text-[9px] font-bold uppercase tracking-[.1em] text-chalk/45">{label}</div>
    </div>
  );
}
