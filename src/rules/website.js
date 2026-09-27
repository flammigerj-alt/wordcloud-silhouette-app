import { registrableDomain } from '../parse-eml.js';
import { IMPERSONATED_BRANDS, RISKY_TLDS, BILLIG_TLDS, GELD_KOEDER, WEBSITE_SIGNALS } from '../data.js';
import { enthaeltMarkenname, htmlToText, kuerzen } from '../utils.js';
import { pruefeLinks } from './links.js';
import { werteSignale, fundstelle } from './content.js';

const KAT_ADRESSE = 'Adresse';
const KAT_SEITE = 'Seiteninhalt';

function befund(kategorie, id, schwere, gewicht, titel, erklaerung, beweis, rat) {
  return { id, kategorie, schwere, gewicht, titel, erklaerung, beweis: [].concat(beweis).filter(Boolean), rat };
}

/**
 * Eingabe wie "cashconnect.online", "www.x.de/login" oder eine volle URL in
 * eine zerlegte Adresse überführen. Ohne Schema wird https angenommen - das
 * ist, was ein Browser heute daraus macht.
 */
export function zerlegeAdresse(eingabe) {
  const roh = String(eingabe ?? '').trim().replace(/^[<"'(]+|[>"')]+$/g, '');
  const ergebnis = {
    eingabe: roh, url: '', schema: '', schemaAngegeben: false,
    host: '', domain: '', tld: '', gueltig: false,
  };
  if (!roh) return ergebnis;

  const schemaMatch = roh.match(/^([a-z][a-z0-9+.-]*):/i);
  ergebnis.schemaAngegeben = Boolean(schemaMatch) && /^[a-z][a-z0-9+.-]*:\/\//i.test(roh);
  const url = ergebnis.schemaAngegeben ? roh : `https://${roh.replace(/^\/+/, '')}`;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) return ergebnis;
    ergebnis.url = url;
    ergebnis.schema = parsed.protocol.replace(':', '');
    ergebnis.host = parsed.hostname.toLowerCase();
    ergebnis.domain = registrableDomain(ergebnis.host);
    ergebnis.tld = ergebnis.domain.split('.').pop();
    ergebnis.gueltig = true;
  } catch {
    ergebnis.gueltig = false;
  }
  return ergebnis;
}

/** Namensbestandteile ohne Endung und ohne "www" - dort stehen die Köderwörter. */
function namensteile(adresse) {
  const ohneTld = adresse.domain.split('.').slice(0, -1);
  const sub = adresse.host.slice(0, Math.max(0, adresse.host.length - adresse.domain.length))
    .split('.').filter((t) => t && t !== 'www');
  return [...sub, ...ohneTld].join('.');
}

