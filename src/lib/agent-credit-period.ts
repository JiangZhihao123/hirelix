/** Add calendar months from the original anchor, clamping short months without drift. */
export function subscriptionMonth(anchor: Date, offset: number): Date {
  const date = new Date(anchor);
  date.setUTCDate(1);
  date.setUTCMonth(anchor.getUTCMonth() + offset);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  return date;
}

/** A credit window must be inside a successfully paid Paddle billing period. */
export function subscriptionCreditPeriod(
  paidStart: Date, paidEnd: Date, now: Date, annual: boolean, anchor: Date = paidStart,
): { start: Date; end: Date } | null {
  if (![paidStart, paidEnd, now].every(date => Number.isFinite(date.getTime())) ||
      paidEnd <= paidStart || now < paidStart || now >= paidEnd) return null;
  if (!annual) return { start: paidStart, end: paidEnd };
  if (!Number.isFinite(anchor.getTime()) || anchor > paidStart) anchor = paidStart;
  let month = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + now.getUTCMonth() - anchor.getUTCMonth();
  if (subscriptionMonth(anchor, month) > now) month--;
  const start = subscriptionMonth(anchor, month);
  const next = subscriptionMonth(anchor, month + 1);
  return { start: start > paidStart ? start : paidStart, end: next < paidEnd ? next : paidEnd };
}
