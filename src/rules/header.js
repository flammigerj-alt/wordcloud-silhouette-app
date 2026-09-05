import { parseAddressList, registrableDomain } from '../parse-eml.js';
import { FREEMAIL_DOMAINS, DISPOSABLE_DOMAINS, IMPERSONATED_BRANDS, RISKY_TLDS } from '../data.js';
import { levenshtein, opticalNormalize, findHomoglyphs, enthaeltMarkenname, kuerzen } from '../utils.js';

const KAT = 'Absender';

function befund(id, schwere, gewicht, titel, erklaerung, beweis, rat, kategorie = KAT) {
  return { id, kategorie, schwere, gewicht, titel, erklaerung, beweis: [].concat(beweis).filter(Boolean), rat };
}

/** Authentication-Results auswerten: SPF, DKIM und DMARC. */
function pruefeAuthentifizierung(mail, befunde) {
  const zeilen = [
    ...mail.headerAll('authentication-results'),
    ...mail.headerAll('arc-authentication-results'),
    ...mail.headerAll('received-spf'),
  ];

  if (!zeilen.length) {
    befunde.push(befund(
      'auth-fehlt', 'info', 0,
      'Keine Prüfergebnisse zu SPF, DKIM und DMARC vorhanden',
      'Diese drei Verfahren prüfen, ob der Absenderserver überhaupt für die Absenderdomain verschicken darf. Ohne den Original-Header lassen sie sich nicht auswerten.',
      [],
      'Öffne die Mail im Postfach und lass dir den Originaltext bzw. den vollständigen Kopf anzeigen. Genau darin steht die Zeile "Authentication-Results".',
      'Technik',
    ));
    return;
  }

  const gesamt = zeilen.join('\n');
  const lese = (name) => {
    const treffer = gesamt.match(new RegExp(`\\b${name}\\s*=\\s*([a-z]+)`, 'i'));
    return treffer ? treffer[1].toLowerCase() : '';
  };
  const spf = lese('spf');
  const dkim = lese('dkim');
  const dmarc = lese('dmarc');

  const bewertung = {
    fail: { schwere: 'kritisch', gewicht: 30 },
    softfail: { schwere: 'mittel', gewicht: 14 },
    permerror: { schwere: 'mittel', gewicht: 10 },
    temperror: { schwere: 'niedrig', gewicht: 4 },
    none: { schwere: 'niedrig', gewicht: 6 },
    neutral: { schwere: 'niedrig', gewicht: 5 },
  };

  const erklaerungen = {
    spf: 'SPF prüft, ob der versendende Server laut Eintrag der Absenderdomain überhaupt für sie verschicken darf.',
    dkim: 'DKIM prüft eine kryptografische Signatur des Absenders. Schlägt sie fehl, wurde die Mail verändert oder gar nicht von der Domain signiert.',
    dmarc: 'DMARC verbindet SPF und DKIM mit der sichtbaren Absenderadresse. Ein Fehlschlag heißt: Die angezeigte Adresse ist sehr wahrscheinlich gefälscht.',
  };

  for (const [name, ergebnis] of [['spf', spf], ['dkim', dkim], ['dmarc', dmarc]]) {
    if (!ergebnis) continue;
    if (ergebnis === 'pass') continue;
    const stufe = bewertung[ergebnis] || { schwere: 'mittel', gewicht: 10 };
    const gewicht = name === 'dmarc' && ergebnis === 'fail' ? 40 : stufe.gewicht;
    befunde.push(befund(
      `auth-${name}`, name === 'dmarc' && ergebnis === 'fail' ? 'kritisch' : stufe.schwere, gewicht,
      `${name.toUpperCase()}-Prüfung: ${ergebnis}`,
      erklaerungen[name],
      `Gefunden: ${name}=${ergebnis}`,
      ergebnis === 'fail'
        ? 'Die Absenderadresse ist mit hoher Wahrscheinlichkeit gefälscht. Behandle die Mail als Fälschung.'
        : 'Kein Beweis, aber ein deutliches Warnzeichen. Prüfe die übrigen Punkte besonders genau.',
      'Technik',
    ));
  }

  if (spf === 'pass' && dkim === 'pass' && (dmarc === 'pass' || !dmarc)) {
    befunde.push(befund(
      'auth-ok', 'gut', 0,
      'SPF und DKIM bestanden',
      'Die Mail kommt technisch tatsächlich von der angegebenen Domain.',
      `spf=${spf}, dkim=${dkim}${dmarc ? `, dmarc=${dmarc}` : ''}`,
      'Wichtig: Das beweist nur die Herkunft, nicht die Ehrlichkeit. Betrüger registrieren eigene Domains und richten SPF und DKIM korrekt ein. Prüfe trotzdem, wem die Domain gehört.',
      'Technik',
    ));
  }
}

