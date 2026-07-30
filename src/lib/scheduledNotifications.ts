type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

function zonedDateParts(value: Date, timeZone: string): ZonedDateParts | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23"
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find(item => item.type === type)?.value);
    return {
      year: part("year"),
      month: part("month"),
      day: part("day"),
      hour: part("hour")
    };
  } catch {
    return null;
  }
}

export function isMatchdayMorning(
  now: Date,
  kickoff: Date,
  timeZone: string,
  morningHour = 9
) {
  if (now.getTime() >= kickoff.getTime()) return false;
  const current = zonedDateParts(now, timeZone);
  const match = zonedDateParts(kickoff, timeZone);
  if (!current || !match) return false;
  return current.year === match.year
    && current.month === match.month
    && current.day === match.day
    && current.hour >= morningHour;
}

