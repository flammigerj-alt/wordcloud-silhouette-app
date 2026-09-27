/**
 * Eine Webseite abrufen - nur auf ausdrücklichen Wunsch, nur unter Node.
 *
 * Das ist der einzige Teil des Werkzeugs, der ins Netz geht. Deshalb bewusst
 * zurückhaltend: kein JavaScript, keine Cookies, keine Bilder, nur das
 * HTML-Dokument selbst. Weiterleitungen werden einzeln verfolgt und
 * mitgeschrieben, weil die Kette selbst ein Befund sein kann.
 *
 * Adressen im eigenen Netz (Router, localhost, 192.168.x.x ...) werden
 * verweigert: Eine fremde Seite soll den Abruf nicht als Sprungbrett ins
 * Heimnetz benutzen können.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { zerlegeAdresse } from './rules/website.js';
import { htmlToText } from './utils.js';

/**
 * Viele Betrugsseiten zeigen Programmen eine harmlose Fassung und nur
 * Browsern die echte. Deshalb meldet sich der Abruf wie ein gewöhnlicher Browser.
 */
const BROWSER_KENNUNG = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const STANDARD = {
  zeitlimitMs: 10000,
  maxBytes: 2 * 1024 * 1024,
  maxWeiterleitungen: 6,
  erlaubePrivat: false,
};

/** Liegt die IP-Adresse im eigenen Netz oder ist sie sonst nicht öffentlich? */
export function istPrivateIp(ip) {
  const adresse = String(ip).toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(adresse) === 4) {
    const [a, b] = adresse.split('.').map(Number);
    return a === 0 || a === 10 || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (isIP(adresse) === 6) {
    if (adresse === '::' || adresse === '::1') return true;
    const gemappt = adresse.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (gemappt) return istPrivateIp(gemappt[1]);
    return /^(?:fc|fd|fe[89ab]|ff)/.test(adresse);
  }
  return true;
}

async function pruefeZiel(host, erlaubePrivat) {
  if (erlaubePrivat) return;
  const adressen = isIP(host.replace(/^\[|\]$/g, ''))
    ? [{ address: host }]
    : await lookup(host, { all: true, verbatim: true });
  if (!adressen.length) throw new Error(`${host} ist nicht auflösbar`);
  const privat = adressen.find((a) => istPrivateIp(a.address));
  if (privat) throw new Error(`${host} zeigt ins eigene Netz (${privat.address}) - Abruf verweigert`);
}

/** Zeichensatz aus dem Content-Type, sonst aus dem Dokument selbst. */
function dekodiere(bytes, contentType) {
  let charset = (String(contentType).match(/charset=["']?([\w-]+)/i) || [])[1];
  if (!charset) {
    const kopf = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
    charset = (kopf.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

async function leseBegrenzt(antwort, maxBytes) {
  if (!antwort.body) return { bytes: new Uint8Array(), abgeschnitten: false };
  const leser = antwort.body.getReader();
  const teile = [];
  let laenge = 0;
  let abgeschnitten = false;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    teile.push(value);
    laenge += value.length;
    if (laenge >= maxBytes) {
      abgeschnitten = true;
      await leser.cancel();
      break;
    }
  }
  const bytes = new Uint8Array(Math.min(laenge, maxBytes));
  let pos = 0;
  for (const teil of teile) {
    const stueck = teil.subarray(0, bytes.length - pos);
    bytes.set(stueck, pos);
    pos += stueck.length;
  }
  return { bytes, abgeschnitten };
}

/** Titel und Beschreibung stehen im Kopf, den htmlToText verwirft. */
function kopfText(html) {
  const titel = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const beschreibung = (html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || [])[1] || '';
  return [titel, beschreibung].map((t) => htmlToText(t)).filter(Boolean).join('\n');
}

/**
 * Seite abrufen. Wirft nie: Fehler stehen im Ergebnis unter `fehler`.
 * @param {string} eingabe Adresse, wie sie auch analysiereAdresse() nimmt.
 * @returns {Promise<object>} ok, status, startUrl, endUrl, kette, contentType, html, text, skripte, abgeschnitten, fehler
 */
export async function ruefeSeiteAb(eingabe, optionen = {}) {
  const opt = { ...STANDARD, ...optionen };
  const holen = opt.fetch || globalThis.fetch;
  const start = zerlegeAdresse(eingabe);
  const ergebnis = {
    ok: false, status: 0, startUrl: start.url, endUrl: '', kette: [],
    contentType: '', html: '', text: '', skripte: 0, abgeschnitten: false, fehler: '',
  };
  if (!start.gueltig) {
    ergebnis.fehler = 'Keine gültige Webadresse';
    return ergebnis;
  }

  const abbruch = new AbortController();
  const uhr = setTimeout(() => abbruch.abort(), opt.zeitlimitMs);
  let url = start.url;
  try {
    for (let schritt = 0; ; schritt++) {
      const ziel = new URL(url);
      if (!['http:', 'https:'].includes(ziel.protocol)) throw new Error(`Weiterleitung auf ${ziel.protocol} - nicht verfolgt`);
      await (opt.pruefeZiel ? opt.pruefeZiel(ziel.hostname) : pruefeZiel(ziel.hostname, opt.erlaubePrivat));

      const antwort = await holen(url, {
        redirect: 'manual',
        signal: abbruch.signal,
        headers: {
          'user-agent': BROWSER_KENNUNG,
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'accept-language': 'de-DE,de;q=0.9,en;q=0.6',
        },
      });
      ergebnis.kette.push({ url, status: antwort.status });

      const weiter = antwort.headers.get('location');
      if (antwort.status >= 300 && antwort.status < 400 && weiter) {
        if (schritt >= opt.maxWeiterleitungen) throw new Error('Zu viele Weiterleitungen');
        await antwort.body?.cancel();
        url = new URL(weiter, url).toString();
        continue;
      }

      ergebnis.status = antwort.status;
      ergebnis.endUrl = url;
      ergebnis.contentType = antwort.headers.get('content-type') || '';
      if (ergebnis.contentType && !/html|text\/plain|xml/i.test(ergebnis.contentType)) {
        await antwort.body?.cancel();
        throw new Error(`Die Adresse liefert keine Webseite, sondern ${ergebnis.contentType.split(';')[0]}`);
      }
      const { bytes, abgeschnitten } = await leseBegrenzt(antwort, opt.maxBytes);
      ergebnis.abgeschnitten = abgeschnitten;
      ergebnis.html = dekodiere(bytes, ergebnis.contentType);
      ergebnis.text = [kopfText(ergebnis.html), htmlToText(ergebnis.html)].filter(Boolean).join('\n\n');
      ergebnis.skripte = (ergebnis.html.match(/<script\b/gi) || []).length;
      ergebnis.ok = antwort.status >= 200 && antwort.status < 300;
      if (!ergebnis.ok) ergebnis.fehler = `Der Server antwortet mit Status ${antwort.status}`;
      return ergebnis;
    }
  } catch (fehler) {
    ergebnis.fehler = abbruch.signal.aborted
      ? `Keine Antwort innerhalb von ${Math.round(opt.zeitlimitMs / 1000)} Sekunden`
      : String(fehler?.cause?.message || fehler?.message || fehler);
    return ergebnis;
  } finally {
    clearTimeout(uhr);
  }
}