/** Angezeigter Name gegen tatsächliche Adresse. */
function pruefeAnzeigename(from, befunde, mail) {
  if (!from) return;
  const anzeige = from.display;
  if (!anzeige) return;

  // Fall 1: Im Anzeigenamen steht eine komplette, andere Mailadresse.
  const adresseImNamen = anzeige.match(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/);
  if (adresseImNamen) {
    const gezeigteDomain = registrableDomain(adresseImNamen[1]);
    if (gezeigteDomain && gezeigteDomain !== registrableDomain(from.domain)) {
      befunde.push(befund(
        'anzeigename-adresse', 'kritisch', 35,
        'Der angezeigte Name täuscht eine andere Absenderadresse vor',
        'Viele Programme zeigen nur den Namen an. Dahinter darf beliebiger Text stehen - auch eine fremde Mailadresse.',
        [`Angezeigt: ${kuerzen(anzeige)}`, `Tatsächlich: ${from.address}`],
        'Lass dir in deinem Mailprogramm immer die vollständige Adresse anzeigen, nicht nur den Namen.',
      ));
      return;
    }
  }

  // Fall 2: Im Anzeigenamen steckt ein Markenname, die Domain passt aber nicht dazu.
  const absenderDomain = registrableDomain(from.domain);
  for (const marke of IMPERSONATED_BRANDS) {
    if (!enthaeltMarkenname(anzeige, marke.token)) continue;
    // Nur die registrierbare Domain zählt. Würde hier die volle Adresse
    // geprüft, würde ausgerechnet das Tarnmuster ing-sicherheit.example.top
    // als legitim durchgehen.
    const passt = marke.domains.some((d) => absenderDomain === d || absenderDomain.endsWith(`.${d}`))
      || enthaeltMarkenname(absenderDomain, marke.token);
    if (passt) continue;
    befunde.push(befund(
      'anzeigename-marke', 'kritisch', 32,
      `Auftreten als ${marke.label}, aber fremde Absenderdomain`,
      'Der Name im Absenderfeld ist frei wählbar. Entscheidend ist allein die Domain hinter dem @-Zeichen.',
      [`Angezeigt: ${kuerzen(anzeige)}`, `Domain: ${from.domain || '(keine)'}`, `Erwartet wäre z. B.: ${marke.domains.join(', ')}`],
      `Echte Post von ${marke.label} kommt von ${marke.domains[0]}. Rufe die Seite selbst im Browser auf, statt auf einen Link zu klicken.`,
    ));
    return;
  }

  // Fall 3: Der Anzeigename behauptet eine Firma, verschickt wird über Freemail.
  const wirktGeschaeftlich = /\b(gmbh|ag|kg|ohg|e\.?v\.?|ltd|inc|service|support|kundenservice|abteilung|team|buchhaltung|rechnungswesen|holding|bank|versicherung|amt|beh[oö]rde)\b/i.test(anzeige)
    || /\b(gmbh|ag|kg|holding)\b/i.test(mail.header('subject'));
  if (wirktGeschaeftlich && FREEMAIL_DOMAINS.has(from.domain)) {
    befunde.push(befund(
      'freemail-firma', 'hoch', 26,
      'Angeblich ein Unternehmen, verschickt aber über eine Freemail-Adresse',
      'Firmen und Behörden verschicken Geschäftspost über ihre eigene Domain, nicht über GMX, Gmail oder Web.de.',
      [`Angezeigt: ${kuerzen(anzeige)}`, `Freemail-Domain: ${from.domain}`],
      'Suche die echte Firmenadresse selbst heraus und frage dort nach, ob die Mail von ihnen stammt.',
    ));
  }
}

