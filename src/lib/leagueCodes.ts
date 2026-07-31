export function formatLeagueCode(value: string) {
  const compact = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^TL/, "")
    .slice(0, 8);
  const first = compact.slice(0, 4);
  const second = compact.slice(4, 8);
  return ["TL", first, second].filter(Boolean).join("-");
}

export function normalizeLeagueCode(value: string) {
  return formatLeagueCode(value);
}

export function leagueCodeIsComplete(value: string) {
  return /^TL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizeLeagueCode(value));
}
