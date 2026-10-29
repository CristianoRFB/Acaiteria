import { describe, expect, it } from 'vitest';
import { tenantCalendarMonth } from './order-usage.js';

describe('monthly order quota calendar', () => {
  it('uses tenant local month rather than UTC at the Brazilian month boundary', () => {
    const instant = new Date('2026-11-01T01:30:00.000Z');
    expect(tenantCalendarMonth(instant, 'America/Sao_Paulo')).toBe('2026-10');
    expect(tenantCalendarMonth(instant, 'UTC')).toBe('2026-11');
    expect(tenantCalendarMonth(instant, 'Asia/Tokyo')).toBe('2026-11');
  });

  it('preserves the local calendar year across the UTC New Year', () => {
    const instant = new Date('2027-01-01T01:30:00.000Z');
    expect(tenantCalendarMonth(instant, 'America/Sao_Paulo')).toBe('2026-12');
    expect(tenantCalendarMonth(instant, 'Asia/Tokyo')).toBe('2027-01');
  });

  it('rejects invalid timezones instead of silently reverting to the server timezone', () => {
    expect(() => tenantCalendarMonth(new Date(), 'invalid/missing-zone')).toThrow();
  });
});
