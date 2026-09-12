// ─── EML (RFC 822/2045) parser ───────────────────────────────
//
// Minimal self-contained parser for .eml files: unfolded headers, RFC 2047
// encoded-words, nested multipart bodies, quoted-printable and base64
// transfer encodings, charset-aware decoding via TextDecoder. No external
// dependency — covers what investigation work needs (headers, text body,
// attachment list), not full MIME fidelity.

export interface EmlAttachment {
  filename: string;
  mimeType: string;
  /** Approximate decoded size in bytes (from base64 length when available). */
  size: number | null;
}

export interface ParsedEml {
  /** All top-level headers, lowercased name → decoded value (first occurrence). */
  headers: Map<string, string>;
  /** Every Received header, in file order (most recent first). */
  received: string[];
  from: string | null;
  to: string | null;
  cc: string | null;
  replyTo: string | null;
  returnPath: string | null;
  subject: string | null;
  date: Date | null;
  messageId: string | null;
  mailer: string | null;
  /** Best-effort originating IP (X-Originating-IP, else oldest Received). */
  originIp: string | null;
  textBody: string | null;
  htmlBody: string | null;
  attachments: EmlAttachment[];
  /** http(s) links found in the body (href + plain text), deduplicated. */
  links: string[];
  /** Remote images referenced by the HTML body (img src) — tracking pixels included. */
  imageLinks: string[];
}

// ── Bytes / charset helpers ──

function decodeBytes(bytes: Uint8Array, charset: string | null): string {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function latin1ToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function decodeBase64(s: string): Uint8Array | null {
  try {
    const clean = s.replace(/[^A-Za-z0-9+/=]/g, '');
    const bin = atob(clean);
    return latin1ToBytes(bin);
  } catch {
    return null;
  }
}

function decodeQuotedPrintable(s: string): Uint8Array {
  // Soft line breaks first, then =XX sequences
  const unfolded = s.replace(/=\r?\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < unfolded.length; i++) {
    const c = unfolded[i];
    if (c === '=' && i + 2 < unfolded.length && /^[0-9A-Fa-f]{2}$/.test(unfolded.slice(i + 1, i + 3))) {
      out.push(parseInt(unfolded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(c.charCodeAt(0) & 0xff);
    }
  }
  return new Uint8Array(out);
}

// ── RFC 2047 encoded-words in headers: =?charset?B|Q?...?= ──

function decodeEncodedWords(value: string): string {
  // Adjacent encoded-words separated by whitespace must merge without the space
  const collapsed = value.replace(/(\?=)\s+(=\?)/g, '$1$2');
  return collapsed.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (whole, charset: string, enc: string, data: string) => {
      if (enc.toUpperCase() === 'B') {
        const bytes = decodeBase64(data);
        return bytes ? decodeBytes(bytes, charset) : whole;
      }
      // Q encoding: underscore = space, then quoted-printable
      const bytes = decodeQuotedPrintable(data.replace(/_/g, ' '));
      return decodeBytes(bytes, charset);
    }
  );
}

// ── Header block parsing ──

interface HeaderBlock {
  /** lowercased name → decoded value (first occurrence wins). */
  map: Map<string, string>;
  /** All values for repeated headers (e.g. Received). */
  all: Array<{ name: string; value: string }>;
}

function parseHeaders(raw: string): HeaderBlock {
  const map = new Map<string, string>();
  const all: Array<{ name: string; value: string }> = [];
  // Unfold: continuation lines start with space/tab
  const unfolded = raw.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = decodeEncodedWords(line.slice(idx + 1).trim());
    all.push({ name, value });
    if (!map.has(name)) map.set(name, value);
  }
  return { map, all };
}

/** Extract a parameter (e.g. boundary, charset, filename) from a header value. */
function headerParam(value: string | undefined, param: string): string | null {
  if (!value) return null;
  // RFC 2231 continuations (filename*0=, filename*1=…) — concatenate
  const continued = [...value.matchAll(new RegExp(`${param}\\*\\d+\\*?=("[^"]*"|[^;\\s]*)`, 'gi'))];
  if (continued.length > 0) {
    let joined = continued.map((m) => m[1].replace(/^"|"$/g, '')).join('');
    // RFC 2231 first segment may carry charset''prefix
    const extMatch = joined.match(/^([\w-]+)''(.*)$/);
    if (extMatch) {
      try {
        joined = decodeURIComponent(extMatch[2]);
      } catch {
        joined = extMatch[2];
      }
    }
    return joined;
  }
  const m = value.match(new RegExp(`${param}\\s*=\\s*("[^"]*"|[^;\\s]*)`, 'i'));
  if (!m) return null;
  return m[1].replace(/^"|"$/g, '') || null;
}

// ── Body / multipart ──

interface MimePart {
  headers: HeaderBlock;
  /** Raw body as latin1 string (bytes preserved). */
  rawBody: string;
}

function splitHeadersBody(raw: string): { headerRaw: string; body: string } {
  const m = raw.match(/\r?\n\r?\n/);
  if (!m || m.index === undefined) return { headerRaw: raw, body: '' };
  return { headerRaw: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) };
}

