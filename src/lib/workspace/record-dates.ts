import { z } from "zod";

type DatedRecord = { occurred_at: string | null; details: Record<string, unknown> };
export function localDate(instant: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date(instant));
}
export function recordLocalDate(record: DatedRecord, timezone: string) {
  if (record.occurred_at) return localDate(record.occurred_at, timezone);
  const day = z.iso.date().safeParse(record.details.occurred_on);
  return day.success ? day.data : null;
}
export function recordWithinPeriod(record: DatedRecord, start: string, end: string, timezone: string) {
  if (record.occurred_at) return new Date(record.occurred_at) >= new Date(start) && new Date(record.occurred_at) <= new Date(end);
  const day = recordLocalDate(record, timezone);
  return !!day && day >= localDate(start, timezone) && day <= localDate(end, timezone);
}
