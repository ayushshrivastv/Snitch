const shortMonths: Record<string, string> = {
  January: "Jan", February: "Feb", March: "Mar", April: "Apr", May: "May", June: "Jun",
  July: "Jul", August: "Aug", September: "Sep", Sept: "Sep", October: "Oct", November: "Nov", December: "Dec",
};

/** Normalize saved display strings without reinterpreting their wall time or timezone. */
export function formatSavedRecordDate(value: string): string {
  return value
    .replace(/\b(January|February|March|April|May|June|July|August|September|Sept|October|November|December)\b/g, month => shortMonths[month])
    .replace(/(\d{4})\s+at\s+(?=\d{1,2}:)/, "$1, ");
}

/** Explicit separators keep Safari, server rendering and exported records consistent. */
export function formatRecordDateTime(date: Date, options: { timeZone?: string; showTimeZone?: boolean; includeTime?: boolean } = {}): string {
  if (!Number.isFinite(date.getTime())) return "—";
  const { timeZone, showTimeZone = false, includeTime = true } = options;
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone,
    ...(includeTime ? { hour: "numeric", minute: "2-digit", hour12: true } as const : {}),
    ...(includeTime && showTimeZone ? { timeZoneName: "short" } as const : {}),
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  const day = `${part("month")} ${part("day")}, ${part("year")}`;
  return includeTime ? `${day}, ${part("hour")}:${part("minute")} ${part("dayPeriod")}${showTimeZone ? ` ${part("timeZoneName")}` : ""}` : day;
}
