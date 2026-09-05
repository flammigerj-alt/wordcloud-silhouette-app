/**
 * Minimaler, abhängigkeitsfreier Parser für RFC-5322/2045-Mails.
 * Läuft unverändert in Node >= 18 und in jedem modernen Browser:
 * benutzt nur atob, TextDecoder und TextEncoder.
 *
 * Der Parser ist bewusst fehlertolerant. Phishing-Mails sind oft kaputt
 * aufgebaut - genau deshalb dürfen wir daran nicht scheitern.
 */

/** Mehrteilige Public Suffixes, die für den deutschsprachigen Raum relevant sind. */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'sch.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'com.br', 'com.mx', 'com.ar', 'com.tr', 'com.cn', 'com.hk',
  'com.sg', 'com.tw', 'co.jp', 'ne.jp', 'or.jp', 'co.za', 'co.in',
  'co.il', 'co.kr', 'com.pl', 'com.ua', 'com.ru', 'org.il',
]);

function bytesFromBase64(input) {
  const clean = String(input).replace(/[^A-Za-z0-9+/=]/g, '');
  const padded = clean.length % 4 === 0 ? clean : clean + '='.repeat(4 - (clean.length % 4));
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function decodeBytes(bytes, charset) {
  const label = String(charset || 'utf-8').trim().replace(/^["']|["']$/g, '') || 'utf-8';
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
      return String.fromCharCode(...bytes);
    }
  }
}

/** Quoted-Printable nach RFC 2045. */
export function decodeQuotedPrintable(text, charset = 'utf-8') {
  const joined = String(text).replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < joined.length; i++) {
    const ch = joined[i];
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code < 256) bytes.push(code);
    else for (const b of new TextEncoder().encode(ch)) bytes.push(b);
  }
  return decodeBytes(new Uint8Array(bytes), charset);
}

/** Encoded Words nach RFC 2047, z. B. =?UTF-8?B?SGFsbG8=?= */
export function decodeEncodedWords(value) {
  const str = String(value ?? '');
  if (!str.includes('=?')) return str;
  return str
    // Whitespace zwischen zwei benachbarten Encoded Words fällt laut RFC weg.
    .replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?[^?]+\?[BbQq]\?)/g, '$1')
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (match, charset, encoding, data) => {
      try {
        if (encoding.toUpperCase() === 'B') return decodeBytes(bytesFromBase64(data), charset);
        return decodeQuotedPrintable(data.replace(/_/g, ' '), charset);
      } catch {
        return match;
      }
    });
}

/** Trennt Header-Block und Body an der ersten Leerzeile. */
export function splitHeadersAndBody(raw) {
  const normalized = String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const index = normalized.indexOf('\n\n');
  if (index === -1) return { headerBlock: normalized, body: '' };
  return { headerBlock: normalized.slice(0, index), body: normalized.slice(index + 2) };
}

/** Header entfalten und in eine geordnete Liste zerlegen. */
export function parseHeaderBlock(headerBlock) {
  const unfolded = String(headerBlock).replace(/\n[ \t]+/g, ' ');
  const headers = [];
  for (const line of unfolded.split('\n')) {
    const match = line.match(/^([!-9;-~]+):[ \t]*(.*)$/);
    if (!match) continue;
    headers.push({
      name: match[1],
      key: match[1].toLowerCase(),
      raw: match[2].trim(),
      value: decodeEncodedWords(match[2].trim()),
    });
  }
  return headers;
}

