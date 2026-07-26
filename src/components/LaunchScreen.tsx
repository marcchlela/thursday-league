import Image from "next/image";
import leagueLogo from "../../Thursday League logo (no bg).png";

export function LaunchScreen() {
  return (
    <div className="launch-screen relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-900 px-6 text-chalk" role="status" aria-label="Opening Thursday League">
      <div className="launch-backdrop" aria-hidden="true" />
      <div className="relative z-10 text-center">
        <div className="launch-mark relative mx-auto grid h-32 w-32 place-items-center sm:h-36 sm:w-36">
          <span className="launch-orbit absolute inset-1 rounded-full border border-league-gold/25" aria-hidden="true" />
          <span className="launch-orbit launch-orbit-delayed absolute inset-4 rounded-full border border-dashed border-league-gold/20" aria-hidden="true" />
          <Image src={leagueLogo} alt="" priority className="relative z-10 h-28 w-28 scale-125 object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,.28)] sm:h-32 sm:w-32" />
        </div>
        <div className="launch-wordmark mt-5">
          <div className="mx-auto h-0.5 w-12 rounded-full bg-league-gold" aria-hidden="true" />
          <h1 className="mt-4 font-display text-4xl uppercase tracking-[.08em] sm:text-5xl">Thursday League</h1>
          <p className="mt-2 text-[10px] font-black uppercase tracking-[.28em] text-league-gold/70">Preparing matchday</p>
        </div>
        <span className="sr-only">Loading Thursday League</span>
      </div>
    </div>
  );
}
