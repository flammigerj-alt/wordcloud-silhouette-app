import { EXTENSION_RISK } from '../data.js';
import { htmlToText, kuerzen } from '../utils.js';

const KAT = 'Anhänge';

/**
 * Unsichtbare Steuerzeichen für Schreibrichtung und Formatierung.
 * Damit lässt sich "rechnung.exe" auf dem Bildschirm zu "rechnung.txt" drehen.
 * Bewusst aus ASCII-Escapes gebaut.
 */
const STEUERZEICHEN = new RegExp('[\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069\\ufeff]');

function befund(id, schwere, gewicht, titel, erklaerung, beweis, rat) {
  return { id, kategorie: KAT, schwere, gewicht, titel, erklaerung, beweis: [].concat(beweis).filter(Boolean), rat };
}

function endungVon(dateiname) {
  const treffer = String(dateiname).toLowerCase().match(/\.([a-z0-9]{1,10})$/);
  return treffer ? treffer[1] : '';
}

function klasseFuer(endung) {
  for (const [name, klasse] of Object.entries(EXTENSION_RISK)) {
    if (klasse.endungen.includes(endung)) return { name, ...klasse };
  }
  return null;
}

export function pruefeAnhaenge(mail) {
  const befunde = [];
  const text = `${mail.text}\n${htmlToText(mail.html)}`;
  const anhaenge = mail.attachments.filter((a) => a.filename || !a.inline);
  if (!anhaenge.length) return befunde;

  for (const anhang of anhaenge) {
    const name = anhang.filename || '(ohne Namen)';

    if (STEUERZEICHEN.test(name)) {
      befunde.push(befund(
        'anhang-steuerzeichen', 'kritisch', 45,
        'Dateiname enthält ein unsichtbares Steuerzeichen',
        'Mit solchen Zeichen lässt sich der Name optisch umdrehen: Aus einer Programmdatei wird auf dem Bildschirm scheinbar ein Textdokument.',
        `Dateiname: ${kuerzen(name, 100)}`,
        'Dafür gibt es keinen harmlosen Grund. Den Anhang unter keinen Umständen öffnen.',
      ));
      continue;
    }

    // Doppelte Endung, z. B. rechnung.pdf.exe
    const doppel = name.toLowerCase().match(/\.(pdf|docx?|xlsx?|jpe?g|png|txt|rtf|csv)\.([a-z0-9]{2,5})$/);
    if (doppel && klasseFuer(doppel[2])) {
      befunde.push(befund(
        'anhang-doppelte-endung', 'kritisch', 45,
        `Doppelte Dateiendung: sieht aus wie .${doppel[1]}, ist aber .${doppel[2]}`,
        'Windows blendet bekannte Endungen standardmäßig aus. Dadurch erscheint die Datei im Postfach als harmloses Dokument.',
        `Dateiname: ${kuerzen(name, 100)}`,
        'Nicht öffnen. Stelle in Windows im Explorer unter "Ansicht" die Dateinamenerweiterungen dauerhaft auf sichtbar.',
      ));
      continue;
    }

    const endung = endungVon(name);
    const klasse = klasseFuer(endung);

    if (!klasse) {
      if (!endung) {
        befunde.push(befund(
          'anhang-ohne-endung', 'mittel', 14,
          'Anhang ohne erkennbare Dateiendung',
          'Ohne Endung lässt sich nicht beurteilen, was beim Öffnen passiert.',
          `Dateiname: ${kuerzen(name, 100)} (${anhang.contentType})`,
          'Nicht öffnen, bevor du beim Absender über einen dir bekannten Weg nachgefragt hast.',
        ));
      }
      continue;
    }

    let gewicht = klasse.gewicht;
    let schwere = klasse.schwere;
    let titel = `Riskanter Anhang: ${name}`;
    const beweis = [`Dateiname: ${kuerzen(name, 100)}`, `Typ: ${anhang.contentType}`];
    if (anhang.size) beweis.push(`Größe: ca. ${Math.max(1, Math.round(anhang.size / 1024))} KB`);

    // Ein passwortgeschütztes Archiv richtet sich gezielt gegen den Virenscanner.
    if (klasse.name === 'archiv' && /passwor|kennwort|entpacken mit/i.test(text)) {
      gewicht = 34;
      schwere = 'kritisch';
      titel = `Passwortgeschütztes Archiv im Anhang: ${name}`;
      beweis.push('Im Text wird ein Passwort für das Archiv genannt - so kann kein Virenscanner hineinsehen.');
    }

    befunde.push(befund(
      `anhang-${klasse.name}`, schwere, gewicht, titel, klasse.hinweis, beweis,
      klasse.name === 'dokument'
        ? 'Auch unauffällige Formate können Links oder QR-Codes zu einer Phishing-Seite enthalten. Öffnen ja, klicken nein.'
        : 'Nicht öffnen. Wenn du den Anhang wirklich erwartest, frag beim Absender unter einer dir bekannten Telefonnummer nach - nicht unter der aus der Mail.',
    ));
  }

  if (anhaenge.length > 5) {
    befunde.push(befund(
      'anhang-viele', 'niedrig', 6,
      `Ungewöhnlich viele Anhänge (${anhaenge.length})`,
      'Viele Dateien auf einmal lenken die Aufmerksamkeit von der einen gefährlichen ab.',
      anhaenge.slice(0, 6).map((a) => a.filename || '(ohne Namen)').join(', '),
      'Prüfe jede Datei einzeln.',
    ));
  }

  return befunde;
}