/** Header mit Parametern zerlegen, z. B. Content-Type oder Content-Disposition. */
export function parseParameterizedHeader(value) {
  const result = { value: '', params: {} };
  const str = String(value ?? '').trim();
  if (!str) return result;

  const segments = [];
  let current = '';
  let inQuotes = false;
  for (const ch of str) {
    if (ch === '"') { inQuotes = !inQuotes; current += ch; continue; }
    if (ch === ';' && !inQuotes) { segments.push(current); current = ''; continue; }
    current += ch;
  }
  segments.push(current);

  result.value = segments.shift().trim().toLowerCase();

  const continuations = new Map();
  for (const segment of segments) {
    const match = segment.match(/^\s*([\w!#$%&'*+.^_`|~-]+?)(\*\d+)?(\*)?\s*=\s*([\s\S]*)$/);
    if (!match) continue;
    const [, name, index, extended, rawValue] = match;
    let val = rawValue.trim().replace(/^"([\s\S]*)"$/, '$1');
    if (extended) {
      const ext = val.match(/^([\w-]*)'([\w-]*)'([\s\S]*)$/);
      if (ext) {
        try { val = decodeURIComponent(ext[3]); } catch { val = ext[3]; }
      } else {
        try { val = decodeURIComponent(val); } catch { /* Wert unverändert lassen */ }
      }
    }
    const key = name.toLowerCase();
    if (index) {
      const bucket = continuations.get(key) || [];
      bucket.push([parseInt(index.slice(1), 10), val]);
      continuations.set(key, bucket);
    } else {
      result.params[key] = decodeEncodedWords(val);
    }
  }
  for (const [key, parts] of continuations) {
    parts.sort((a, b) => a[0] - b[0]);
    result.params[key] = decodeEncodedWords(parts.map((p) => p[1]).join(''));
  }
  return result;
}

/** Adressliste eines Headers zerlegen (From, To, Reply-To, ...). */
export function parseAddressList(value) {
  const str = String(value ?? '').trim();
  if (!str) return [];

  const entries = [];
  let current = '';
  let inQuotes = false;
  let inAngle = false;
  for (const ch of str) {
    if (ch === '"') { inQuotes = !inQuotes; current += ch; continue; }
    if (ch === '<' && !inQuotes) inAngle = true;
    if (ch === '>' && !inQuotes) inAngle = false;
    if (ch === ',' && !inQuotes && !inAngle) { entries.push(current); current = ''; continue; }
    current += ch;
  }
  entries.push(current);

  return entries
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const angle = entry.match(/<([^>]*)>/);
      const address = (angle ? angle[1] : entry).trim().replace(/^mailto:/i, '');
      let display = angle ? entry.slice(0, angle.index).trim() : '';
      display = decodeEncodedWords(display).replace(/^"([\s\S]*)"$/, '$1').trim();
      const at = address.lastIndexOf('@');
      return {
        raw: entry,
        display,
        address,
        local: at === -1 ? address : address.slice(0, at),
        domain: at === -1 ? '' : address.slice(at + 1).toLowerCase().replace(/[.>\s]+$/, ''),
      };
    });
}

/** Registrierbare Domain ermitteln, z. B. mail.beispiel.co.uk -> beispiel.co.uk */
export function registrableDomain(host) {
  const clean = String(host || '').toLowerCase().trim().replace(/^\.+|\.+$/g, '');
  if (!clean || !clean.includes('.')) return clean;
  const labels = clean.split('.');
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.has(lastTwo) && labels.length >= 3) return labels.slice(-3).join('.');
  return lastTwo;
}

function decodePartBody(body, encoding, charset) {
  const cte = String(encoding || '7bit').trim().toLowerCase();
  try {
    if (cte === 'base64') return decodeBytes(bytesFromBase64(body), charset);
    if (cte === 'quoted-printable') return decodeQuotedPrintable(body, charset);
  } catch {
    return body;
  }
  const label = String(charset || '').toLowerCase();
  if (label && !/^(us-ascii|ascii|utf-?8)$/.test(label)) {
    const bytes = new Uint8Array(body.length);
    for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff;
    return decodeBytes(bytes, label);
  }
  return body;
}

function splitMultipart(body, boundary) {
  const delimiter = `--${boundary}`;
  const chunks = [];
  let current = null;
  for (const line of String(body).split('\n')) {
    const trimmed = line.replace(/[ \t\r]+$/, '');
    if (trimmed === delimiter) {
      if (current !== null) chunks.push(current.join('\n'));
      current = [];
      continue;
    }
    if (trimmed === `${delimiter}--`) {
      if (current !== null) chunks.push(current.join('\n'));
      current = null;
      break;
    }
    if (current !== null) current.push(line);
  }
  if (current !== null) chunks.push(current.join('\n'));
  return chunks;
}

