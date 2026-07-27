import Image from "next/image";
import { cn } from "@/lib/utils";

type TiloPose = "matchday-ready" | "celebration";

const POSES: Record<TiloPose, { src: string; width: number; alt: string }> = {
  "matchday-ready": {
    src: "/mascot/tilo-matchday-ready.png",
    width: 145,
    alt: "Tilo ready for matchday with one boot on a football"
  },
  celebration: {
    src: "/mascot/tilo-celebration.png",
    width: 152,
    alt: "Tilo celebrating with a raised fist"
  }
};

export function TiloMoment({
  pose,
  eyebrow,
  title,
  text,
  className
}: {
  pose: TiloPose;
  eyebrow: string;
  title: string;
  text: string;
  className?: string;
}) {
  const image = POSES[pose];
  const celebration = pose === "celebration";

  return (
    <aside
      className={cn(
        "relative grid min-h-36 grid-cols-[minmax(0,1fr)_6.5rem] items-center overflow-hidden rounded-[1.35rem] border bg-ink-850 px-4 shadow-[0_9px_24px_rgba(0,0,0,.13)] sm:min-h-40 sm:grid-cols-[minmax(0,1fr)_8rem] sm:px-5",
        celebration ? "border-league-gold/35" : "border-turf-400/25",
        className
      )}
    >
      <div className={cn("pointer-events-none absolute inset-0", celebration
        ? "bg-[radial-gradient(circle_at_88%_35%,rgba(246,197,21,.14),transparent_35%),linear-gradient(120deg,rgba(246,197,21,.055),transparent_58%)]"
        : "bg-[radial-gradient(circle_at_88%_40%,rgba(49,185,78,.15),transparent_36%),linear-gradient(120deg,rgba(49,185,78,.05),transparent_58%)]"
      )} />
      <div className="relative z-10 py-4 pr-2">
        <div className={cn("text-[9px] font-black uppercase tracking-[.2em]", celebration ? "text-league-gold/75" : "text-turf-400/75")}>{eyebrow}</div>
        <h2 className="mt-1 font-display text-2xl uppercase sm:text-3xl">{title}</h2>
        <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-chalk/55 sm:text-sm">{text}</p>
      </div>
      <div className="pointer-events-none relative z-10 flex h-full items-end justify-center self-end">
        <Image
          src={image.src}
          width={image.width}
          height={256}
          sizes="(min-width: 640px) 128px, 104px"
          alt={image.alt}
          className="h-auto max-h-36 w-auto max-w-full object-contain drop-shadow-[0_10px_12px_rgba(0,0,0,.28)] sm:max-h-40"
        />
      </div>
    </aside>
  );
}
