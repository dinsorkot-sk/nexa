/**
 * Conservative allow-list HTML sanitizer for message bodies and rendered templates. No dependency
 * was available in the lockfile, so this is a small tokenizer + re-serializer: only allow-listed tags
 * and attributes survive, everything is re-escaped on output, so the result never contains markup
 * the tokenizer did not understand. Not a full HTML5 parser: unusual-but-valid markup may lose
 * formatting (fail closed), never gain active content.
 * Follow-up: <img src> accepts external http(s) URLs, so bodies can carry tracking pixels; a proxy or
 * an option to allow only data:/relative images is needed before rendering to external readers.
 */

export const MAX_SANITIZE_INPUT = 1_000_000;

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup', 'dd', 'del', 'div', 'dl', 'dt', 'em',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's',
  'small', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]);
const PORTAL_ALLOWED_TAGS = new Set([...ALLOWED_TAGS].filter((tag) => tag !== 'img'));
const VOID_TAGS = new Set(['br', 'col', 'hr', 'img']);
/** Content is raw text in browsers: skipped up to the matching end tag. */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext']);
/** Dropped together with their (markup) content. */
const DROP_CONTENT_TAGS = new Set(['svg', 'math', 'object', 'embed', 'template', 'head', 'select', 'frameset', 'frame', 'applet', 'audio', 'video', 'canvas']);

const GLOBAL_ATTRS = new Set(['title', 'class', 'dir', 'lang']);
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan', 'align']),
  th: new Set(['colspan', 'rowspan', 'align', 'scope']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
  ol: new Set(['start', 'type']),
  q: new Set(['cite']),
  blockquote: new Set(['cite']),
  p: new Set(['align']),
  div: new Set(['align']),
};
const URL_ATTRS = new Set(['href', 'src', 'cite']);

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', colon: ':', tab: '\t', newline: '\n' };

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Plain text to a safe HTML paragraph (line breaks kept). */
export function textToHtml(text: string): string {
  return `<p>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</p>`;
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '�';
      return String.fromCodePoint(code);
    }
    const named = NAMED[body.toLowerCase()];
    return named ?? match;
  });
}