function pruefeDieAdresse(adresse) {
  // Die Linkregeln kennen Tarnung, IP, Punycode, Homoglyphen, Kurzlinks,
  // Tippfehler- und Subdomain-Marken schon. Hier nur als Adresse neu einsortiert.
  const befunde = pruefeLinks({ text: adresse.url, html: '', header: () => '' })
    .filter((b) => b.id !== 'keine-links')
    .map((b) => ({ ...b, kategorie: KAT_ADRESSE }));

  const name = namensteile(adresse);

  // Ohne angegebenes Schema ist https angenommen - dann gibt es nichts zu bemängeln.
  if (adresse.schemaAngegeben && adresse.schema === 'http' && !befunde.some((b) => b.id === 'link-unverschlüsselt')) {
    befunde.push(befund(
      KAT_ADRESSE, 'adresse-http', 'mittel', 12,
      'Die Adresse ist unverschlüsselt (http statt https)',
      'Eine Seite, auf der man sich anmeldet oder Geld einzahlt, ohne Verschlüsselung zu betreiben, ist heute entweder Betrug oder grob fahrlässig.',
      adresse.url,
      'Auf einer Seite ohne https niemals Zugangs- oder Zahlungsdaten eingeben.',
    ));
  }

  const koeder = GELD_KOEDER.filter((k) => k.muster.test(name)).map((k) => k.wort);
  if (koeder.length) {
    befunde.push(befund(
      KAT_ADRESSE, 'adresse-geldkoeder', koeder.length >= 2 ? 'mittel' : 'niedrig', koeder.length >= 2 ? 16 : 10,
      'Der Domainname verspricht Geld',
      'Kurzlebige Anlage-, Verdienst- und Krypto-Seiten tragen ihr Versprechen oft schon im Namen. Für sich allein beweist das nichts - viele ehrliche Angebote heißen ähnlich.',
      [`Domain: ${adresse.domain}`, `Enthält: ${koeder.join(', ')}`],
      'Bevor du dort Geld einzahlst: Impressum lesen, den Betreiber im Handelsregister und die Erlaubnis in der BaFin-Unternehmensdatenbank nachschlagen.',
    ));
  }

  const billig = BILLIG_TLDS.has(adresse.tld);
  const riskant = RISKY_TLDS.has(adresse.tld);
  if (billig) {
    befunde.push(befund(
      KAT_ADRESSE, 'adresse-billig-tld', 'niedrig', 8,
      `Die Endung .${adresse.tld} ist billig und anonym zu haben`,
      'Solche Endungen kosten im ersten Jahr oft nur wenige Euro und werden deshalb gern für Seiten benutzt, die nach wenigen Wochen wieder verschwinden.',
      `Domain: ${adresse.domain}`,
      'Ein Anbieter, der dein Geld verwalten will, sitzt in Deutschland fast immer unter .de, .com oder .eu - mit Impressum.',
    ));
  }
  if (koeder.length && (billig || riskant)) {
    befunde.push(befund(
      KAT_ADRESSE, 'adresse-koeder-kombination', 'mittel', 12,
      'Geldversprechen im Namen auf einer Billig-Endung',
      'Die Kombination aus Köderwort und Wegwerf-Endung ist typisch für Seiten, die schnell Einzahlungen einsammeln und dann verschwinden.',
      `${adresse.domain}: "${koeder.join(', ')}" + .${adresse.tld}`,
      'Hier besonders gründlich prüfen, bevor du dich registrierst oder Geld überweist.',
    ));
  }

  // Marke im registrierten Namen selbst, z. B. sparkasse-kundenservice.online.
  // Tippfehler- und Subdomain-Fälle melden die Linkregeln schon.
  if (!befunde.some((b) => ['link-tippfehler', 'link-marke-subdomain'].includes(b.id))) {
    const eigenerName = adresse.domain.split('.').slice(0, -1).join('.');
    for (const marke of IMPERSONATED_BRANDS) {
      if (marke.token.length < 4 || marke.domains.includes(adresse.domain)) continue;
      if (!enthaeltMarkenname(eigenerName, marke.token)) continue;
      befunde.push(befund(
        KAT_ADRESSE, 'adresse-fremde-marke', 'hoch', 26,
        `Die Domain trägt "${marke.label}" im Namen, gehört aber nicht dazu`,
        'Wer eine bekannte Marke in einen fremden Domainnamen einbaut, will ihr Vertrauen ausleihen. Die echten Adressen sind andere.',
        [`Domain: ${adresse.domain}`, `Echte Adressen: ${marke.domains.join(', ')}`],
        `Rufe ${marke.domains[0]} selbst im Browser auf, statt diese Seite zu benutzen.`,
      ));
      break;
    }
  }

  const bindestriche = (adresse.domain.match(/-/g) || []).length;
  if (bindestriche >= 3) {
    befunde.push(befund(
      KAT_ADRESSE, 'adresse-bindestriche', 'niedrig', 8,
      'Auffällig viele Bindestriche im Domainnamen',
      'Namen wie konto-sicher-login-service.com werden aus Vertrauenswörtern zusammengesetzt. Etablierte Anbieter haben kurze Namen.',
      `Domain: ${adresse.domain}`,
      'Lies den Namen laut vor: Klingt er nach einer Firma oder nach einer Aneinanderreihung von Schlagwörtern?',
    ));
  }

  return befunde;
}

