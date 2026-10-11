import { describe, expect, it } from 'vitest';
import { mailtoHref, safeHref, telHref } from '../src/render/safe-url';

describe('safeHref', () => {
  it('allows http and https', () => {
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHref('http://example.com')).toBe('http://example.com/');
  });

  it('refuses script, data, file and other schemes', () => {
    for (const bad of [
      'javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'JaVaScRiPt:alert(1)', 'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'ftp://example.com', 'blob:https://example.com/x',
      'about:blank', 'intent://x#Intent;end', 'ws://example.com',
    ]) expect(safeHref(bad), bad).toBeUndefined();
  });

  it('refuses whitespace and control-character tricks around a scheme', () => {
    for (const bad of [' javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', '\u0001javascript:alert(1)', 'javascript\u0000:alert(1)', ' https://example.com', 'https://exa mple.com']) {
      expect(safeHref(bad), JSON.stringify(bad)).toBeUndefined();
    }
  });

  it('refuses relative, empty, malformed and non-string values', () => {
    for (const bad of ['', '/path', '//example.com', 'example.com', 'https://', 'http:/', '#anchor']) expect(safeHref(bad), bad).toBeUndefined();
    for (const bad of [undefined, null, 5, {}, ['https://a.com']]) expect(safeHref(bad)).toBeUndefined();
  });

  it('keeps kinds separate: a web link is not a mailto and vice versa', () => {
    expect(safeHref('mailto:a@b.co')).toBeUndefined();
    expect(safeHref('https://a.com', 'mailto')).toBeUndefined();
    expect(safeHref('mailto:a@b.co', 'mailto')).toBe('mailto:a@b.co');
  });
});

describe('mailtoHref and telHref', () => {
  it('build links from plain values', () => {
    expect(mailtoHref('ada@example.com')).toBe('mailto:ada@example.com');
    expect(telHref('+66 81-234 5678')).toBe('tel:+66812345678');
    expect(telHref('(02) 123 4567')).toBe('tel:021234567');
  });

  it('refuse injection through the address or number', () => {
    for (const bad of ['a@b.co?subject=x&body=y z', 'a@b.co"><img>', 'a b@c.co', 'javascript:alert(1)//@x.co', '', 'nope']) expect(mailtoHref(bad), bad).toBeUndefined();
    for (const bad of ['', '12', 'call me', '+', '1234567890123456', 'javascript:alert(1)', '123;ext=4']) expect(telHref(bad), bad).toBeUndefined();
    expect(mailtoHref(5)).toBeUndefined();
    expect(telHref(null)).toBeUndefined();
  });
});