/** Absenderdomain auf Verwechslungstricks prüfen. */
function pruefeAbsenderdomain(from, befunde) {
  if (!from || !from.domain) return;
  const domain = from.domain;
  const registrierbar = registrableDomain(domain);

  if (domain.includes('xn--')) {
    befunde.push(befund(
      'punycode-absender', 'kritisch', 35,
      'Absenderdomain enthält eine kodierte Sonderzeichen-Domain (Punycode)',
      'Mit Sonderzeichen lässt sich eine Domain bauen, die im Postfach exakt aussieht wie das Original.',
      `Domain: ${domain}`,
      'Solche Domains sind in seriöser Geschäftspost praktisch nie nötig. Behandle die Mail als Fälschung.',
    ));
  }

  const homoglyphen = findHomoglyphs(domain);
  if (homoglyphen.length) {
    befunde.push(befund(
      'homoglyphen-absender', 'kritisch', 35,
      'Absenderdomain enthält Zeichen aus einem fremden Schriftsystem',
      'Kyrillische und griechische Buchstaben sehen aus wie lateinische, führen aber zu einer völlig anderen Domain.',
      [`Domain: ${domain}`, `Verdächtige Zeichen: ${homoglyphen.join(' ')}`],
      'Das ist eine gezielte Täuschung. Es gibt keinen harmlosen Grund dafür.',
    ));
  }

  const domainNorm = opticalNormalize(registrierbar);
  for (const marke of IMPERSONATED_BRANDS) {
    for (const echt of marke.domains) {
      const echtNorm = opticalNormalize(echt);
      if (domainNorm === echtNorm && registrierbar !== echt) {
        befunde.push(befund(
          'tippfehler-domain', 'kritisch', 36,
          `Absenderdomain ist optisch von ${echt} kaum zu unterscheiden`,
          'Ausgetauschte Zeichen wie 0 statt o, I statt l oder rn statt m fallen beim Lesen nicht auf.',
          [`Absender: ${registrierbar}`, `Verwechselbar mit: ${echt}`],
          `Die echte Domain lautet ${echt}. Vergleiche Zeichen für Zeichen.`,
        ));
        return;
      }
      const abstand = levenshtein(registrierbar, echt);
      if (abstand > 0 && abstand <= 2 && echt.length >= 7) {
        befunde.push(befund(
          'ähnliche-domain', 'hoch', 28,
          `Absenderdomain ähnelt ${echt} bis auf wenige Zeichen`,
          'Betrüger registrieren Domains, die sich nur minimal vom Original unterscheiden.',
          [`Absender: ${registrierbar}`, `Original: ${echt}`, `Unterschied: ${abstand} Zeichen`],
          `Prüfe genau. Die echte Domain lautet ${echt}.`,
        ));
        return;
      }
      // Markenname steckt in der Domain, ist aber nicht die registrierte Domain.
      if (marke.token.length >= 4 && enthaeltMarkenname(domain, marke.token)
          && !enthaeltMarkenname(registrierbar, marke.token)) {
        befunde.push(befund(
          'marke-in-subdomain', 'kritisch', 34,
          `"${marke.label}" steht nur in der Subdomain, nicht in der echten Domain`,
          'Entscheidend sind die letzten beiden Bestandteile vor dem ersten Schrägstrich. Alles davor kann sich jeder frei ausdenken.',
          [`Vollständig: ${domain}`, `Tatsächliche Domain: ${registrierbar}`],
          `Lies Domains von rechts nach links. Hier gehört die Adresse zu ${registrierbar}, nicht zu ${marke.label}.`,
        ));
        return;
      }
    }
  }

  const tld = registrierbar.split('.').pop();
  if (RISKY_TLDS.has(tld)) {
    befunde.push(befund(
      'riskante-tld', 'mittel', 14,
      `Absenderdomain endet auf .${tld}`,
      'Diese Endungen sind billig oder anonym zu bekommen und deshalb bei Betrügern beliebt.',
      `Domain: ${registrierbar}`,
      'Allein kein Beweis - aber ein Grund, genauer hinzusehen.',
    ));
  }

  if (DISPOSABLE_DOMAINS.has(registrierbar)) {
    befunde.push(befund(
      'wegwerfadresse', 'hoch', 26,
      'Absender nutzt eine Wegwerf-Mailadresse',
      'Wegwerfadressen existieren nur wenige Minuten und lassen sich niemandem zuordnen.',
      `Domain: ${registrierbar}`,
      'Für echte Geschäftspost völlig unüblich.',
    ));
  }
}

