import { parseEml, parseAddressList, registrableDomain } from './parse-eml.js';
import { pruefeHeader } from './rules/header.js';
import { pruefeLinks } from './rules/links.js';
import { pruefeInhalt } from './rules/content.js';
import { pruefeAnhaenge } from './rules/attachments.js';

export const SCHWEREN = ['kritisch', 'hoch', 'mittel', 'niedrig', 'info', 'gut'];

const SCHWERE_RANG = Object.fromEntries(SCHWEREN.map((s, i) => [s, i]));

export const STUFEN = {
  rot: {
    name: 'Sehr wahrscheinlich Betrug',
    kurz: 'Finger weg',
    farbe: '#c0392b',
    text: 'Diese Nachricht trägt mehrere Merkmale, die in seriöser Post nicht vorkommen. Nichts anklicken, nichts öffnen, nichts eingeben.',
  },
  gelb: {
    name: 'Verdächtig',
    kurz: 'Erst prüfen',
    farbe: '#c77700',
    text: 'Einzelne Merkmale sind auffällig. Bestätige den Absender über einen zweiten, selbst gewählten Weg, bevor du irgendetwas tust.',
  },
  gruen: {
    name: 'Keine typischen Betrugsmerkmale gefunden',
    kurz: 'Unauffällig',
    farbe: '#1e7a46',
    text: 'Die geprüften Merkmale sind unauffällig. Das ist kein Freibrief: Gut gemachte Angriffe bestehen diese Prüfung ebenfalls.',
  },
};

/**
 * Einzelgewichte sättigend verrechnen. Zehn schwache Signale sollen nicht
 * dasselbe Gewicht bekommen wie ein eindeutiger Beweis, und der Wert darf
 * nie über 100 hinauslaufen.
 */
function verrechne(befunde) {
  let rest = 1;
  for (const b of befunde) {
    const gewicht = Math.max(0, Math.min(95, Number(b.gewicht) || 0));
    rest *= 1 - gewicht / 100;
  }
  return Math.round((1 - rest) * 100);
}

/** Wie belastbar ist das Urteil überhaupt? */
function bestimmeSicherheit(mail) {
  if (!mail.isEmail) {
    return {
      stufe: 'niedrig',
      text: 'Es wurde nur der Text geprüft. Absender, Zustellweg und Echtheitsprüfung fehlen - also genau die aussagekräftigsten Merkmale.',
    };
  }
  const hatAuth = mail.headerAll('authentication-results').length > 0
    || mail.headerAll('arc-authentication-results').length > 0
    || mail.headerAll('received-spf').length > 0;
  const hatReceived = mail.headerAll('received').length > 0;
  if (hatAuth && hatReceived) {
    return {
      stufe: 'hoch',
      text: 'Vollständiger Mail-Kopf mit Zustellweg und Echtheitsprüfung vorhanden. Das Urteil steht auf breiter Grundlage.',
    };
  }
  if (hatReceived) {
    return {
      stufe: 'mittel',
      text: 'Mail-Kopf vorhanden, aber ohne Ergebnis der Echtheitsprüfung (SPF, DKIM, DMARC). Damit fehlt der technische Herkunftsnachweis.',
    };
  }
  return {
    stufe: 'mittel',
    text: 'Nur ein Teil des Mail-Kopfs vorhanden. Für eine belastbare Aussage fehlen die Zustellwege.',
  };
}

function sortiere(befunde) {
  return [...befunde].sort((a, b) => {
    const rang = SCHWERE_RANG[a.schwere] - SCHWERE_RANG[b.schwere];
    if (rang !== 0) return rang;
    return (b.gewicht || 0) - (a.gewicht || 0);
  });
}

/**
 * Hauptfunktion: rohe Mail oder bloßen Text prüfen.
 * @param {string} roh Inhalt der Mail, möglichst als Originaltext samt Kopfzeilen.
 * @returns {object} Bericht mit Stufe, Punktzahl, Befunden und Absenderübersicht.
 */
