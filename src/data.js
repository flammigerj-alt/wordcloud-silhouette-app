/**
 * Nachschlagewerk für die Regeln: Marken, Freemail-Anbieter, Kürzungsdienste,
 * riskante Dateitypen und Signalwörter (deutsch und englisch).
 *
 * Alle Listen sind bewusst offen gehalten - sie sollen häufige Fälle abdecken,
 * nicht Vollständigkeit vortäuschen.
 */

/** Marken, die in Deutschland besonders oft missbraucht werden. */
export const IMPERSONATED_BRANDS = [
  { token: 'paypal', label: 'PayPal', domains: ['paypal.com', 'paypal.de'] },
  { token: 'sparkasse', label: 'Sparkasse', domains: ['sparkasse.de'] },
  { token: 'volksbank', label: 'Volksbank', domains: ['volksbank.de', 'vr.de'] },
  { token: 'raiffeisen', label: 'Raiffeisenbank', domains: ['raiffeisen.de', 'vr.de'] },
  { token: 'commerzbank', label: 'Commerzbank', domains: ['commerzbank.de'] },
  { token: 'postbank', label: 'Postbank', domains: ['postbank.de'] },
  { token: 'deutsche-bank', label: 'Deutsche Bank', domains: ['deutsche-bank.de', 'db.com'] },
  { token: 'targobank', label: 'Targobank', domains: ['targobank.de'] },
  { token: 'comdirect', label: 'comdirect', domains: ['comdirect.de'] },
  { token: 'consorsbank', label: 'Consorsbank', domains: ['consorsbank.de'] },
  { token: 'dkb', label: 'DKB', domains: ['dkb.de'] },
  { token: 'ing', label: 'ING', domains: ['ing.de'] },
  { token: 'n26', label: 'N26', domains: ['n26.com'] },
  { token: 'klarna', label: 'Klarna', domains: ['klarna.com', 'klarna.de'] },
  { token: 'amazon', label: 'Amazon', domains: ['amazon.de', 'amazon.com'] },
  { token: 'apple', label: 'Apple', domains: ['apple.com', 'icloud.com'] },
  { token: 'microsoft', label: 'Microsoft', domains: ['microsoft.com', 'office.com', 'live.com'] },
  { token: 'google', label: 'Google', domains: ['google.com', 'google.de'] },
  { token: 'netflix', label: 'Netflix', domains: ['netflix.com'] },
  { token: 'disney', label: 'Disney+', domains: ['disneyplus.com'] },
  { token: 'spotify', label: 'Spotify', domains: ['spotify.com'] },
  { token: 'telekom', label: 'Telekom', domains: ['telekom.de', 't-online.de'] },
  { token: 'vodafone', label: 'Vodafone', domains: ['vodafone.de'] },
  { token: 'o2', label: 'o2', domains: ['o2online.de', 'telefonica.de'] },
  { token: '1und1', label: '1&1', domains: ['1und1.de', 'ionos.de'] },
  { token: 'dhl', label: 'DHL', domains: ['dhl.de', 'dhl.com'] },
  { token: 'hermes', label: 'Hermes', domains: ['myhermes.de', 'hermesworld.com'] },
  { token: 'gls', label: 'GLS', domains: ['gls-pakete.de', 'gls-group.eu'] },
  { token: 'dpd', label: 'DPD', domains: ['dpd.de', 'dpd.com'] },
  { token: 'ups', label: 'UPS', domains: ['ups.com'] },
  { token: 'fedex', label: 'FedEx', domains: ['fedex.com'] },
  { token: 'deutsche-post', label: 'Deutsche Post', domains: ['deutschepost.de'] },
  { token: 'ebay', label: 'eBay', domains: ['ebay.de', 'ebay.com'] },
  { token: 'kleinanzeigen', label: 'Kleinanzeigen', domains: ['kleinanzeigen.de'] },
  { token: 'otto', label: 'OTTO', domains: ['otto.de'] },
  { token: 'zalando', label: 'Zalando', domains: ['zalando.de'] },
  { token: 'shein', label: 'SHEIN', domains: ['shein.com'] },
  { token: 'elster', label: 'ELSTER', domains: ['elster.de'] },
  { token: 'finanzamt', label: 'Finanzamt', domains: ['elster.de', 'bzst.de'] },
  { token: 'zoll', label: 'Zoll', domains: ['zoll.de'] },
  { token: 'bundesagentur', label: 'Bundesagentur für Arbeit', domains: ['arbeitsagentur.de'] },
  { token: 'rundfunkbeitrag', label: 'Rundfunkbeitrag', domains: ['rundfunkbeitrag.de'] },
  { token: 'schufa', label: 'SCHUFA', domains: ['schufa.de'] },
  { token: 'bitpanda', label: 'Bitpanda', domains: ['bitpanda.com'] },
  { token: 'coinbase', label: 'Coinbase', domains: ['coinbase.com'] },
  { token: 'binance', label: 'Binance', domains: ['binance.com'] },
  { token: 'whatsapp', label: 'WhatsApp', domains: ['whatsapp.com'] },
  { token: 'instagram', label: 'Instagram', domains: ['instagram.com'] },
  { token: 'facebook', label: 'Facebook', domains: ['facebook.com'] },
  { token: 'linkedin', label: 'LinkedIn', domains: ['linkedin.com'] },
];

