import { describe, expect, it } from 'vitest';
import { parseCsv, serializeCsv } from '../app/utils/csv';

describe('CSV helpers', () => {
  it('round-trips quoted commas, escaped quotes and CRLF line breaks', () => {
    const headers = ['name', 'notes', 'score'];
    const rows = [
      ['Doe, Jane', 'said "hello"', '10'],
      ['plain', 'line1\nline2', ''],
    ];
    const serialized = serializeCsv(headers, rows);
    expect(serialized).toBe('name,notes,score\r\n"Doe, Jane","said ""hello""",10\r\nplain,"line1\nline2",');
    expect(parseCsv(serialized)).toEqual([headers, ...rows]);
  });

  it('parses quoted cells containing commas, escaped quotes and newlines', () => {
    expect(parseCsv('a,"b,c",d')).toEqual([['a', 'b,c', 'd']]);
    expect(parseCsv('a,"b""c",d')).toEqual([['a', 'b"c', 'd']]);
    expect(parseCsv('a,"b\nc",d')).toEqual([['a', 'b\nc', 'd']]);
  });

  it('handles CRLF, LF and lone CR line endings', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b\rc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('skips the trailing empty line and preserves interior empty rows', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a,b\r\n\r\nc,d')).toEqual([['a', 'b'], [''], ['c', 'd']]);
  });

  it('keeps empty cells and preserves empty quoted cells', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
    expect(parseCsv('a,"",c')).toEqual([['a', '', 'c']]);
    expect(parseCsv(',x')).toEqual([['', 'x']]);
  });
});
