import { describe, expect, it } from 'vitest';
import { getReportPeriod, localDateKey } from '../shared/report-window';

describe('Açaí commercial report windows', () => {
  const now = new Date('2026-10-31T01:30:00Z'); // local Oct 30 at 22:30 in São Paulo
  it('uses the tenant-local date, including UTC month rollover', () => {
    expect(localDateKey(now, 'America/Sao_Paulo')).toBe('2026-10-30');
    expect(localDateKey(now, 'UTC')).toBe('2026-10-31');
    expect(localDateKey(new Date('2026-11-01T01:30:00Z'), 'America/Sao_Paulo')).toBe('2026-10-31');
  });

  it('gates an Essential report to a rolling thirty-day window, not just calendar month', () => {
    expect(getReportPeriod('2026-10', now, 30, 'America/Sao_Paulo')).toEqual({
      month: '2026-10', fromDate: '2026-10-01', untilDate: '2026-11-01', limited: false,
    });
    expect(getReportPeriod('2026-09', now, 30, 'America/Sao_Paulo')).toEqual({
      month: '2026-09', fromDate: '2026-09-30', untilDate: '2026-10-01', limited: true,
    });
    expect(getReportPeriod('2026-08', now, 30, 'America/Sao_Paulo')).toBeNull();
  });

  it('honors Pro 365-day history and Premium unlimited history without deleting data', () => {
    expect(getReportPeriod('2026-01', now, 365, 'America/Sao_Paulo')?.limited).toBe(false);
    expect(getReportPeriod('2020-01', now, 365, 'America/Sao_Paulo')).toBeNull();
    expect(getReportPeriod('2020-01', now, null, 'America/Sao_Paulo')).toMatchObject({
      month: '2020-01', fromDate: '2020-01-01', untilDate: '2020-02-01', limited: false,
    });
  });

  it('rejects future months, invalid dates and malformed limits', () => {
    expect(getReportPeriod('2026-11', now, null, 'America/Sao_Paulo')).toBeNull();
    expect(() => getReportPeriod('2026-13', now, 30, 'America/Sao_Paulo')).toThrow();
    expect(() => getReportPeriod('2026-10', now, 0, 'America/Sao_Paulo')).toThrow();
    expect(() => getReportPeriod('2026-10', now, 1, 'invalid/zone')).toThrow();
  });
});
