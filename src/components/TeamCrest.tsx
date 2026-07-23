import { TeamCode } from "@/lib/types";
import { cn } from "@/lib/utils";

const crestPalettes = [
  { primary: "#29A65A", secondary: "#0B482B", accent: "#E9F8D8" },
  { primary: "#E04C3E", secondary: "#6E1F1A", accent: "#FFF0D9" },
  { primary: "#3F83E1", secondary: "#163A75", accent: "#EAF3FF" },
  { primary: "#F2B633", secondary: "#6A4300", accent: "#FFF4CB" },
  { primary: "#A765D1", secondary: "#4C2267", accent: "#F7EAFE" },
  { primary: "#EC7550", secondary: "#71321F", accent: "#FFF0E9" }
];

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function TeamCrest({ gameId, team, className }: { gameId: string; team: TeamCode; className?: string }) {
  const seed = hashSeed(`${gameId}-${team}`);
  const palette = crestPalettes[seed % crestPalettes.length];
  const variant = seed % 3;

  return (
    <svg viewBox="0 0 72 84" role="img" aria-label={`Team ${team} crest`} className={cn("h-16 w-14 drop-shadow-[0_8px_12px_rgba(0,0,0,.24)]", className)}>
      <path d="M36 3 66 13v27c0 19-11 32-30 41C17 72 6 59 6 40V13L36 3Z" fill="#111410" stroke={palette.accent} strokeWidth="3" />
      <path d="M36 8 61 16v23c0 15-8 27-25 36-17-9-25-21-25-36V16L36 8Z" fill={palette.secondary} />
      {variant === 0 ? <><path d="M11 25h50v13H11z" fill={palette.primary} /><path d="M11 46h50v8H11z" fill={palette.primary} opacity=".65" /></> : null}
      {variant === 1 ? <><path d="m36 9 25 26v16L36 26 11 51V35L36 9Z" fill={palette.primary} /><circle cx="36" cy="47" r="15" fill={palette.secondary} /></> : null}
      {variant === 2 ? <><path d="M11 16h17v54c-8-7-14-16-17-28V16ZM44 11l17 5v26c-3 12-9 21-17 28V11Z" fill={palette.primary} /><path d="M32 8h8v66l-4 2-4-2V8Z" fill={palette.accent} opacity=".7" /></> : null}
      <circle cx="36" cy="56" r="9" fill="#F5F2E8" stroke="#111410" strokeWidth="2" />
      <path d="m36 50 4 3-1.5 5h-5L32 53l4-3Zm-8 3 4 1m8-1 4-1m-5.5 6 3 4m-8-4-3 4" fill="#111410" stroke="#111410" strokeWidth="1.3" strokeLinecap="round" />
      <text x="36" y="38" textAnchor="middle" fill={palette.accent} fontSize="22" fontWeight="900" fontFamily="Arial, sans-serif">{team}</text>
    </svg>
  );
}