function splitMultipart(body: string, boundary: string): string[] {
  const marker = `--${boundary}`;
  const segments = body.split(new RegExp(`(?:^|\r?\n)${escapeRegExp(marker)}`));
  // First segment is the preamble; a segment starting with `--` is the closer
  return segments
    .slice(1)
    .filter((seg) => !seg.startsWith('--'))
    .map((seg) => seg.replace(/^\r?\n/, ''));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodePartBody(part: MimePart): string {
  const encoding = (part.headers.map.get('content-transfer-encoding') || '').toLowerCase().trim();
  const charset = headerParam(part.headers.map.get('content-type'), 'charset');
  if (encoding === 'base64') {
    const bytes = decodeBase64(part.rawBody);
    return bytes ? decodeBytes(bytes, charset) : '';
  }
  if (encoding === 'quoted-printable') {
    return decodeBytes(decodeQuotedPrintable(part.rawBody), charset);
  }
  return decodeBytes(latin1ToBytes(part.rawBody), charset);
}

/** Recursively walk MIME parts, collecting bodies and attachments. */
function walkPart(
  part: MimePart,
  out: { text: string[]; html: string[]; attachments: EmlAttachment[] },
  depth: number
): void {
  if (depth > 10) return;
  const contentType = part.headers.map.get('content-type') || 'text/plain';
  const mime = contentType.split(';')[0].trim().toLowerCase();
  const disposition = part.headers.map.get('content-disposition') || '';
  const filename =
    headerParam(disposition, 'filename') || headerParam(contentType, 'name');

  if (mime.startsWith('multipart/')) {
    const boundary = headerParam(contentType, 'boundary');
    if (!boundary) return;
    for (const seg of splitMultipart(part.rawBody, boundary)) {
      const { headerRaw, body } = splitHeadersBody(seg);
      walkPart({ headers: parseHeaders(headerRaw), rawBody: body }, out, depth + 1);
    }
    return;
  }

  const isAttachment = /^attachment/i.test(disposition) || (!!filename && !mime.startsWith('text/'));
  if (isAttachment && filename) {
    const encoding = (part.headers.map.get('content-transfer-encoding') || '').toLowerCase();
    const size = encoding.includes('base64')
      ? Math.floor((part.rawBody.replace(/\s/g, '').length * 3) / 4)
      : part.rawBody.length;
    out.attachments.push({ filename: decodeEncodedWords(filename), mimeType: mime, size });
    return;
  }

  if (mime === 'text/plain') {
    out.text.push(decodePartBody(part));
  } else if (mime === 'text/html') {
    out.html.push(decodePartBody(part));
  } else if (mime === 'message/rfc822') {
    // Forwarded message embedded as a part: recurse into it
    const { headerRaw, body } = splitHeadersBody(part.rawBody);
    walkPart({ headers: parseHeaders(headerRaw), rawBody: body }, out, depth + 1);
  } else if (filename) {
    out.attachments.push({ filename: decodeEncodedWords(filename), mimeType: mime, size: null });
  }
}

// ── Origin IP heuristics ──

const PRIVATE_IP =
  /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|f[cd][0-9a-f]{2}:|fe80:)/i;

