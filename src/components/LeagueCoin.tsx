"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

export function LeagueCoin({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <Image
      aria-hidden="true"
      alt=""
      src="/icons/league-coin-v2.png"
      width={size}
      height={size}
      className={cn("shrink-0 drop-shadow-[0_3px_5px_rgba(247,183,51,.35)]", className)}
    />
  );
}

export function CoinAmount({ units, className, iconSize = 20 }: { units: number; className?: string; iconSize?: number }) {
  const amount = (units / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return <span className={cn("inline-flex items-center font-mono", iconSize > 0 && "gap-1.5", className)}>{iconSize > 0 ? <LeagueCoin size={iconSize} /> : null}<span>{amount}</span></span>;
}