/** Reply-To, Return-Path und Sender gegen den From-Header. */
function pruefeAntwortpfade(mail, from, befunde) {
  if (!from || !from.domain) return;
  const fromDomain = registrableDomain(from.domain);

  const replyTo = parseAddressList(mail.header('reply-to'))[0];
  if (replyTo && replyTo.domain && registrableDomain(replyTo.domain) !== fromDomain) {
    befunde.push(befund(
      'reply-to-abweichung', 'hoch', 24,
      'Antworten gehen an eine ganz andere Domain',
      'Die Mail sieht aus wie von A, deine Antwort landet aber bei B. Das ist ein Kernmerkmal von Rechnungs- und Chefbetrug.',
      [`Absender: ${from.address}`, `Antwort geht an: ${replyTo.address}`],
      'Wenn du antwortest, tippe die Adresse selbst aus deinem Adressbuch ein - benutze nicht die Antworten-Schaltfläche.',
    ));
  }

  const returnPath = parseAddressList(mail.header('return-path'))[0];
  if (returnPath && returnPath.domain && registrableDomain(returnPath.domain) !== fromDomain) {
    befunde.push(befund(
      'return-path-abweichung', 'mittel', 12,
      'Der technische Rückweg zeigt auf eine andere Domain',
      'Bei Newslettern über Dienstleister ist das normal. Bei angeblich persönlicher Geschäftspost nicht.',
      [`Absender: ${from.address}`, `Return-Path: ${returnPath.address}`],
      'Im Zusammenhang mit anderen Auffälligkeiten ein ernstes Zeichen, allein noch kein Beweis.',
    ));
  }

  const sender = parseAddressList(mail.header('sender'))[0];
  if (sender && sender.domain && registrableDomain(sender.domain) !== fromDomain) {
    befunde.push(befund(
      'sender-abweichung', 'mittel', 12,
      'Ein abweichender technischer Absender ist eingetragen',
      'Der Sender-Header nennt, wer die Mail tatsächlich eingeliefert hat.',
      [`From: ${from.address}`, `Sender: ${sender.address}`],
      'Prüfe, ob dieser Dienstleister zum angeblichen Absender passt.',
    ));
  }

  const messageId = mail.header('message-id');
  const midDomain = (messageId.match(/@([^>\s]+)>?\s*$/) || [])[1];
  if (midDomain && registrableDomain(midDomain) !== fromDomain) {
    befunde.push(befund(
      'message-id-abweichung', 'niedrig', 8,
      'Die Kennung der Nachricht stammt von einer anderen Domain',
      'Die Message-ID wird vom einliefernden Server vergeben und passt normalerweise zum Absender.',
      [`Message-ID: ${kuerzen(messageId, 80)}`, `Erwartete Domain: ${fromDomain}`],
      'Bei Versand über Dienstleister ist das erklärbar. Nur zusammen mit anderen Punkten aussagekräftig.',
    ));
  }
}

/** Empfängerfeld und Verteilerspuren. */
function pruefeEmpfaenger(mail, befunde) {
  const to = mail.header('to');
  if (!to) return;
  if (/undisclosed[- ]recipients|^\s*$/i.test(to)) {
    befunde.push(befund(
      'empfaenger-verborgen', 'mittel', 14,
      'Du stehst nicht im Empfängerfeld',
      'Die Mail ging als Blindkopie an einen großen Verteiler - typisch für Massenversand.',
      `To: ${kuerzen(to, 100)}`,
      'Echte Kundenkommunikation ist an dich persönlich adressiert.',
    ));
    return;
  }
  const empfaenger = parseAddressList(to);
  if (empfaenger.length > 15) {
    befunde.push(befund(
      'massenverteiler', 'mittel', 14,
      `Die Mail ging sichtbar an ${empfaenger.length} Empfänger`,
      'Ein offener Großverteiler passt nicht zu angeblich persönlichen Kontoangelegenheiten.',
      `Erste Empfänger: ${empfaenger.slice(0, 3).map((e) => e.address).join(', ')} …`,
      'Bei angeblich persönlicher Post ein starkes Warnzeichen.',
    ));
  }
}

