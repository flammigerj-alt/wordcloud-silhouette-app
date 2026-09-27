import { CONTENT_SIGNALS } from '../data.js';
import { htmlToText, findHomoglyphs, kuerzen } from '../utils.js';
import { parseAddressList } from '../parse-eml.js';

const KAT = 'Inhalt';

/**
 * Falsch dekodiertes UTF-8 ("Mojibake"): ein Umlaut, der als zwei Zeichen
 * durchgereicht wurde. Bewusst aus ASCII-Escapes gebaut, damit die Quelldatei
 * selbst keine Sonderzeichen enthält.
 */
const MOJIBAKE = new RegExp('[\\u00c3\\u00e2\\u00c2][\\u0080-\\u00bf]', 'g');

function befund(id, schwere, gewicht, titel, erklaerung, beweis, rat) {
  return { id, kategorie: KAT, schwere, gewicht, titel, erklaerung, beweis: [].concat(beweis).filter(Boolean), rat };
}

/** Die Fundstelle mitsamt etwas Umgebung zeigen, damit die Bewertung nachvollziehbar bleibt. */
export function fundstelle(text, treffer) {
  const index = text.toLowerCase().indexOf(String(treffer).toLowerCase());
  if (index === -1) return kuerzen(treffer, 120);
  const start = Math.max(0, index - 45);
  const ende = Math.min(text.length, index + treffer.length + 45);
  const prefix = start > 0 ? '...' : '';
  const suffix = ende < text.length ? '...' : '';
  return `${prefix}${kuerzen(text.slice(start, ende), 160)}${suffix}`;
}

/**
 * Signalgruppen gegen einen Text prüfen. Jede Gruppe ergibt höchstens einen
 * Befund, mit den Fundstellen als Beweis.
 */
export function werteSignale(text, signale, praefix, kategorie) {
  const befunde = [];
  for (const signal of signale) {
    const treffer = [];
    for (const muster of signal.muster) {
      const gefunden = text.match(muster);
      if (gefunden) treffer.push(gefunden[0]);
      if (treffer.length >= 4) break;
    }
    if (!treffer.length) continue;

    // Mehrere unabhängige Treffer einer Gruppe wiegen etwas schwerer.
    const zuschlag = Math.min(treffer.length - 1, 2) * 3;
    befunde.push({
      id: `${praefix}-${signal.id}`,
      kategorie,
      schwere: signal.schwere,
      gewicht: signal.gewicht + zuschlag,
      titel: signal.titel,
      erklaerung: signal.erklaerung,
      beweis: [...new Set(treffer)].map((t) => fundstelle(text, t)),
      rat: signal.rat,
    });
  }
  return befunde;
}