/** Freemail-Anbieter. Eine Firma oder Behörde schreibt nicht von hier. */
export const FREEMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch',
  'web.de', 'outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de',
  'live.com', 'live.de', 'yahoo.com', 'yahoo.de', 'aol.com', 'aol.de',
  't-online.de', 'freenet.de', 'mail.ru', 'yandex.ru', 'yandex.com',
  'protonmail.com', 'proton.me', 'tutanota.com', 'tuta.io', 'zoho.com',
  'mail.com', 'icloud.com', 'me.com', 'inbox.lv', 'seznam.cz', 'qq.com',
  '163.com', '126.com', 'rediffmail.com',
]);

/** Wegwerf-Adressen: in seriöser Geschäftspost praktisch nie zu sehen. */
export const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'yopmail.com', 'trashmail.com',
  '10minutemail.com', 'temp-mail.org', 'tempmail.com', 'sharklasers.com',
  'getnada.com', 'dispostable.com', 'maildrop.cc', 'moakt.com',
]);

/** URL-Kürzungsdienste verstecken das eigentliche Ziel. */
export const URL_SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
  'cutt.ly', 'rb.gy', 'shorturl.at', 'rebrand.ly', 's.id', 'lnkd.in',
  'tiny.cc', 'shorte.st', 'bl.ink', 'clck.ru', 'v.gd', 'qr.ae', 'urlz.fr',
  'short.io', 'kurzelinks.de', 'tinyurl.de', 'l.ead.me', 'x.co', 'mcaf.ee',
]);

/** Top-Level-Domains mit auffällig hohem Missbrauchsanteil. */
export const RISKY_TLDS = new Set([
  'zip', 'mov', 'top', 'xyz', 'icu', 'click', 'link', 'rest', 'quest',
  'cfd', 'sbs', 'buzz', 'work', 'country', 'gq', 'tk', 'ml', 'cf', 'ga',
  'monster', 'bar', 'cyou', 'lol', 'kim', 'autos', 'boats', 'live',
  'shop', 'fit', 'beauty', 'hair', 'skin', 'mom', 'wiki', 'su', 'ru',
]);

/**
 * Dateiendungen nach Risiko. Die Gewichte fließen direkt in die Bewertung ein.
 */
