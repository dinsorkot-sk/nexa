/**
 * Whether a stored string may be rendered as a link or image source. Only http(s) is allowed for web links, plus
 * mailto: and tel: where a field type calls for them. Anything else, including javascript:, data:, vbscript: and
 * file:, is refused, as is a relative or malformed value. The check parses the URL, so tricks such as leading
 * whitespace, mixed case or embedded control characters cannot smuggle a scheme past it.
 */
export type LinkKind = 'web' | 'mailto' | 'tel';

const allowed: Record<LinkKind, readonly string[]> = {
  web: ['http:', 'https:'],
  mailto: ['mailto:'],
  tel: ['tel:'],
};

export function safeHref(value: unknown, kind: LinkKind = 'web'): string | undefined {
  if (typeof value !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return undefined;
  let url: URL;
  try { url = new URL(value); } catch { return undefined; }
  return allowed[kind].includes(url.protocol) ? url.href : undefined;
}

/**
 * `mailto:` link for an email address, or undefined if the value is not a plain address. This is stricter than the
 * engine's email rule on purpose: characters that could add a scheme, path, query or markup (`: / ? # < > " ' \`)
 * are refused, so a stored value can never turn into anything but a bare address.
 */
export function mailtoHref(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^[^\s@<>"'\\:/?#]+@[^\s@<>"'\\:/?#]+\.[^\s@<>"'\\:/?#]+$/.test(value)) return undefined;
  return safeHref(`mailto:${value}`, 'mailto');
}

/** `tel:` link for a phone number: digits, spaces, dashes, parentheses and a leading plus. */
export function telHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const compact = value.replace(/[\s().-]/g, '');
  if (!/^\+?\d{3,15}$/.test(compact)) return undefined;
  return `tel:${compact}`;
}
