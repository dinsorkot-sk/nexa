import { describe, expect, it } from 'vitest';
import { matchesCron, zonedParts } from './cron';

describe('cron expressions', () => {
  it('matches a wildcard expression every minute', () => {
    expect(matchesCron('* * * * *', new Date('2026-03-01T10:37:00.000Z'))).toBe(true);
  });

  it('matches a minute of an hour', () => {
    expect(matchesCron('0 * * * *', new Date('2026-03-01T10:00:00.000Z'))).toBe(true);
    expect(matchesCron('0 * * * *', new Date('2026-03-01T10:01:00.000Z'))).toBe(false);
  });

  it('matches a step', () => {
    expect(matchesCron('*/15 * * * *', new Date('2026-03-01T10:00:00.000Z'))).toBe(true);
    expect(matchesCron('*/15 * * * *', new Date('2026-03-01T10:15:00.000Z'))).toBe(true);
    expect(matchesCron('*/15 * * * *', new Date('2026-03-01T10:30:00.000Z'))).toBe(true);
    expect(matchesCron('*/15 * * * *', new Date('2026-03-01T10:45:00.000Z'))).toBe(true);
    expect(matchesCron('*/15 * * * *', new Date('2026-03-01T10:16:00.000Z'))).toBe(false);
  });

  it('matches a list and a range', () => {
    expect(matchesCron('0,30 * * * *', new Date('2026-03-01T10:30:00.000Z'))).toBe(true);
    expect(matchesCron('0,30 * * * *', new Date('2026-03-01T10:31:00.000Z'))).toBe(false);
    expect(matchesCron('0 9-17 * * *', new Date('2026-03-01T09:00:00.000Z'))).toBe(true);
    expect(matchesCron('0 9-17 * * *', new Date('2026-03-01T18:00:00.000Z'))).toBe(false);
  });

  it('matches a day of the week, and Sunday as both zero and seven', () => {
    // 2026-03-01 is a Sunday.
    expect(matchesCron('0 9 * * 0', new Date('2026-03-01T09:00:00.000Z'))).toBe(true);
    expect(matchesCron('0 9 * * 7', new Date('2026-03-01T09:00:00.000Z'))).toBe(true);
    expect(matchesCron('0 9 * * 1', new Date('2026-03-01T09:00:00.000Z'))).toBe(false);
  });

  it('lets either the day of the month or the day of the week match when both are restricted', () => {
    // The 15th, or any Monday.
    expect(matchesCron('0 9 15 * 1', new Date('2026-03-15T09:00:00.000Z'))).toBe(true);
    expect(matchesCron('0 9 15 * 1', new Date('2026-03-02T09:00:00.000Z'))).toBe(true);
    expect(matchesCron('0 9 15 * 1', new Date('2026-03-03T09:00:00.000Z'))).toBe(false);
  });

  it('evaluates the expression in the time zone it was given', () => {
    // Nine in Bangkok is two in UTC.
    expect(matchesCron('0 9 * * *', new Date('2026-03-01T02:00:00.000Z'), 'Asia/Bangkok')).toBe(true);
    expect(matchesCron('0 9 * * *', new Date('2026-03-01T09:00:00.000Z'), 'Asia/Bangkok')).toBe(false);
    expect(zonedParts(new Date('2026-03-01T02:00:00.000Z'), 'Asia/Bangkok')).toMatchObject({ hour: 9, minute: 0, dayOfMonth: 1, month: 3 });
  });

  it('refuses a malformed expression', () => {
    expect(() => matchesCron('* * * *', new Date())).toThrow(/needs 5 fields/);
    expect(() => matchesCron('60 * * * *', new Date())).toThrow(/Invalid cron minute/);
    expect(() => matchesCron('0 24 * * *', new Date())).toThrow(/Invalid cron hour/);
    expect(() => matchesCron('*/0 * * * *', new Date())).toThrow(/Invalid cron step/);
    expect(() => matchesCron('5-1 * * * *', new Date())).toThrow(/Invalid cron minute/);
  });
});