export function analysiere(roh) {
  const mail = parseEml(roh);

  const befunde = sortiere([
    ...pruefeHeader(mail),
    ...pruefeLinks(mail),
    ...pruefeInhalt(mail),
    ...pruefeAnhaenge(mail),
  ]);

  const wertend = befunde.filter((b) => b.schwere !== 'info' && b.schwere !== 'gut');
  const punkte = verrechne(wertend);
  const kritische = wertend.filter((b) => b.schwere === 'kritisch');
  const hohe = wertend.filter((b) => b.schwere === 'hoch');

  let stufe = 'gruen';
  if (kritische.length > 0 || punkte >= 60) stufe = 'rot';
  else if (punkte >= 22 || hohe.length > 0) stufe = 'gelb';

  const from = parseAddressList(mail.header('from'))[0] || null;
  const replyTo = parseAddressList(mail.header('reply-to'))[0] || null;

  const zaehlung = Object.fromEntries(SCHWEREN.map((s) => [s, befunde.filter((b) => b.schwere === s).length]));

  return {
    stufe,
    urteil: STUFEN[stufe],
    punkte,
    sicherheit: bestimmeSicherheit(mail),
    befunde,
    zaehlung,
    absender: {
      anzeigename: from ? from.display : '',
      adresse: from ? from.address : '',
      domain: from ? from.domain : '',
      registrierbareDomain: from ? registrableDomain(from.domain) : '',
      antwortAn: replyTo ? replyTo.address : '',
    },
    kopf: {
      istMail: mail.isEmail,
      betreff: mail.header('subject'),
      datum: mail.header('date'),
      an: mail.header('to'),
      returnPath: mail.header('return-path'),
      messageId: mail.header('message-id'),
    },
    anhaenge: mail.attachments.map((a) => ({
      name: a.filename, typ: a.contentType, groesse: a.size, eingebettet: a.inline,
    })),
    naechsteSchritte: naechsteSchritte(stufe, befunde),
  };
}

/** Konkrete Handlungsempfehlung, abgestuft nach Urteil. */
function naechsteSchritte(stufe, befunde) {
  const hatAnhang = befunde.some((b) => b.kategorie === 'Anhänge' && b.schwere !== 'info');
  const hatLink = befunde.some((b) => b.kategorie === 'Links' && ['kritisch', 'hoch'].includes(b.schwere));
  const hatZugangsdaten = befunde.some((b) => b.id === 'inhalt-zugangsdaten');
  const hatKontowechsel = befunde.some((b) => b.id === 'inhalt-kontowechsel');

  if (stufe === 'rot') {
    const schritte = [
      'Nicht antworten. Eine Antwort bestätigt nur, dass deine Adresse benutzt wird.',
      'Keinen Link anklicken und keine Daten eingeben.',
    ];
    if (hatAnhang) schritte.push('Keinen Anhang öffnen - auch nicht "nur zum Nachsehen".');
    if (hatKontowechsel) schritte.push('Bei einer angeblich geänderten Bankverbindung: unbedingt telefonisch rückfragen, unter der Nummer aus deinen alten Unterlagen.');
    schritte.push('Absender als Spam melden und blockieren (siehe Anleitung unten).');
    schritte.push('Mail an die Verbraucherzentrale weiterleiten: phishing@verbraucherzentrale.nrw');
    schritte.push('Danach löschen.');
    if (hatZugangsdaten || hatLink) {
      schritte.push('Falls du schon geklickt oder Daten eingegeben hast: sofort das Passwort ändern und die Bank oder den Anbieter anrufen. Die Schritte dazu stehen unten unter "Wenn es schon passiert ist".');
    }
    return schritte;
  }

  if (stufe === 'gelb') {
    return [
      'Noch nichts anklicken.',
      'Absender über einen zweiten Weg bestätigen: Nummer oder Adresse selbst heraussuchen, nicht aus der Mail übernehmen.',
      'Wenn es um ein Konto geht: die Seite des Anbieters selbst im Browser aufrufen und dort nachsehen, ob es die Meldung wirklich gibt.',
      'Bestätigt sich der Verdacht: als Spam melden und löschen.',
    ];
  }

  return [
    'Keine typischen Betrugsmerkmale gefunden - trotzdem gilt: Links nur anklicken, wenn du die Mail erwartet hast.',
    'Bei allem, was Geld oder Zugangsdaten betrifft, die Seite grundsätzlich selbst im Browser aufrufen statt über einen Link.',
    'Warst du unsicher genug, um zu prüfen? Dann frag im Zweifel trotzdem beim Absender nach.',
  ];
}