/** Keep valid entity references in text, escape everything else that could start markup. */
function escapeText(text: string): string {
  return text
    .replace(/&(?!(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);)/gi, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Only http(s), mailto, tel and relative URLs; images may also use inline raster data URLs. */
export function safeUrl(raw: string, image = false): string | null {
  // browsers ignore control characters and whitespace inside the scheme
  const value = decodeEntities(raw).replace(/[\u0000- \u007f-\u009f]/g, '');
  if (!value) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (!scheme) {
    // protocol-relative URLs are fine; a backslash could be read as a slash by some browsers
    return value.startsWith('\\') ? null : raw.trim();
  }
  const name = scheme[1]!.toLowerCase();
  if (['http', 'https', 'mailto', 'tel'].includes(name)) return raw.trim();
  if (image && name === 'data' && /^data:image\/(png|gif|jpeg|webp);base64,[a-z0-9+/=\s]*$/i.test(value)) return value;
  return null;
}

interface Attr { name: string; value: string | null }

function serializeAttrs(tag: string, attrs: Attr[]): string {
  const allowed = TAG_ATTRS[tag];
  const out: string[] = [];
  const seen = new Set<string>();
  let blank = false;
  for (const attr of attrs) {
    const name = attr.name;
    if (seen.has(name) || !(GLOBAL_ATTRS.has(name) || allowed?.has(name))) continue;
    seen.add(name);
    let value = attr.value ?? '';
    if (URL_ATTRS.has(name)) {
      const url = safeUrl(value, tag === 'img');
      if (url === null) continue;
      value = decodeEntities(url);
    } else {
      value = decodeEntities(value);
    }
    if (name === 'target') {
      if (value !== '_blank') continue;
      blank = true;
    }
    if (name === 'rel') continue; // regenerated below
    out.push(` ${name}="${escapeHtml(value)}"`);
  }
  if (tag === 'a' && blank) out.push(' rel="noopener noreferrer"');
  return out.join('');
}

/** Sanitize an HTML fragment (see module comment). */
export function sanitizeHtml(input: string, options: { allowImages?: boolean } = {}): string {
  if (typeof input !== 'string') return '';
  if (input.length > MAX_SANITIZE_INPUT) throw new RangeError('HTML is too large to sanitize');
  const src = input.replace(/\u0000/g, '');
  const out: string[] = [];
  const open: string[] = [];
  let skip: { tag: string; depth: number } | null = null;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    const textEnd = lt < 0 ? n : lt;
    if (textEnd > i) {
      if (!skip) out.push(escapeText(src.slice(i, textEnd)));
      i = textEnd;
      continue;
    }
    // src[i] === '<'
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    const next = src[i + 1] ?? '';
    if (next === '!' || next === '?') {
      const end = src.indexOf('>', i + 2);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const closing = next === '/';
    const nameStart = closing ? i + 2 : i + 1;
    if (!/[a-z]/i.test(src[nameStart] ?? '')) {
      if (closing) { // '</' + non-letter: a bogus comment in HTML5
        const end = src.indexOf('>', nameStart);
        i = end < 0 ? n : end + 1;
        continue;
      }
      if (!skip) out.push('&lt;');
      i += 1;
      continue;
    }
    let j = nameStart;
    while (j < n && !/[\s/>]/.test(src[j]!)) j++;
    const tag = src.slice(nameStart, j).toLowerCase();
    // attributes
    const attrs: Attr[] = [];
    let terminated = false;
    while (j < n) {
      while (j < n && /[\s/]/.test(src[j]!)) j++;
      if (j >= n) break;
      if (src[j] === '>') { terminated = true; j++; break; }
      let k = j;
      while (k < n && !/[\s/>=]/.test(src[k]!)) k++;
      const name = src.slice(j, k === j ? j + 1 : k).toLowerCase();
      j = k === j ? j + 1 : k;
      while (j < n && /\s/.test(src[j]!)) j++;
      let value: string | null = null;
      if (src[j] === '=') {
        j++;
        while (j < n && /\s/.test(src[j]!)) j++;
        const quote = src[j];
        if (quote === '"' || quote === "'") {
          const end = src.indexOf(quote, j + 1);
          if (end < 0) { j = n; break; }
          value = src.slice(j + 1, end);
          j = end + 1;
        } else {
          let e = j;
          while (e < n && !/[\s>]/.test(src[e]!)) e++;
          value = src.slice(j, e);
          j = e;
        }
      }
      attrs.push({ name, value });
    }
    if (!terminated) break; // unterminated tag at the end: drop the rest
    i = j;
    if (skip) {
      if (tag === skip.tag) skip.depth += closing ? -1 : 1;
      if (skip.depth <= 0) skip = null;
      continue;
    }
    if (closing) {
      const at = open.lastIndexOf(tag);
      if (at >= 0) while (open.length > at) out.push(`</${open.pop()!}>`);
      continue;
    }
    if (RAW_TEXT_TAGS.has(tag)) {
      if (tag === 'plaintext') { i = n; break; }
      const re = new RegExp(`</${tag}[\\s/>]`, 'ig');
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m) { i = n; break; }
      const end = src.indexOf('>', m.index);
      i = end < 0 ? n : end + 1;
      continue;
    }
    if (DROP_CONTENT_TAGS.has(tag)) {
      skip = { tag, depth: 1 };
      continue;
    }
    if (!(options.allowImages === false ? PORTAL_ALLOWED_TAGS : ALLOWED_TAGS).has(tag)) continue;
    out.push(`<${tag}${serializeAttrs(tag, attrs)}>`);
    if (!VOID_TAGS.has(tag)) {
      if (open.length >= 200) throw new RangeError('HTML nesting is too deep');
      open.push(tag);
    }
  }
  while (open.length) out.push(`</${open.pop()!}>`);
  return out.join('');
}

/** Visible text of sanitized HTML (used for emptiness checks). */
export function htmlText(html: string): string {
  return decodeEntities(sanitizeHtml(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
