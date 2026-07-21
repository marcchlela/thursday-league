"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export function LeagueCoin({ size = 24, className }: { size?: number; className?: string }) {
  const rawId = useId().replace(/:/g, "");
  const faceId = `coin-face-${rawId}`;
  const rimId = `coin-rim-${rawId}`;

  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 64 64" fill="none" className={cn("shrink-0 drop-shadow-[0_3px_5px_rgba(247,183,51,.35)]", className)}>
      <defs>
        <radialGradient id={faceId} cx="0" cy="0" r="1" gradientTransform="translate(23 17) rotate(48) scale(53)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF1A8" />
          <stop offset=".38" stopColor="#F7B733" />
          <stop offset="1" stopColor="#B66A05" />
        </radialGradient>
        <linearGradient id={rimId} x1="12" y1="8" x2="53" y2="57" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF6BE" />
          <stop offset=".45" stopColor="#ECA321" />
          <stop offset="1" stopColor="#8E4A00" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill={`url(#${rimId})`} stroke="#FFE77C" strokeWidth="2" />
      <circle cx="32" cy="32" r="23" fill={`url(#${faceId})`} stroke="#9B5708" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="19" stroke="#FFE98B" strokeOpacity=".65" strokeWidth="1" strokeDasharray="2.5 2.5" />
      <path d="M20 23.5h24v6h-8.5V43h-7V29.5H20v-6Z" fill="#794006" stroke="#FFE57B" strokeWidth="1" strokeLinejoin="round" />
      <path d="M15 14.5 18 18M49 14.5 46 18M15 49.5 18 46M49 49.5 46 46" stroke="#FFF0A0" strokeWidth="2" strokeLinecap="round" />
      <path d="M11 28v8M53 28v8M28 11h8M28 53h8" stroke="#8C4B02" strokeWidth="1.5" strokeLinecap="round" />
      <ellipse cx="25" cy="18" rx="8" ry="3.5" fill="white" fillOpacity=".18" transform="rotate(-24 25 18)" />
    </svg>
  );
}

export function CoinAmount({ units, className, iconSize = 20 }: { units: number; className?: string; iconSize?: number }) {
  const amount = (units / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return <span className={cn("inline-flex items-center font-mono", iconSize > 0 && "gap-1.5", className)}>{iconSize > 0 ? <LeagueCoin size={iconSize} /> : null}<span>{amount}</span></span>;
}