export const EXTENSION_RISK = {
  // Wird beim Doppelklick sofort ausgeführt.
  ausfuehrbar: {
    schwere: 'kritisch',
    gewicht: 40,
    endungen: ['exe', 'scr', 'com', 'pif', 'bat', 'cmd', 'msi', 'msix', 'msp',
      'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'ps1', 'psm1', 'hta', 'jar',
      'lnk', 'cpl', 'reg', 'inf', 'chm', 'scf', 'application', 'gadget',
      'appx', 'apk', 'dll', 'sys', 'pyz'],
    hinweis: 'Diese Endung wird beim Doppelklick direkt ausgeführt. Seriöse Absender verschicken so etwas nie per Mail.',
  },
  // Container, die den Mark-of-the-Web umgehen und Schadcode einschleusen.
  container: {
    schwere: 'hoch',
    gewicht: 32,
    endungen: ['iso', 'img', 'vhd', 'vhdx', 'cab', 'ace', 'arj', 'daa'],
    hinweis: 'Solche Container-Dateien werden benutzt, um Windows-Schutzmechanismen auszuhebeln.',
  },
  // Office-Dokumente mit Makros.
  makro: {
    schwere: 'hoch',
    gewicht: 30,
    endungen: ['docm', 'xlsm', 'pptm', 'xlam', 'dotm', 'xltm', 'potm', 'ppam', 'one'],
    hinweis: 'Makro-fähiges Dokument. Makros sind ein klassischer Weg, Schadsoftware nachzuladen.',
  },
  // Lokale Phishing-Seite im Anhang (HTML Smuggling).
  webseite: {
    schwere: 'hoch',
    gewicht: 28,
    endungen: ['html', 'htm', 'shtml', 'xhtml', 'mht', 'mhtml', 'svg', 'xht'],
    hinweis: 'Eine Webseite im Anhang ist fast immer eine nachgebaute Login-Maske, die lokal geöffnet wird und dabei jeden Link-Filter umgeht.',
  },
  // Ältere Office-Formate, die Makros enthalten können.
  altesOffice: {
    schwere: 'mittel',
    gewicht: 16,
    endungen: ['doc', 'xls', 'ppt', 'rtf', 'pub', 'xll', 'wbk'],
    hinweis: 'Altes Office-Format, das Makros oder Exploits transportieren kann.',
  },
  // Archive verstecken den Inhalt vor dem Virenscanner.
  archiv: {
    schwere: 'mittel',
    gewicht: 15,
    endungen: ['zip', 'rar', '7z', 'gz', 'tgz', 'bz2', 'xz', 'tar', 'z'],
    hinweis: 'Archive verbergen ihren Inhalt vor der Vorschau und teilweise vor dem Virenscanner.',
  },
  // Unauffällig, aber als Träger für Links und QR-Codes beliebt.
  dokument: {
    schwere: 'niedrig',
    gewicht: 5,
    endungen: ['pdf', 'docx', 'xlsx', 'pptx', 'odt', 'ods'],
    hinweis: 'Unauffälliges Format, kann aber Links oder QR-Codes zu einer Phishing-Seite enthalten.',
  },
};

