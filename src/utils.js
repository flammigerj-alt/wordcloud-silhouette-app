import { HOMOGLYPHS } from './data.js';
import { registrableDomain } from './parse-eml.js';

/** Levenshtein-Distanz, begrenzt auf sinnvolle Längen. */
export function levenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const curr = [i];
    for (let j = 1; j <= t.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[t.length];
}

/** Zeichen aus fremden Schriftsystemen auf ihr lateinisches Aussehen abbilden. */
export function normalizeHomoglyphs(text) {
  return String(text).replace(/./gu, (ch) => HOMOGLYPHS[ch] || ch);
}

/** Findet Zeichen, die wie lateinische aussehen, aber keine sind. */
export function findHomoglyphs(text) {
  const found = [];
  for (const ch of String(text)) {
    if (HOMOGLYPHS[ch]) found.push(ch);
  }
  return [...new Set(found)];
}

/**
 * Tippfehler-Varianten einer Domain erkennen: paypaI.com, arnazon.de, g00gle.com.
 * Normalisiert typische optische Verwechslungen und vergleicht dann.
 */
export function opticalNormalize(text) {
  return normalizeHomoglyphs(String(text).toLowerCase())
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/[0]/g, 'o')
    .replace(/[1l|]/g, 'i')
    .replace(/[5]/g, 's')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[8]/g, 'b')
    .replace(/[-_.]/g, '');
}

/** Sichtbaren Text aus HTML gewinnen, ohne Skripte und Styles. */
export function htmlToText(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Ein Link mit allem, was die Regeln darüber wissen müssen. */
function makeLink(url, quelle, ankerText = '') {
  const link = {
    url: String(url).trim(),
    quelle,
    ankerText: String(ankerText).trim(),
    schema: '',
    host: '',
    domain: '',
    port: '',
    pfad: '',
    query: '',
    gueltig: false,
  };
  const schemaMatch = link.url.match(/^([a-z][a-z0-9+.-]*):/i);
  link.schema = schemaMatch ? schemaMatch[1].toLowerCase() : '';

  if (link.schema === 'data' || link.schema === 'javascript' || link.schema === 'vbscript') {
    return link;
  }
  try {
    const parsed = new URL(link.schema ? link.url : `http://${link.url}`);
    link.schema = parsed.protocol.replace(':', '');
    link.host = parsed.hostname.toLowerCase();
    link.domain = registrableDomain(link.host);
    link.port = parsed.port;
    link.pfad = parsed.pathname;
    link.query = parsed.search;
    link.benutzerInfo = parsed.username || '';
    link.gueltig = true;
  } catch {
    link.gueltig = false;
  }
  return link;
}

const URL_IN_TEXT = /\b(?:(?:https?|ftp):\/\/|www\.)[^\s<>"'()\[\]{}]+[^\s<>"'()\[\]{}.,;:!?]/gi;

/**
 * Alle Links aus Text und HTML einsammeln - inklusive Ankertext,
 * denn die Abweichung zwischen sichtbarem Text und Ziel ist das
 * stärkste Einzelsignal überhaupt.
 */
export function extractLinks({ text = '', html = '' } = {}) {
  const links = [];
  const seen = new Set();

  const push = (url, quelle, anker) => {
    const cleaned = String(url).trim().replace(/^[<(]+|[>)]+$/g, '');
    if (!cleaned) return;
    const key = `${quelle}|${cleaned}|${anker || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(makeLink(cleaned, quelle, anker));
  };

  // Anker aus dem HTML samt sichtbarem Text.
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(html)) !== null) {
    const href = match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!href) continue;
    const target = (href[1] ?? href[2] ?? href[3] ?? '').replace(/&amp;/gi, '&');
    push(target, 'anker', htmlToText(match[2]));
  }

  // Weitere URL-tragende Attribute: Bilder, Frames, Formularziele.
  const attrRe = /\b(?:src|action|background|formaction|data-url|data-href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  while ((match = attrRe.exec(html)) !== null) {
    const target = (match[1] ?? match[2] ?? match[3] ?? '').replace(/&amp;/gi, '&');
    if (/^https?:\/\//i.test(target)) push(target, 'attribut', '');
  }

  // Klartext-URLs aus beiden Körperteilen.
  for (const [quelle, quelltext] of [['text', text], ['html-text', htmlToText(html)]]) {
    const matches = String(quelltext).match(URL_IN_TEXT) || [];
    for (const url of matches) push(url, quelle, url);
  }

  return links;
}

/** Nachvollziehbare Kurzfassung eines Beweises für die Ausgabe. */
export function kuerzen(text, laenge = 160) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length <= laenge ? clean : `${clean.slice(0, laenge - 1)}…`;
}

/** Ist der Host eine rohe IP-Adresse? */
export function istIpAdresse(host) {
  const h = String(host || '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return h.split('.').every((o) => Number(o) <= 255);
  if (/^\[?[0-9a-f:]+\]?$/i.test(h) && h.includes(':')) return true;
  // Dezimal- oder Hex-Notation, z. B. http://3232235777/
  if (/^\d{8,12}$/.test(h)) return true;
  if (/^0x[0-9a-f]+$/i.test(h)) return true;
  return false;
}

/**
 * Steckt ein Markenname als eigenständiges Wort in einem Text oder Hostnamen?
 *
 * Bewusst NICHT als einfacher Teilstring-Vergleich: sonst findet "ing" sich in
 * "Holding", "o2" in "Duo24" und jede Firma mit solchen Silben im Namen wird
 * fälschlich als Markenmissbrauch gemeldet. Verglichen werden einzelne Wörter
 * bzw. Namensbestandteile, zusätzlich benachbarte Paare (für "Deutsche Bank").
 */
export function enthaeltMarkenname(text, token) {
  const tokenNorm = opticalNormalize(token);
  if (!tokenNorm) return false;

  const teile = String(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((t) => opticalNormalize(t))
    .filter(Boolean);
  if (!teile.length) return false;

  if (teile.includes(tokenNorm)) return true;

  // Zusammengesetzte Marken wie "deutsche-bank" über zwei Wörter hinweg.
  for (let i = 0; i < teile.length - 1; i++) {
    if (teile[i] + teile[i + 1] === tokenNorm) return true;
  }

  // Längere Marken dürfen auch in einem Wort stecken ("paypalsicherheit"),
  // kurze nicht - sonst fängt man wieder jede Zufallssilbe ein.
  if (tokenNorm.length >= 5 && teile.some((t) => t.includes(tokenNorm))) return true;

  return false;
}
