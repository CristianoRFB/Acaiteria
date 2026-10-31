export interface ReportPeriod {
  month: string;
  fromDate: string; // inclusive, YYYY-MM-DD in the tenant's timezone
  untilDate: string; // exclusive, YYYY-MM-DD
  limited: boolean;
}

export function localDateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  const [year, month, day] = [part('year'), part('month'), part('day')];
  if (!year || !month || !day) throw new RangeError('Timezone/date not supported.');
  return `${year}-${month}-${day}`;
}

export function getReportPeriod(
  month: string,
  now: Date,
  reportLookbackDays: number | null,
  timezone: string,
): ReportPeriod | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new RangeError('Invalid month.');
  if (reportLookbackDays !== null && (!Number.isSafeInteger(reportLookbackDays) || reportLookbackDays < 1)) {
    throw new RangeError('Invalid report lookback.');
  }
  const currentDay = localDateKey(now, timezone);
  if (month > currentDay.slice(0, 7)) return null;
  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonthDate = new Date(Date.UTC(year, monthNumber, 1));
  const untilDate = nextMonthDate.toISOString().slice(0, 10);
  let fromDate = `${month}-01`;
  let limited = false;
  if (reportLookbackDays !== null) {
    const [y, m, d] = currentDay.split('-').map(Number);
    const cutoff = new Date(Date.UTC(y, m - 1, d - reportLookbackDays + 1)).toISOString().slice(0, 10);
    if (cutoff > fromDate) {
      fromDate = cutoff;
      limited = true;
    }
  }
  if (fromDate >= untilDate) return null;
  return { month, fromDate, untilDate, limited };
}
