import { parseEml, parseAddressList, registrableDomain } from './parse-eml.js';
import { pruefeHeader } from './rules/header.js';
import { pruefeLinks } from './rules/links.js';
import { pruefeInhalt } from './rules/content.js';
import { pruefeAnhaenge } from './rules/attachments.js';
import { pruefeWebsite } from './rules/website.js';

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

/** Urteilstexte für die Prüfung einer Webseite - gleiche Stufen, anderer Gegenstand. */
export const STUFEN_ADRESSE = {
  rot: {
    ...STUFEN.rot,
    text: 'Diese Seite trägt mehrere Merkmale, die bei seriösen Anbietern nicht vorkommen. Kein Geld einzahlen, nicht registrieren, keine Ausweisdaten hochladen.',
  },
  gelb: {
    ...STUFEN.gelb,
    text: 'Einzelne Merkmale sind auffällig. Prüfe Betreiber und Erlaubnis selbst nach, bevor du dich registrierst oder Geld überweist.',
  },
  gruen: {
    ...STUFEN.gruen,
    text: 'An der Adresse und am eingefügten Text ist nichts Typisches aufgefallen. Das ist kein Freibrief: Wer der Betreiber ist, zeigt erst das Impressum.',
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

/** Punkte, Stufe und Zählung aus den Befunden - für Mail und Webseite gleich. */
function bewerte(befunde) {
  const wertend = befunde.filter((b) => b.schwere !== 'info' && b.schwere !== 'gut');
  const punkte = verrechne(wertend);
  const kritische = wertend.filter((b) => b.schwere === 'kritisch');
  const hohe = wertend.filter((b) => b.schwere === 'hoch');

  let stufe = 'gruen';
  if (kritische.length > 0 || punkte >= 60) stufe = 'rot';
  else if (punkte >= 22 || hohe.length > 0) stufe = 'gelb';

  const zaehlung = Object.fromEntries(SCHWEREN.map((s) => [s, befunde.filter((b) => b.schwere === s).length]));
  return { punkte, stufe, zaehlung };
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

  const { punkte, stufe, zaehlung } = bewerte(befunde);

  const from = parseAddressList(mail.header('from'))[0] || null;
  const replyTo = parseAddressList(mail.header('reply-to'))[0] || null;

  return {
    art: 'mail',
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

/**
 * Eine Webadresse prüfen, optional zusammen mit dem kopierten Text der Seite.
 * Diese Funktion selbst geht nicht ins Netz. Soll die Seite abgerufen werden,
 * erledigt das ruefeSeiteAb() aus src/abruf.js vorher, und das Ergebnis kommt
 * hier als `abruf` herein.
 * @param {string} eingabe Adresse, z. B. "beispiel.online" oder "https://www.beispiel.de/login".
 * @param {string} [seitentext] Sichtbarer Text oder HTML-Quelltext der Seite.
 * @param {object} [abruf] Ergebnis von ruefeSeiteAb().
 */
export function analysiereAdresse(eingabe, seitentext = '', abruf = null) {
  const { adresse, befunde: roh, textLaenge } = pruefeWebsite(eingabe, seitentext, abruf);
  const befunde = sortiere(roh);
  const { punkte, stufe, zaehlung } = bewerte(befunde);

  const quelle = String(seitentext).trim() ? 'Seitentext' : 'abgerufene Seite';
  const sicherheit = textLaenge >= 200
    ? {
      stufe: 'mittel',
      text: `Adresse und ${quelle} wurden geprüft. Wer die Seite betreibt, wie alt sie ist und ob schon vor ihr gewarnt wird, zeigt die Seite selbst nicht.`,
    }
    : {
      stufe: 'niedrig',
      text: textLaenge
        ? 'Neben der Adresse lag nur sehr wenig Seitentext vor. Die aussagekräftigsten Merkmale - Versprechen, Einzahlungsbedingungen, Impressum - fehlen.'
        : 'Es wurde nur die Adresse geprüft. Die aussagekräftigsten Merkmale stehen auf der Seite selbst: Versprechen, Einzahlungsbedingungen, Impressum.',
    };

  return {
    art: 'adresse',
    stufe,
    urteil: STUFEN_ADRESSE[stufe],
    punkte,
    sicherheit,
    befunde,
    zaehlung,
    adresse: {
      eingabe: adresse.eingabe,
      url: adresse.url,
      host: adresse.host,
      domain: adresse.domain,
      endung: adresse.tld,
      verschluesselt: adresse.gueltig ? adresse.schema === 'https' : null,
      schemaAngenommen: adresse.gueltig && !adresse.schemaAngegeben,
    },
    abruf: abruf
      ? {
        ok: abruf.ok, status: abruf.status, endUrl: abruf.endUrl, kette: abruf.kette,
        fehler: abruf.fehler, abgeschnitten: abruf.abgeschnitten,
      }
      : null,
    naechsteSchritte: naechsteSchritteAdresse(stufe, befunde),
  };
}

/** Handlungsempfehlung für Webseiten, bei denen es fast immer um Geld geht. */
function naechsteSchritteAdresse(stufe, befunde) {
  const nachschlagen = 'Selbst nachschlagen: Gibt es den Betreiber aus dem Impressum im Handelsregister? Hat er eine Erlaubnis laut BaFin-Unternehmensdatenbank? Steht die Seite auf der Warnliste Geldanlage der Verbraucherzentralen oder unter den Verbraucherwarnungen der BaFin?';
  const hatFernzugriff = befunde.some((b) => b.id === 'seite-fernzugriff');
  const hatEinzahlung = befunde.some((b) => ['seite-einzahlung', 'seite-kryptozahlung'].includes(b.id));

  if (stufe === 'rot') {
    const schritte = [
      'Kein Geld einzahlen und keine weiteren "Gebühren" oder "Steuern" für eine Auszahlung zahlen.',
      'Nicht registrieren, keinen Ausweis und kein Selfie hochladen.',
    ];
    if (hatFernzugriff) schritte.push('Niemandem Fernzugriff auf deinen Rechner geben. Ist AnyDesk oder TeamViewer schon installiert: Programm beenden, deinstallieren und die Bank anrufen.');
    schritte.push('Falls du schon eingezahlt hast: sofort die Bank anrufen und einen Rückruf der Überweisung versuchen, dann Strafanzeige erstatten. Die Schritte stehen unten unter "Wenn es schon passiert ist".');
    schritte.push('Vorsicht vor "Rückholdiensten", die sich danach melden und gegen Vorkasse dein Geld zurückholen wollen. Das ist dieselbe Masche ein zweites Mal.');
    schritte.push('Die Seite der Verbraucherzentrale oder der BaFin melden, damit andere gewarnt werden.');
    return schritte;
  }

  if (stufe === 'gelb') {
    const schritte = [
      'Noch kein Geld einzahlen und keine persönlichen Daten hinterlegen.',
      nachschlagen,
    ];
    if (hatEinzahlung) schritte.push('Kläre vorher schriftlich, wie und wann du dein Geld zurückbekommst. Wird das ausweichend beantwortet, ist die Sache entschieden.');
    schritte.push('Sprich mit jemandem, dem du vertraust, bevor du Geld überweist. Betrüger setzen darauf, dass du allein entscheidest.');
    return schritte;
  }

  return [
    'Keine typischen Merkmale gefunden - aber bei allem, was mit Geld zu tun hat, gilt trotzdem:',
    nachschlagen,
    'Füge den Text der Seite mit ein, wenn du ihn noch nicht geprüft hast. Die Versprechen auf der Seite sagen mehr als ihre Adresse.',
  ];
}
