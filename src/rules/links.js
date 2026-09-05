import { registrableDomain, parseAddressList } from '../parse-eml.js';
import { URL_SHORTENERS, RISKY_TLDS, IMPERSONATED_BRANDS } from '../data.js';
import { extractLinks, istIpAdresse, findHomoglyphs, opticalNormalize, enthaeltMarkenname, levenshtein, kuerzen } from '../utils.js';

const KAT = 'Links';

function befund(id, schwere, gewicht, titel, erklaerung, beweis, rat) {
  return { id, kategorie: KAT, schwere, gewicht, titel, erklaerung, beweis: [].concat(beweis).filter(Boolean), rat };
}

/** Sieht der Ankertext selbst wie eine Adresse aus? */
function ankerAlsDomain(text) {
  const t = String(text).trim().replace(/\s+/g, '');
  if (!t || t.length > 120) return '';
  const treffer = t.match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/?#].*)?$/i);
  return treffer ? treffer[1].toLowerCase() : '';
}

export function pruefeLinks(mail) {
  const befunde = [];
  const links = extractLinks({ text: mail.text, html: mail.html });
  const from = parseAddressList(mail.header('from'))[0] || null;
  const absenderDomain = from ? registrableDomain(from.domain) : '';

  const echteLinks = links.filter((l) => ['http', 'https'].includes(l.schema) && l.gueltig);

  // Sichtbarer Text verspricht eine andere Adresse als das Ziel.
  const getarnt = [];
  for (const link of links) {
    const versprochen = ankerAlsDomain(link.ankerText);
    if (!versprochen || !link.domain) continue;
    const versprochenReg = registrableDomain(versprochen);
    if (versprochenReg && versprochenReg !== link.domain) {
      getarnt.push({ versprochen: versprochenReg, ziel: link.domain, url: link.url, anker: link.ankerText });
    }
  }
  if (getarnt.length) {
    befunde.push(befund(
      'link-tarnung', 'kritisch', 38,
      'Ein Link zeigt woanders hin, als der sichtbare Text verspricht',
      'Das ist der klassischste Phishing-Trick überhaupt: Angezeigt wird die echte Adresse, verlinkt ist eine fremde.',
      getarnt.slice(0, 4).map((g) => `Sichtbar "${kuerzen(g.anker, 60)}" führt zu ${g.ziel} (${kuerzen(g.url, 90)})`),
      'Fahre mit der Maus über jeden Link, ohne zu klicken. Unten links zeigt dein Programm das echte Ziel. Auf dem Handy: lange auf den Link drücken.',
    ));
  }

  for (const link of links) {
    if (link.schema === 'javascript' || link.schema === 'vbscript' || link.schema === 'data') {
      befunde.push(befund(
        'aktiver-link', 'kritisch', 34,
        `Link mit ausführbarem Inhalt (${link.schema}:)`,
        'Solche Links führen keinen Seitenaufruf aus, sondern starten Code oder öffnen eine im Link versteckte Seite.',
        kuerzen(link.url, 120),
        'In normaler E-Mail gibt es dafür keinen legitimen Grund.',
      ));
      break;
    }
  }

  const gesehen = new Set();
  const einmalig = (id) => {
    if (gesehen.has(id)) return false;
    gesehen.add(id);
    return true;
  };

  for (const link of echteLinks) {
    // Benutzername vor dem @: alles davor ist Dekoration.
    if (link.benutzerInfo && einmalig('userinfo')) {
      befunde.push(befund(
        'link-userinfo', 'kritisch', 36,
        'Link enthält vor dem @-Zeichen eine vorgetäuschte Adresse',
        'Alles zwischen den Schrägstrichen und dem @ ist Beiwerk. Der Browser geht zu dem, was hinter dem @ steht.',
        [kuerzen(link.url, 140), `Tatsächliches Ziel: ${link.host}`],
        'Suche in jeder Adresse nach einem @. In einer echten Web-Adresse hat es nichts verloren.',
      ));
    }

    if (istIpAdresse(link.host) && einmalig('ip-link')) {
      befunde.push(befund(
        'link-ip', 'hoch', 30,
        'Link führt direkt auf eine IP-Adresse statt auf einen Namen',
        'Wer eine echte Marke betreibt, benutzt seinen Domainnamen. Eine nackte IP deutet auf einen gekaperten oder anonymen Server.',
        kuerzen(link.url, 140),
        'Nicht anklicken.',
      ));
    }

    if (link.host.includes('xn--') && einmalig('punycode-link')) {
      befunde.push(befund(
        'link-punycode', 'hoch', 30,
        'Link nutzt eine kodierte Sonderzeichen-Domain',
        'Die Adresse sieht im Browser aus wie das Original, ist aber eine andere Domain.',
        [kuerzen(link.url, 140), `Host: ${link.host}`],
        'Nicht anklicken.',
      ));
    }

    const homo = findHomoglyphs(link.host);
    if (homo.length && einmalig('homo-link')) {
      befunde.push(befund(
        'link-homoglyphen', 'kritisch', 34,
        'Link-Adresse enthält Zeichen aus einem fremden Schriftsystem',
        'Optisch identische Buchstaben führen auf eine völlig andere Seite.',
        [kuerzen(link.url, 140), `Verdächtige Zeichen: ${homo.join(' ')}`],
        'Eindeutige Täuschungsabsicht.',
      ));
    }

    if (URL_SHORTENERS.has(link.domain) && einmalig('shortener')) {
      befunde.push(befund(
        'link-kurzlink', 'mittel', 16,
        `Kurzlink verbirgt das Ziel (${link.domain})`,
        'Ein Kurzlink zeigt dir vor dem Klick nicht, wo du landest.',
        kuerzen(link.url, 120),
        'In Geschäftspost unüblich. Wenn du das Ziel wissen willst, benutze einen Kurzlink-Auflöser statt zu klicken.',
      ));
    }

    if (link.port && !['80', '443'].includes(link.port) && einmalig('port')) {
      befunde.push(befund(
        'link-port', 'mittel', 16,
        `Link benutzt den ungewöhnlichen Port ${link.port}`,
        'Normale Webseiten laufen auf 80 oder 443. Abweichende Ports deuten auf einen provisorisch aufgesetzten Server.',
        kuerzen(link.url, 140),
        'Nicht anklicken.',
      ));
    }

    if (link.schema === 'http' && /login|anmeld|konto|account|secure|verify|bestaetig|zahlung|payment|bank/i.test(link.url) && einmalig('http-login')) {
      befunde.push(befund(
        'link-unverschlüsselt', 'mittel', 18,
        'Unverschlüsselter Link zu einer angeblichen Anmeldeseite',
        'Kein Anbieter betreibt seit Jahren noch eine Anmeldung ohne Verschlüsselung.',
        kuerzen(link.url, 140),
        'Anmeldeseiten ohne https sind entweder Betrug oder grob fahrlässig. In beiden Fällen: nicht eingeben.',
      ));
    }

    const tld = link.domain.split('.').pop();
    if (RISKY_TLDS.has(tld) && einmalig(`tld-${tld}`)) {
      befunde.push(befund(
        'link-tld', 'mittel', 14,
        `Link führt auf eine .${tld}-Domain`,
        'Diese Endungen sind anonym und billig zu haben und deshalb bei Betrügern beliebt.',
        [kuerzen(link.url, 120), `Domain: ${link.domain}`],
        'Passt die Endung nicht zum angeblichen Absender, ist das ein starkes Warnzeichen.',
      ));
    }

    // Weiterleitungskette: eine zweite Adresse steckt im Parameter.
    if (/[?&][^=]*=(?:https?%3a|https?:)/i.test(link.url) && einmalig('redirect')) {
      befunde.push(befund(
        'link-weiterleitung', 'mittel', 16,
        'Link enthält eine zweite, weiterleitende Adresse',
        'Betrüger hängen sich an fremde Weiterleitungen, damit die sichtbare Domain vertrauenswürdig wirkt.',
        kuerzen(link.url, 160),
        'Sieh dir an, was hinter dem zweiten "http" steht - dort landest du wirklich.',
      ));
    }

    const labels = link.host.split('.').filter(Boolean);
    if (labels.length > 4 && einmalig('subdomains')) {
      befunde.push(befund(
        'link-viele-subdomains', 'niedrig', 8,
        'Sehr viele Bestandteile in der Link-Adresse',
        'Lange Adressketten sollen verschleiern, welche Domain wirklich dahintersteht.',
        [kuerzen(link.url, 140), `Tatsächliche Domain: ${link.domain}`],
        'Lies die Adresse von rechts nach links. Maßgeblich sind die letzten beiden Bestandteile vor dem ersten Schrägstrich.',
      ));
    }

    // Markenname im Host, aber nicht in der registrierten Domain.
    for (const marke of IMPERSONATED_BRANDS) {
      if (marke.token.length < 4) continue;
      if (!enthaeltMarkenname(link.host, marke.token)) continue;
      if (enthaeltMarkenname(link.domain, marke.token)) continue;
      if (!einmalig(`marke-${marke.token}`)) break;
      befunde.push(befund(
        'link-marke-subdomain', 'kritisch', 34,
        `Link trägt "${marke.label}" im Namen, gehört aber zu ${link.domain}`,
        'In einer Adresse wie sparkasse.de.sicher-login.example zählt nur das Ende: example. Alles davor ist frei erfunden.',
        [kuerzen(link.url, 160), `Echte Domain: ${link.domain}`, `Erwartet wäre: ${marke.domains.join(', ')}`],
        `Rufe ${marke.domains[0]} selbst im Browser auf, statt den Link zu benutzen.`,
      ));
      break;
    }

    // Tippfehler-Domain im Link.
    for (const marke of IMPERSONATED_BRANDS) {
      for (const echt of marke.domains) {
        if (link.domain === echt) continue;
        const abstand = levenshtein(link.domain, echt);
        const optischGleich = opticalNormalize(link.domain) === opticalNormalize(echt);
        if (!optischGleich && !(abstand > 0 && abstand <= 2 && echt.length >= 7)) continue;
        if (!einmalig(`typo-${echt}`)) break;
        befunde.push(befund(
          'link-tippfehler', 'kritisch', 34,
          `Link-Domain ist von ${echt} kaum zu unterscheiden`,
          'Eine einzige vertauschte oder ausgetauschte Stelle reicht, damit die Adresse jemand anderem gehört.',
          [kuerzen(link.url, 140), `Link führt zu: ${link.domain}`, `Original: ${echt}`],
          `Die echte Adresse lautet ${echt}.`,
        ));
        break;
      }
    }
  }

  // Formular direkt in der Mail.
  if (/<form\b/i.test(mail.html)) {
    const hatPasswort = /<input[^>]*type\s*=\s*["']?password/i.test(mail.html);
    befunde.push(befund(
      'formular-in-mail', hatPasswort ? 'kritisch' : 'hoch', hatPasswort ? 40 : 26,
      hatPasswort ? 'Die Mail enthält ein Passwortfeld' : 'Die Mail enthält ein Eingabeformular',
      'Seriöse Anbieter lassen dich niemals direkt in einer E-Mail Daten eingeben. Sie schicken dich immer auf ihre Webseite.',
      (mail.html.match(/<form[^>]*>/i) || []).map((f) => kuerzen(f, 140)),
      'Nichts eingeben. Wenn du glaubst, dass etwas dran ist, ruf die Seite des Anbieters selbst auf.',
    ));
  }

  // Versteckter Text zur Filterumgehung.
  const versteckt = mail.html.match(/style\s*=\s*["'][^"']*(?:display\s*:\s*none|font-size\s*:\s*0|visibility\s*:\s*hidden|opacity\s*:\s*0)[^"']*["']/gi) || [];
  if (versteckt.length >= 2) {
    befunde.push(befund(
      'versteckter-text', 'mittel', 18,
      'Die Mail enthält unsichtbaren Text',
      'Unsichtbare Wörter werden eingebaut, um Spamfilter zu verwirren. Seriöse Newsletter brauchen das nicht.',
      versteckt.slice(0, 3).map((v) => kuerzen(v, 90)),
      'Ein deutlicher Hinweis auf gezielte Filterumgehung.',
    ));
  }

  // Fast nur Bild, kaum Text.
  if (mail.html) {
    const bilder = (mail.html.match(/<img\b/gi) || []).length;
    const textLaenge = (mail.text || '').replace(/\s/g, '').length;
    if (bilder >= 1 && textLaenge < 120 && mail.html.length > 300) {
      befunde.push(befund(
        'nur-bild', 'mittel', 16,
        'Der Inhalt steckt praktisch nur in einem Bild',
        'Text als Bild zu verschicken, umgeht jede inhaltliche Prüfung durch den Spamfilter.',
        `${bilder} Bild(er), nur ${textLaenge} Zeichen Text`,
        'Bei angeblichen Rechnungen und Kontowarnungen ein starkes Warnzeichen.',
      ));
    }
  }

  if (echteLinks.length && absenderDomain) {
    const fremde = [...new Set(echteLinks.map((l) => l.domain))]
      .filter((d) => d && d !== absenderDomain && !URL_SHORTENERS.has(d));
    if (fremde.length) {
      befunde.push(befund(
        'link-fremde-domain', 'niedrig', 8,
        'Die Links führen nicht zur Domain des Absenders',
        'Bei Versand über Marketing-Dienstleister ist das normal, bei Kontowarnungen einer Bank nicht.',
        [`Absender: ${absenderDomain}`, `Link-Ziele: ${fremde.slice(0, 5).join(', ')}`],
        'Frage dich, ob dieser Betreiber zum angeblichen Absender passt.',
      ));
    }
  }

  if (!links.length) {
    befunde.push({
      id: 'keine-links', kategorie: KAT, schwere: 'info', gewicht: 0,
      titel: 'Keine Links gefunden',
      erklaerung: 'In der eingefügten Fassung sind keine anklickbaren Adressen enthalten.',
      beweis: [],
      rat: 'Falls die Mail im Postfach Links enthält, füge sie noch einmal als Originaltext ein - beim reinen Kopieren gehen sie oft verloren.',
    });
  }

  return befunde;
}