/** Signalwörter im Text. Jede Gruppe wird einmal gewertet, nicht pro Treffer. */
export const CONTENT_SIGNALS = [
  {
    id: 'zeitdruck',
    titel: 'Künstlicher Zeitdruck',
    schwere: 'mittel',
    gewicht: 16,
    erklaerung: 'Druck ist das wichtigste Werkzeug beim Phishing: Wer sich hetzen lässt, prüft nicht nach.',
    rat: 'Kein seriöses Unternehmen setzt dir eine 24-Stunden-Frist per Mail. Genau das ist dein Signal, langsamer zu werden.',
    muster: [
      /\bdringend\b/i, /\bsofort(ig|ige[nmrs]?)?\b/i, /\bumgehend\b/i, /\bunverz(?:u|ü|ue)glich\b/i,
      /innerhalb von (?:24|48|72) stunden/i, /innerhalb der n(?:a|ä|ae)chsten \d+ (?:stunden|minuten|tage)/i,
      /letzte (?:mahnung|warnung|erinnerung|aufforderung|chance)/i,
      /frist(?: l(?:a|ä|ae)uft| endet| abgelaufen)/i, /nur noch (?:heute|bis)/i,
      /\bzeitnah\b/i, /handeln sie jetzt/i, /\burgent\b/i, /\bimmediately\b/i,
      /within (?:24|48|72) hours/i, /act now/i, /final (?:notice|warning|reminder)/i,
      /expires? (?:today|soon|in \d+)/i,
    ],
  },
  {
    id: 'drohung',
    titel: 'Drohung mit Sperrung, Kosten oder Rechtsfolgen',
    schwere: 'hoch',
    gewicht: 22,
    erklaerung: 'Angst schaltet das kritische Denken aus. Sperrungen und Rechtsfolgen werden nie zuerst per Mail angekündigt.',
    rat: 'Wenn wirklich etwas an deinem Konto hängt, siehst du das nach eigenständigem Login auf der echten Seite - oder du bekommst Post.',
    muster: [
      /\bgesperrt\b/i, /\bsperrung\b/i, /\bgel(?:o|ö|oe)scht\b/i, /\bl(?:o|ö|oe)schung\b/i,
      /\bdeaktiviert\b/i, /\bstillgelegt\b/i, /\beingeschr(?:a|ä|ae)nkt\b/i,
      /konto(?:schlie(?:s|ß|ss)ung|aufl(?:o|ö|oe)sung|sperre)/i,
      /(?:ihr|dein) (?:konto|zugang|account|profil) (?:wurde|wird|ist) (?:vor(?:u|ü|ue)bergehend )?(?:gesperrt|deaktiviert|eingeschr(?:a|ä|ae)nkt|geschlossen|gel(?:o|ö|oe)scht)/i, /\binkasso\b/i, /\bmahnverfahren\b/i,
      /rechtliche schritte/i, /\bstrafverfahren\b/i, /\bpf(?:a|ä|ae)ndung\b/i,
      /\bs(?:a|ä|ae)umnisgeb(?:u|ü|ue)hr/i, /geb(?:u|ü|ue)hren? (?:von|in h(?:o|ö|oe)he)/i,
      /\bsuspend(?:ed|ing)?\b/i, /\bterminated?\b/i, /permanently (?:closed|deleted)/i,
      /legal action/i, /account (?:locked|restricted|on hold)/i,
    ],
  },
  {
    id: 'zugangsdaten',
    titel: 'Aufforderung, Zugangsdaten oder TAN preiszugeben',
    schwere: 'kritisch',
    gewicht: 34,
    erklaerung: 'Keine Bank, kein Zahlungsdienst und keine Behörde fragt per Mail nach Passwort, PIN oder TAN. Nicht einmal ausnahmsweise.',
    rat: 'Diese Regel hat keine Ausnahme. Wer per Mail oder Telefon nach TAN, PIN oder Passwort fragt, ist ein Betrüger - immer.',
    muster: [
      /\b(?:i|m|photo|push|chip|smart|q[rR])?tan\b/i, /\bpin\b(?!\s*code\s*der\s*sendung)/i,
      /\bpasswort\b/i, /\bkennwort\b/i, /\bzugangsdaten\b/i, /\blogin[- ]?daten\b/i,
      /\bverifizier(?:en|ung|ieren)/i, /\bidentit(?:a|ä|ae)t (?:best(?:a|ä|ae)tigen|nachweisen|verifizieren)/i,
      /daten (?:best(?:a|ä|ae)tigen|aktualisieren|abgleichen|best(?:a|ä|ae)tigung)/i,
      /(?:best(?:a|ä|ae)tigen|aktualisieren|verifizieren|best(?:a|ä|ae)tige|hinterlege) sie (?:bitte )?(?:ihre|ihr|deine|dein)[\w ]{0,25}(?:daten|konto|angaben|identit(?:a|ä|ae)t|adresse)/i,
      /(?:ihre|deine) (?:pers(?:o|ö|oe)nlichen |vollst(?:a|ä|ae)ndigen )?(?:konto|zugangs|bank|kunden)?daten (?:erneut )?(?:ein(?:zu)?geben|(?:zu )?best(?:a|ä|ae)tigen|(?:zu )?hinterlegen)/i,
      /konto (?:reaktivieren|freischalten|entsperren|best(?:a|ä|ae)tigen)/i,
      /\blegitimation(?:sverfahren)?\b/i, /\blegitimieren\b/i, /\bre-?aktivierung\b/i,
      /verify your (?:account|identity|details)/i, /confirm your (?:password|account|identity)/i,
      /update your (?:payment|billing|account) (?:details|information)/i,
      /\bsecurity code\b/i, /\bone[- ]time (?:code|password)\b/i,
    ],
  },
  {
    id: 'kontowechsel',
    titel: 'Geänderte Bankverbindung',
    schwere: 'kritisch',
    gewicht: 36,
    erklaerung: 'Der Klassiker beim Rechnungsbetrug: Eine echte Rechnung wird abgefangen und mit neuer IBAN weitergeleitet.',
    rat: 'Eine geänderte Bankverbindung immer per Telefon bestätigen lassen - unter der Nummer aus deinen alten Unterlagen, nie unter der aus der Mail.',
    muster: [
      /neue (?:bankverbindung|kontoverbindung|iban|kontonummer)/i,
      /(?:bankverbindung|kontoverbindung|iban) (?:hat sich )?ge(?:a|ä|ae)ndert/i,
      /ge(?:a|ä|ae)nderte (?:bankverbindung|kontodaten|iban)/i,
      /bitte (?:ab sofort |k(?:u|ü|ue)nftig )?auf (?:das |unser )?(?:neue|folgende)s? konto/i,
      /(?:bank|account) details (?:have )?changed/i, /updated? (?:our )?bank account/i,
    ],
  },
  {
    id: 'zahlung',
    titel: 'Zahlungsaufforderung oder unübliches Zahlungsmittel',
    schwere: 'hoch',
    gewicht: 24,
    erklaerung: 'Gutscheinkarten und Krypto sind für Betrüger attraktiv, weil die Zahlung nicht zurückgeholt werden kann.',
    rat: 'Niemand, der es ehrlich meint, lässt sich mit Guthabenkarten oder Bitcoin bezahlen. Das ist praktisch immer Betrug.',
    muster: [
      /\bgutschein(?:karte|code)?\b/i, /\bguthabenkarte\b/i, /google[- ]play[- ]?(?:karte|code)/i,
      /\bsteam[- ]?(?:karte|guthaben)/i, /\bpaysafecard\b/i, /\bamazon[- ]gutschein/i,
      /\bbitcoin\b/i, /\bbtc\b/i, /\bethereum\b/i, /\bkrypto(?:w(?:a|ä|ae)hrung)?\b/i, /\bwallet\b/i,
      /\bwestern union\b/i, /\bmoneygram\b/i, /\bvorkasse\b/i, /\banzahlung\b/i,
      /(?:betrag|summe) von \d+[.,]?\d*\s*(?:eur|euro|€)/i,
      /gift card/i, /wire transfer/i,
    ],
  },
  {
    id: 'unpersönlich',
    titel: 'Unpersönliche Anrede',
    schwere: 'mittel',
    gewicht: 13,
    erklaerung: 'Wer wirklich Kunde bei dir ist, kennt deinen Namen. Massenmails kennen ihn nicht.',
    rat: 'Eine fehlende namentliche Anrede allein beweist nichts - viele echte Newsletter sind auch unpersönlich. Zusammen mit anderen Signalen wiegt sie schwer.',
    muster: [
      /sehr geehrter? (?:kunde|kundin|nutzer|benutzer|kontoinhaber|herr\/frau|damen und herren)/i,
      /liebe[rs]? (?:kunde|kundin|nutzer|benutzer|mitglied)\b/i,
      /hallo (?:kunde|nutzer|lieber kunde)/i,
      /dear (?:customer|user|client|member|sir\/madam|account holder)/i,
      /\bvaluated? customer\b/i,
    ],
  },
  {
    id: 'behörde',
    titel: 'Auftreten als Behörde oder Strafverfolgung',
    schwere: 'hoch',
    gewicht: 26,
    erklaerung: 'Behörden stellen Forderungen und Verfahren nicht per E-Mail zu, schon gar nicht mit Zahlungslink.',
    rat: 'Behördliche Bescheide kommen per Post. Im Zweifel bei der Behörde anrufen - Nummer selbst heraussuchen.',
    muster: [
      /bundeskriminalamt/i, /\bbka\b/i, /\beuropol\b/i, /\binterpol\b/i,
      /staatsanwaltschaft/i, /\bpolizeipr(?:a|ä|ae)sidium\b/i, /\bermittlungsverfahren\b/i,
      /\bfinanzamt\b/i, /\belster\b/i, /\bzollamt\b/i, /\bbundesnetzagentur\b/i,
      /\bgerichtsvollzieher\b/i, /\bamtsgericht\b/i,
    ],
  },
  {
    id: 'gewinn',
    titel: 'Gewinn-, Erbschafts- oder Rückzahlungsversprechen',
    schwere: 'hoch',
    gewicht: 24,
    erklaerung: 'Unerwartetes Geld ist der älteste Köder überhaupt.',
    rat: 'Du kannst nichts gewinnen, wo du nicht teilgenommen hast, und niemand vererbt dir etwas per E-Mail.',
    muster: [
      /sie haben (?:gewonnen|einen? .{0,20}gewinn)/i, /\bgewinnspiel\b/i, /\blotterie\b/i,
      /\berbschaft\b/i, /\berbe\b/i, /\bmillionen\b/i, /\bunerwartete[rn]? geldeingang/i,
      /(?:steuer|geb(?:u|ü|ue)hren|betrag)r(?:u|ü|ue)ckerstattung/i, /r(?:u|ü|ue)ckerstattung (?:von|in h(?:o|ö|oe)he)/i,
      /you have won/i, /\blottery\b/i, /\binheritance\b/i, /\bbeneficiary\b/i,
      /\btax refund\b/i, /unclaimed funds/i,
    ],
  },
  {
    id: 'sextortion',
    titel: 'Erpressung mit angeblichem Material',
    schwere: 'hoch',
    gewicht: 26,
    erklaerung: 'Reine Bluff-Masche. Das genannte Passwort stammt aus einem alten, öffentlichen Datenleck - nicht aus einem Hack deines Geräts.',
    rat: 'Nicht zahlen, nicht antworten, löschen. Aber: das genannte Passwort überall ändern, wo du es noch benutzt.',
    muster: [
      /\bwebcam\b/i, /ihre? kamera/i, /kompromittierend(?:es)? material/i,
      /\bintime[ns]? (?:aufnahmen|videos?|bilder)/i, /pornoseite/i, /\berwachsenenseite/i,
      /ich habe (?:ihr|dein) passwort/i, /ihr ger(?:a|ä|ae)t (?:wurde )?(?:gehackt|infiziert)/i,
      /\btrojaner installiert/i, /i have (?:your|recorded)/i, /\bsextortion\b/i,
    ],
  },
  {
    id: 'chefmasche',
    titel: 'Chefmasche: Vertraulichkeit und Alleingang gefordert',
    schwere: 'kritisch',
    gewicht: 32,
    erklaerung: 'Beim CEO-Fraud gibt sich jemand als Vorgesetzter aus und verlangt eine schnelle, geheime Überweisung.',
    rat: 'Genau die Bitte, niemanden einzuweihen, ist das Erkennungszeichen. Sprich immer mit einem Menschen - persönlich oder unter bekannter Nummer.',
    muster: [
      /(?:streng )?vertraulich behandeln/i, /nicht mit (?:kollegen|dritten) (?:besprechen|teilen)/i,
      /niemandem (?:davon )?erz(?:a|ä|ae)hlen/i, /bin (?:gerade )?in (?:einem|einer) (?:meeting|besprechung|konferenz)/i,
      /nur per (?:mail|e-?mail) erreichbar/i, /kannst du das schnell/i,
      /keep this (?:confidential|between us)/i, /i am in a meeting/i,
    ],
  },
  {
    id: 'anhanglockung',
    titel: 'Aufforderung, den Anhang zu öffnen',
    schwere: 'mittel',
    gewicht: 12,
    erklaerung: 'Der Text soll dich dazu bringen, den Anhang unbesehen zu öffnen.',
    rat: 'Anhänge nur öffnen, wenn du sie erwartest und den Absender über einen zweiten Weg bestätigt hast.',
    muster: [
      /(?:siehe|im|beiliegende[rn]?|anbei|beigef(?:u|ü|ue)gte[rn]?) anhang/i,
      /anhang (?:(?:o|ö|oe)ffnen|pr(?:u|ü|ue)fen|ansehen)/i, /dokument im anhang/i,
      /rechnung (?:im|als) anhang/i, /(?:see|open) (?:the )?attach(?:ed|ment)/i,
    ],
  },
  {
    id: 'qrcode',
    titel: 'QR-Code statt Link (Quishing)',
    schwere: 'hoch',
    gewicht: 22,
    erklaerung: 'Ein QR-Code umgeht jeden Link-Filter und verlagert den Klick auf dein Handy, wo die Adresse schlechter sichtbar ist.',
    rat: 'QR-Codes aus E-Mails grundsätzlich nicht scannen. Die Zieladresse siehst du dabei erst, wenn es zu spät ist.',
    muster: [
      /\bqr[- ]?code\b/i, /code (?:mit dem handy |mit ihrem smartphone )?(?:scannen|einscannen)/i,
      /scan(?:nen sie)? (?:den|diesen) code/i, /scan the (?:qr )?code/i,
    ],
  },
];

/** Homoglyphen: optisch ähnliche Zeichen aus anderen Schriftsystemen. */
export const HOMOGLYPHS = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y',
  'і': 'i', 'ѕ': 's', 'ԁ': 'd', 'һ': 'h', 'ј': 'j', 'ӏ': 'l', 'ԛ': 'q',
  'ν': 'v', 'ο': 'o', 'ρ': 'p', 'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k',
  'τ': 't', 'υ': 'u', 'χ': 'x', 'һ': 'h',
};