function estimateSize(body, encoding) {
  const length = String(body).replace(/\s/g, '').length;
  if (String(encoding).toLowerCase() === 'base64') return Math.floor((length * 3) / 4);
  return String(body).length;
}

function walkPart(headerBlock, body, collected, depth) {
  const headers = parseHeaderBlock(headerBlock);
  const get = (key) => (headers.find((h) => h.key === key) || {}).raw || '';

  const contentType = parseParameterizedHeader(get('content-type') || 'text/plain');
  const disposition = parseParameterizedHeader(get('content-disposition'));
  const encoding = get('content-transfer-encoding');
  const filename = disposition.params.filename || contentType.params.name || '';

  if (contentType.value.startsWith('multipart/') && contentType.params.boundary && depth < 12) {
    for (const chunk of splitMultipart(body, contentType.params.boundary)) {
      const split = splitHeadersAndBody(chunk);
      walkPart(split.headerBlock, split.body, collected, depth + 1);
    }
    return;
  }

  const isText = contentType.value.startsWith('text/') || contentType.value === '';
  const isAttachment = disposition.value === 'attachment' || (!!filename && !isText);

  if (isAttachment || filename) {
    collected.attachments.push({
      filename,
      contentType: contentType.value || 'application/octet-stream',
      encoding: String(encoding || '7bit').toLowerCase(),
      size: estimateSize(body, encoding),
      inline: disposition.value === 'inline',
      contentId: (get('content-id') || '').replace(/^<|>$/g, ''),
    });
    return;
  }

  const decoded = decodePartBody(body, encoding, contentType.params.charset);
  if (contentType.value === 'text/html') collected.htmlParts.push(decoded);
  else if (isText) collected.textParts.push(decoded);
}

const KNOWN_HEADER_KEYS = new Set([
  'from', 'to', 'cc', 'bcc', 'subject', 'date', 'sender', 'reply-to', 'received',
  'message-id', 'return-path', 'mime-version', 'content-type', 'delivered-to',
  'authentication-results', 'arc-authentication-results', 'dkim-signature',
  'received-spf', 'x-mailer', 'user-agent', 'list-unsubscribe', 'in-reply-to',
  'references', 'content-transfer-encoding', 'precedence', 'auto-submitted',
  'x-originating-ip', 'x-spam-status', 'x-spam-score', 'x-priority', 'importance',
  'organization', 'x-php-originating-script', 'x-sender', 'envelope-to',
]);

/**
 * Hauptfunktion: rohe Mail (oder bloßer Text) in eine Struktur zerlegen.
 * @param {string} raw
 */
export function parseEml(raw) {
  const input = String(raw ?? '');
  const { headerBlock, body } = splitHeadersAndBody(input);
  const headers = parseHeaderBlock(headerBlock);

  // Heuristik: Sieht der Kopf wirklich nach Mail-Headern aus?
  const knownCount = headers.filter((h) => KNOWN_HEADER_KEYS.has(h.key)).length;
  const isEmail = knownCount >= 2 || headers.some((h) => h.key === 'from');

  const collected = { textParts: [], htmlParts: [], attachments: [] };
  if (isEmail) {
    walkPart(headerBlock, body, collected, 0);
  } else {
    // Reiner Text ohne Header: alles als Body behandeln.
    if (/<[a-z][\s\S]*>/i.test(input)) collected.htmlParts.push(input);
    else collected.textParts.push(input);
  }

  const headerMap = new Map();
  for (const header of headers) {
    if (!headerMap.has(header.key)) headerMap.set(header.key, []);
    headerMap.get(header.key).push(header);
  }

  return {
    isEmail,
    raw: input,
    headers,
    headerMap,
    text: collected.textParts.join('\n\n').trim(),
    html: collected.htmlParts.join('\n').trim(),
    attachments: collected.attachments,
    /** Letzter (also der aussagekräftigste) Wert eines Headers. */
    header(name) {
      const list = headerMap.get(String(name).toLowerCase());
      return list && list.length ? list[list.length - 1].value : '';
    },
    /** Alle Werte eines Headers in Reihenfolge des Auftretens. */
    headerAll(name) {
      const list = headerMap.get(String(name).toLowerCase()) || [];
      return list.map((h) => h.value);
    },
  };
}
