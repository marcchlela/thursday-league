import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { TeamCode } from '@/lib/types';

const crestPalettes = [
  { primary: '#29A65A', secondary: '#0B482B', accent: '#E9F8D8' },
  { primary: '#E04C3E', secondary: '#6E1F1A', accent: '#FFF0D9' },
  { primary: '#3F83E1', secondary: '#163A75', accent: '#EAF3FF' },
  { primary: '#F2B633', secondary: '#6A4300', accent: '#FFF4CB' },
  { primary: '#A765D1', secondary: '#4C2267', accent: '#F7EAFE' },
  { primary: '#EC7550', secondary: '#71321F', accent: '#FFF0E9' },
];

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function TeamCrest({ gameId, team, size = 64 }: { gameId: string; team: TeamCode; size?: number }) {
  const seed = hashSeed(`${gameId}-${team}`);
  const palette = crestPalettes[seed % crestPalettes.length];
  const variant = seed % 3;

  return (
    <Svg width={size * 0.875} height={size} viewBox="0 0 72 84" accessibilityLabel={`Team ${team} crest`}>
      <Path d="M36 3 66 13v27c0 19-11 32-30 41C17 72 6 59 6 40V13L36 3Z" fill="#111410" stroke={palette.accent} strokeWidth={3} />
      <Path d="M36 8 61 16v23c0 15-8 27-25 36-17-9-25-21-25-36V16L36 8Z" fill={palette.secondary} />
      {variant === 0 ? <G><Rect x={11} y={25} width={50} height={13} fill={palette.primary} /><Rect x={11} y={46} width={50} height={8} fill={palette.primary} opacity={0.65} /></G> : null}
      {variant === 1 ? <G><Path d="m36 9 25 26v16L36 26 11 51V35L36 9Z" fill={palette.primary} /><Circle cx={36} cy={47} r={15} fill={palette.secondary} /></G> : null}
      {variant === 2 ? <G><Path d="M11 16h17v54c-8-7-14-16-17-28V16ZM44 11l17 5v26c-3 12-9 21-17 28V11Z" fill={palette.primary} /><Path d="M32 8h8v66l-4 2-4-2V8Z" fill={palette.accent} opacity={0.7} /></G> : null}
      <Circle cx={36} cy={56} r={9} fill="#F5F2E8" stroke="#111410" strokeWidth={2} />
      <Path d="m36 50 4 3-1.5 5h-5L32 53l4-3Zm-8 3 4 1m8-1 4-1m-5.5 6 3 4m-8-4-3 4" fill="#111410" stroke="#111410" strokeWidth={1.3} strokeLinecap="round" />
      <SvgText x={36} y={38} textAnchor="middle" fill={palette.accent} fontSize={22} fontWeight="900">{team}</SvgText>
    </Svg>
  );
}
