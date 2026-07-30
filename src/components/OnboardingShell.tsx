import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import leagueLogo from "../../Thursday League logo (no bg).png";

export function OnboardingShell({
  step,
  eyebrow,
  title,
  description,
  children,
  backHref,
  backLabel = "Back"
}: {
  step: 2 | 3;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-ink-900 text-chalk">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full border-[52px] border-league-gold/[.02]" />
      <div className="pointer-events-none absolute -bottom-56 -right-52 h-[38rem] w-[38rem] rounded-full border border-league-gold/[.05]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_78%,rgba(218,165,32,.035),transparent_32%)]" />

      <div className="relative mx-auto min-h-[100svh] w-full max-w-5xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6 sm:pt-5">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="Thursday League home" className="flex items-center gap-2 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold">
            <Image src={leagueLogo} priority alt="" className="h-11 w-11 scale-125 object-contain sm:h-12 sm:w-12" />
            <div>
              <div className="text-[9px] font-black uppercase tracking-[.2em] text-league-gold/65">Account setup</div>
              <div className="font-display text-xl uppercase leading-none sm:text-2xl">Thursday League</div>
            </div>
          </Link>
          {backHref ? (
            <Link href={backHref} className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-bold text-chalk/55 transition hover:bg-chalk/[.04] hover:text-chalk focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold">
              {backLabel}
            </Link>
          ) : null}
        </header>

        <div className="mt-5">
          <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
            {[1, 2, 3].map(index => (
              <span key={index} className="h-1.5 overflow-hidden rounded-full bg-league-gold/12">
                <span className={cn("block h-full rounded-full bg-league-gold", index <= step ? "w-full" : "w-0")} />
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[.15em] text-chalk/40">
            <span>{eyebrow}</span>
            <span>Step {step} of 3</span>
          </div>
        </div>

        <section className="onboarding-enter mx-auto mt-7 max-w-4xl">
          <div className="text-center">
            <h1 className="font-display text-4xl uppercase leading-none sm:text-5xl">{title}</h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-chalk/55 sm:text-base">{description}</p>
          </div>
          <div className="mt-7">{children}</div>
        </section>
      </div>
    </main>
  );
}