function extractOriginIp(headerBlock: HeaderBlock): string | null {
  const xOrig = headerBlock.map.get('x-originating-ip');
  if (xOrig) {
    const m = xOrig.match(/[\d.]+|[0-9a-f:]{4,}/i);
    if (m) return m[0];
  }
  // Received headers are prepended by each hop: the LAST one is closest to the
  // sender. Walk from the bottom up and return the first public IP.
  const received = headerBlock.all.filter((h) => h.name === 'received').map((h) => h.value);
  for (let i = received.length - 1; i >= 0; i--) {
    const ips = received[i].match(/\b(\d{1,3}\.){3}\d{1,3}\b/g) || [];
    for (const ip of ips) {
      if (!PRIVATE_IP.test(ip)) return ip;
    }
  }
  return null;
}

// ── Body links ──

function dedupe(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const clean = u.replace(/[)\].,;>"']+$/, '');
    if (!seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

function extractBodyLinks(
  textBody: string | null,
  htmlBody: string | null
): { links: string[]; imageLinks: string[] } {
  const links: string[] = [];
  const imageLinks: string[] = [];

  if (htmlBody) {
    for (const m of htmlBody.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi)) {
      imageLinks.push(m[1]);
    }
    for (const m of htmlBody.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi)) {
      links.push(m[1]);
    }
  }
  if (textBody) {
    for (const m of textBody.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
      links.push(m[0]);
    }
  }

  const images = dedupe(imageLinks);
  const imageSet = new Set(images);
  return { links: dedupe(links).filter((u) => !imageSet.has(u)), imageLinks: images };
}

// ── Public API ──

export function parseEml(rawLatin1: string): ParsedEml {
  const { headerRaw, body } = splitHeadersBody(rawLatin1);
  const headerBlock = parseHeaders(headerRaw);
  const out = { text: [] as string[], html: [] as string[], attachments: [] as EmlAttachment[] };
  walkPart({ headers: headerBlock, rawBody: body }, out, 0);

  const h = (name: string) => headerBlock.map.get(name) ?? null;

  let date: Date | null = null;
  const rawDate = h('date');
  if (rawDate) {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) date = d;
  }

  const textBody = out.text.length > 0 ? out.text.join('\n\n').trim() : null;
  const htmlBody = out.html.length > 0 ? out.html.join('\n\n').trim() : null;
  const { links, imageLinks } = extractBodyLinks(textBody, htmlBody);

  return {
    headers: headerBlock.map,
    received: headerBlock.all.filter((x) => x.name === 'received').map((x) => x.value),
    from: h('from'),
    to: h('to'),
    cc: h('cc'),
    replyTo: h('reply-to'),
    returnPath: h('return-path'),
    subject: h('subject'),
    date,
    messageId: h('message-id'),
    mailer: h('x-mailer') ?? h('user-agent'),
    originIp: extractOriginIp(headerBlock),
    textBody,
    htmlBody,
    attachments: out.attachments,
    links,
    imageLinks,
  };
}

/** Read a File as a latin1 string (1 byte ↔ 1 char, lossless for re-decoding). */
export async function readFileAsLatin1(arrayBuffer: ArrayBuffer): Promise<string> {
  return new TextDecoder('latin1').decode(new Uint8Array(arrayBuffer));
}

export function isEmlFile(name: string, mimeType: string): boolean {
  return mimeType === 'message/rfc822' || name.toLowerCase().endsWith('.eml');
}