export function pruefeInhalt(mail) {
  const befunde = [];
  const sichtbar = [mail.text, htmlToText(mail.html)].filter(Boolean).join('\n');
  const betreff = mail.header('subject');
  const gesamt = `${betreff}\n${sichtbar}`;

  if (!gesamt.trim()) {
    return [befund(
      'kein-inhalt', 'info', 0,
      'Kein lesbarer Text gefunden',
      'Ohne Text lassen sich die inhaltlichen Merkmale nicht prüfen.',
      [],
      'Füge den Text der Mail mit ein.',
    )];
  }

  befunde.push(...werteSignale(gesamt, CONTENT_SIGNALS, 'inhalt', KAT));

  // Anrede: steht der eigene Name überhaupt drin?
  const empfaenger = parseAddressList(mail.header('to'))[0];
  if (empfaenger && empfaenger.local) {
    const namensteile = empfaenger.local.split(/[._-]/).filter((t) => t.length >= 3);
    const nameKommtVor = namensteile.some((t) => sichtbar.toLowerCase().includes(t.toLowerCase()));
    const hatAnrede = /\b(sehr geehrte|liebe|hallo|guten tag|dear)\b/i.test(sichtbar);
    if (hatAnrede && !nameKommtVor && namensteile.length) {
      befunde.push(befund(
        'inhalt-name-fehlt', 'niedrig', 8,
        'Dein Name kommt im Text nicht vor',
        'Ein Anbieter, bei dem du wirklich Kunde bist, kennt und benutzt deinen Namen.',
        `Empfänger: ${empfaenger.address}`,
        'Für sich genommen schwach, im Zusammenspiel mit Zeitdruck und Links aber aussagekräftig.',
      ));
    }
  }

  const mojibake = gesamt.match(MOJIBAKE) || [];
  if (mojibake.length >= 3) {
    befunde.push(befund(
      'inhalt-zeichensalat', 'mittel', 14,
      'Falsch dargestellte Umlaute im Text',
      'Wenn ae, oe, ue und ss als Zeichenwirrwarr erscheinen, wurde die Mail mit einem fehlerhaft eingerichteten Werkzeug verschickt.',
      `${mojibake.length} betroffene Stellen im Text`,
      'Große Unternehmen bekommen ihre Umlaute hin. Ein deutliches Indiz für Massenversand aus fremder Hand.',
    ));
  }

  // Homoglyphen mitten im Fließtext.
  const homoText = findHomoglyphs(gesamt);
  if (homoText.length >= 2) {
    befunde.push(befund(
      'inhalt-homoglyphen', 'mittel', 18,
      'Fremde Schriftzeichen im deutschen Text',
      'Einzelne kyrillische oder griechische Buchstaben werden eingestreut, um Wortfilter auszuhebeln.',
      `Gefundene Zeichen: ${homoText.slice(0, 8).join(' ')}`,
      'In normalem deutschem Text haben solche Zeichen nichts zu suchen.',
    ));
  }

  const hatUmlaute = /[äöüÄÖÜß]/.test(gesamt);
  const umschreibungen = [/\bfuer\b/i, /\bueber\b/i, /\bmoeglich\b/i, /\bkoennen\b/i, /\bmuessen\b/i]
    .filter((m) => m.test(gesamt)).length;
  if (hatUmlaute && umschreibungen >= 2) {
    befunde.push(befund(
      'inhalt-mischschreibung', 'niedrig', 7,
      'Umlaute mal geschrieben, mal umschrieben',
      'Ein uneinheitlicher Text deutet auf zusammenkopierte oder maschinell übersetzte Vorlagen hin.',
      [],
      'Schwaches Signal - aber große Unternehmen lassen ihre Kundenmails Korrektur lesen.',
    ));
  }

  const grussformelFehlt = !/(mit freundlichen gr|freundliche gr|beste gr|viele gr|ihr team|kind regards|best regards)/i.test(sichtbar);
  if (sichtbar.length > 200 && grussformelFehlt) {
    befunde.push(befund(
      'inhalt-keine-signatur', 'niedrig', 6,
      'Keine ordentliche Grußformel oder Signatur',
      'Geschäftspost in Deutschland trägt fast immer eine Signatur mit Firmenangaben.',
      [],
      'Fehlende Impressumsangaben in einer angeblichen Firmenmail sind ein schlechtes Zeichen.',
    ));
  }

  if (/^(?:re|aw|fwd|wg)\s*:/i.test(betreff) && !mail.header('in-reply-to') && !mail.header('references')) {
    befunde.push(befund(
      'inhalt-falsche-antwort', 'mittel', 16,
      'Betreff täuscht eine Antwort auf einen früheren Austausch vor',
      'Ein vorangestelltes "AW:" oder "Re:" soll Vertrautheit erzeugen. Die technischen Bezugsfelder fehlen aber - es gab nie einen Vorgänger.',
      `Betreff: ${kuerzen(betreff, 120)}`,
      'Durchsuche dein Postfach nach der angeblichen Vorgängermail. Findest du keine, ist der Betreff erfunden.',
    ));
  }

  return befunde;
}