function pruefeSeitentext(roh) {
  const text = /<[a-z][^>]*>/i.test(roh) ? htmlToText(roh) : String(roh);
  const befunde = werteSignale(text, WEBSITE_SIGNALS, 'seite', KAT_SEITE);

  const impressum = /impressum|imprint|legal notice|anbieterkennzeichnung|angaben gem(?:a|ä|ae)(?:ss|ß) § ?5/i;
  if (text.replace(/\s/g, '').length >= 300 && !impressum.test(text)) {
    befunde.push(befund(
      KAT_SEITE, 'seite-kein-impressum', 'niedrig', 8,
      'Im eingefügten Text ist kein Impressum zu sehen',
      'Geschäftsmäßige Seiten, die sich an Kunden in Deutschland richten, müssen ein Impressum mit Namen und ladungsfähiger Anschrift haben (§ 5 DDG). Fehlt es, fehlt jeder greifbare Betreiber.',
      [],
      'Scrolle ganz nach unten und suche den Link "Impressum". Nur eine Postfach- oder Auslandsadresse ohne Registereintrag ist fast so schlecht wie keine.',
    ));
  }

  const bafin = text.match(/\bbafin\b[^.\n]{0,80}/i);
  if (bafin) {
    befunde.push(befund(
      KAT_SEITE, 'seite-bafin-behauptet', 'info', 0,
      'Die Seite beruft sich auf die BaFin',
      'Eine Erwähnung der Finanzaufsicht beweist nichts. Betrugsseiten schmücken sich regelmäßig mit erfundenen oder fremden Registernummern.',
      fundstelle(text, bafin[0]),
      'In der Unternehmensdatenbank der BaFin nachsehen, ob es genau diese Firma mit genau dieser Adresse gibt - und ob die BaFin vor ihr warnt.',
    ));
  }

  const messenger = text.match(/\b(?:telegram|whatsapp|signal)\b[^.\n]{0,40}/i);
  if (messenger && befunde.some((b) => b.gewicht > 0 && b.id !== 'seite-kein-impressum')) {
    befunde.push(befund(
      KAT_SEITE, 'seite-messenger', 'niedrig', 6,
      'Kontakt über Messenger',
      'Betrugsplattformen verlagern das Gespräch gern in Telegram- oder WhatsApp-Gruppen, wo "Mitglieder" von ihren Gewinnen schwärmen.',
      fundstelle(text, messenger[0]),
      'Gewinnbilder in einer Chatgruppe sind kein Beleg. Die "Mitglieder" gehören oft zu den Betreibern.',
    ));
  }

  return { befunde, textLaenge: text.trim().length };
}

/**
 * Eine Webadresse und optional den kopierten Text der Seite prüfen.
 * Die Seite selbst wird nicht aufgerufen.
 */
export function pruefeWebsite(eingabe, seitentext = '') {
  const adresse = zerlegeAdresse(eingabe);
  const befunde = [];

  if (!adresse.gueltig) {
    befunde.push(befund(
      KAT_ADRESSE, 'adresse-unlesbar', 'info', 0,
      'Die Adresse ließ sich nicht lesen',
      'Erwartet wird eine Webadresse wie beispiel.de oder https://www.beispiel.de/seite.',
      adresse.eingabe ? kuerzen(adresse.eingabe, 120) : [],
      'Kopiere die Adresse direkt aus der Adresszeile des Browsers.',
    ));
  } else {
    befunde.push(...pruefeDieAdresse(adresse));
  }

  let textLaenge = 0;
  if (String(seitentext).trim()) {
    const seite = pruefeSeitentext(seitentext);
    befunde.push(...seite.befunde);
    textLaenge = seite.textLaenge;
  }

  befunde.push(befund(
    KAT_ADRESSE, 'adresse-offline', 'info', 0,
    'Die Seite selbst wurde nicht aufgerufen',
    textLaenge
      ? 'Geprüft wurden die Adresse und der eingefügte Text. Nicht geprüft: Alter der Domain, Inhaber, Sperrlisten und Warnmeldungen - dafür müsste das Werkzeug ins Netz.'
      : 'Geprüft wurde nur die Adresse. Was auf der Seite steht, wer sie betreibt und wie alt sie ist, bleibt offen. Füge den Text der Seite mit ein, um auch den Inhalt zu prüfen.',
    adresse.domain ? `Domain: ${adresse.domain}` : [],
    'Selbst nachschlagen: BaFin-Unternehmensdatenbank und Verbraucherwarnungen der BaFin, die Warnliste Geldanlage der Verbraucherzentralen, bei Shops den Fakeshop-Finder, und den Betreiber aus dem Impressum im Handelsregister.',
  ));

  return { adresse, befunde, textLaenge };
}
