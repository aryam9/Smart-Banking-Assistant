/** Today's date in India (YYYY-MM-DD). Used in the system prompt so "tomorrow" works. */
export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function monthRange(period: "this" | "last"): { start: string; end: string } {
  const [year, month] = todayInIndia().split("-").map(Number);
  const monthOffset = period === "last" ? -1 : 0;
  const startDate = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const endDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1));
  const formatDate = (date: Date) =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00+05:30`;

  return { start: formatDate(startDate), end: formatDate(endDate) };
}

export function weekdayInIndia(): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long" }).format(
    new Date()
  );
}