/** Spuren der Versandinfrastruktur. */
function pruefeVersandwege(mail, from, befunde) {
  const received = mail.headerAll('received');

  if (mail.isEmail && received.length === 0) {
    befunde.push(befund(
      'keine-received', 'info', 0,
      'Keine Zustellwege im Kopf enthalten',
      'Received-Zeilen dokumentieren, über welche Server die Mail lief. Sie fehlen meist, wenn nur ein Ausschnitt kopiert wurde.',
      [],
      'Kopiere den vollständigen Original-Header, damit die Herkunft geprüft werden kann.',
      'Technik',
    ));
  }

  if (mail.header('x-php-originating-script')) {
    befunde.push(befund(
      'php-versand', 'hoch', 22,
      'Versendet von einem Skript auf einem Webserver',
      'Dieser Hinweis taucht typischerweise auf, wenn eine gekaperte Webseite zum Massenversand missbraucht wird.',
      `X-PHP-Originating-Script: ${kuerzen(mail.header('x-php-originating-script'), 90)}`,
      'Seriöse Absender verschicken nicht über gehackte Kontaktformulare.',
      'Technik',
    ));
  }

  // Der älteste Received-Eintrag steht unten und nennt den Ursprung.
  const ursprung = received[received.length - 1] || '';
  const ipTreffer = ursprung.match(/\[(\d{1,3}(?:\.\d{1,3}){3})\]/);
  if (ipTreffer) {
    befunde.push(befund(
      'ursprungs-ip', 'info', 0,
      `Erste einliefernde IP-Adresse: ${ipTreffer[1]}`,
      'Über diese Adresse lässt sich nachvollziehen, aus welchem Netz und Land die Mail tatsächlich kam.',
      kuerzen(ursprung, 200),
      'Schlage die Adresse bei einem Whois-Dienst nach. Passt das Land oder der Anbieter nicht zum angeblichen Absender, ist das ein starkes Indiz.',
      'Technik',
    ));
  }

  const datum = mail.header('date');
  if (datum) {
    const zeit = Date.parse(datum);
    if (!Number.isNaN(zeit)) {
      const abstandTage = (Date.now() - zeit) / 86400000;
      if (abstandTage < -2) {
        befunde.push(befund(
          'datum-zukunft', 'mittel', 12,
          'Das Absendedatum liegt in der Zukunft',
          'Ein manipuliertes Datum sorgt dafür, dass die Mail im Postfach ganz oben stehen bleibt.',
          `Date: ${datum}`,
          'Ein deutliches Zeichen für einen manipulierten Kopf.',
          'Technik',
        ));
      }
    }
  }

  const noreply = from && /^(no-?reply|noreply|donotreply|do-not-reply|bounce)/i.test(from.local || '');
  if (noreply && !mail.header('list-unsubscribe') && mail.isEmail) {
    befunde.push(befund(
      'noreply-ohne-abmeldung', 'niedrig', 6,
      'Absender "noreply" ohne Abmeldemöglichkeit',
      'Wer im großen Stil versendet, muss in der EU eine Abmeldung anbieten. Betrüger sparen sich das.',
      `From: ${from.address}`,
      'Allein kein Beweis, passt aber ins Bild eines unseriösen Massenversands.',
      'Technik',
    ));
  }
}

/** Alle Absender- und Kopfregeln anwenden. */
export function pruefeHeader(mail) {
  const befunde = [];
  if (!mail.isEmail) {
    befunde.push(befund(
      'kein-header', 'info', 0,
      'Kein Mail-Kopf erkannt - nur der Text wurde geprüft',
      'Ohne Kopfzeilen lassen sich Absender, Zustellweg und Echtheitsprüfung nicht bewerten. Das sind die aussagekräftigsten Merkmale überhaupt.',
      [],
      'Füge die Mail als Originaltext ein (in der Anleitung unten steht, wie das in deinem Programm geht). Dann fällt die Bewertung deutlich sicherer aus.',
      'Technik',
    ));
    return befunde;
  }

  const from = parseAddressList(mail.header('from'))[0] || null;

  if (!from || !from.domain) {
    befunde.push(befund(
      'from-unlesbar', 'mittel', 14,
      'Der Absender lässt sich nicht sauber auslesen',
      'Ein kaputtes oder fehlendes From-Feld ist bei seriöser Post sehr ungewöhnlich.',
      `From: ${kuerzen(mail.header('from'), 120) || '(fehlt)'}`,
      'Behandle die Mail mit besonderer Vorsicht.',
    ));
  }

  pruefeAuthentifizierung(mail, befunde);
  pruefeAnzeigename(from, befunde, mail);
  pruefeAbsenderdomain(from, befunde);
  pruefeAntwortpfade(mail, from, befunde);
  pruefeEmpfaenger(mail, befunde);
  pruefeVersandwege(mail, from, befunde);

  return befunde;
}
