import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analysiereAdresse } from '../src/analyzer.js';
import { zerlegeAdresse } from '../src/rules/website.js';

const seite = readFileSync(new URL('../beispiele/anlagebetrug-seite.txt', import.meta.url), 'utf8');
const hatBefund = (bericht, id) => bericht.befunde.some((b) => b.id === id);

test('Adresse ohne Schema wird als https gelesen', () => {
  const a = zerlegeAdresse('www.cashconnect.online/start');
  assert.equal(a.gueltig, true);
  assert.equal(a.schema, 'https');
  assert.equal(a.schemaAngegeben, false);
  assert.equal(a.host, 'www.cashconnect.online');
  assert.equal(a.domain, 'cashconnect.online');
  assert.equal(a.tld, 'online');
});

test('Unlesbare Eingaben werfen nicht und bleiben ungueltig', () => {
  for (const eingabe of ['', '   ', 'kein punkt', 'javascript:alert(1)', 'ftp://x.de', '::::', 'a'.repeat(5000)]) {
    assert.doesNotThrow(() => analysiereAdresse(eingabe), `Ausnahme bei: ${eingabe.slice(0, 20)}`);
    assert.equal(zerlegeAdresse(eingabe).gueltig, false, `faelschlich gueltig: ${eingabe.slice(0, 20)}`);
  }
});

test('Nur die Adresse: Geldkoeder und Billig-Endung, aber niedrige Aussagekraft', () => {
  const bericht = analysiereAdresse('https://www.cashconnect.online/');
  assert.equal(bericht.art, 'adresse');
  assert.ok(hatBefund(bericht, 'adresse-geldkoeder'));
  assert.ok(hatBefund(bericht, 'adresse-billig-tld'));
  assert.ok(hatBefund(bericht, 'adresse-offline'));
  assert.equal(bericht.sicherheit.stufe, 'niedrig');
  // Ein Name allein beweist keinen Betrug.
  assert.notEqual(bericht.stufe, 'rot');
});

test('Seitentext eines Anlagebetrugs wird als Betrug erkannt', () => {
  const bericht = analysiereAdresse('https://www.renditeturbo-beispiel.online/start', seite);
  assert.equal(bericht.stufe, 'rot');
  assert.equal(bericht.sicherheit.stufe, 'mittel');
  for (const id of ['seite-renditeversprechen', 'seite-einzahlung', 'seite-schneeball', 'seite-kryptozahlung',
    'seite-promi', 'seite-fernzugriff', 'seite-schnellgeld', 'seite-knappheit', 'seite-kein-impressum',
    'seite-bafin-behauptet']) {
    assert.ok(hatBefund(bericht, id), `Befund fehlt: ${id}`);
  }
  assert.ok(bericht.naechsteSchritte.some((s) => /Rückholdienst/.test(s)));
});

test('Seitentext als HTML wird ebenfalls gelesen', () => {
  const html = '<html><body><h1>Profit</h1><p>Garantierte Rendite von 3 % pro Tag!</p><script>var x="risikofrei"</script></body></html>';
  const bericht = analysiereAdresse('beispiel.de', html);
  assert.ok(hatBefund(bericht, 'seite-renditeversprechen'));
});

test('Echte Adressen bekannter Anbieter bleiben unauffaellig', () => {
  for (const url of ['https://www.sparkasse.de', 'paypal.com', 'https://www.ing.de/banking', 'learning-portal.de', 'pinterest.com']) {
    const bericht = analysiereAdresse(url);
    assert.equal(bericht.stufe, 'gruen', `Fehlalarm bei ${url}: ${bericht.befunde.map((b) => b.id).join(', ')}`);
    assert.equal(bericht.punkte, 0, `Punkte bei ${url}`);
  }
});

test('Gewoehnlicher Seitentext loest keine Anlagebetrugsbefunde aus', () => {
  const text = 'Impressum. Unser Sommerschlussverkauf: 20 % im Sale auf alle Jacken. Lieferung in 3 Stufen. '
    + 'Tagesgeld mit 2,5 % pro Jahr. Kontakt per Telefon oder E-Mail. Millionen zufriedene Kunden.';
  const bericht = analysiereAdresse('https://www.beispiel-shop.de', text);
  const seitenbefunde = bericht.befunde.filter((b) => b.kategorie === 'Seiteninhalt' && b.gewicht > 0);
  assert.deepEqual(seitenbefunde.map((b) => b.id), []);
});

test('Fremde Marke im Domainnamen wird gemeldet, Tippfehler nicht doppelt', () => {
  assert.ok(hatBefund(analysiereAdresse('sparkasse-kundenservice.online'), 'adresse-fremde-marke'));
  const tippfehler = analysiereAdresse('https://paypa1.com/login');
  assert.ok(hatBefund(tippfehler, 'link-tippfehler'));
  assert.ok(!hatBefund(tippfehler, 'adresse-fremde-marke'));
});

test('Linkregeln greifen auch fuer eingegebene Adressen', () => {
  const ip = analysiereAdresse('http://192.168.1.1/login');
  assert.ok(hatBefund(ip, 'link-ip'));
  assert.ok(ip.befunde.every((b) => b.kategorie !== 'Links'), 'Befunde sollen unter Adresse einsortiert sein');
  assert.ok(hatBefund(analysiereAdresse('https://www.paypal.de@boese.example.top/'), 'link-userinfo'));
  assert.ok(hatBefund(analysiereAdresse('https://amazon.de.konto-pruefen.example.top/'), 'link-marke-subdomain'));
});

test('jeder Webseiten-Befund traegt Erklaerung und Handlungsrat', () => {
  const bericht = analysiereAdresse('http://cash-profit-sofort-auszahlung.online', seite);
  for (const b of bericht.befunde) {
    assert.ok(b.id && b.titel && b.kategorie, `unvollstaendig: ${JSON.stringify(b)}`);
    assert.ok(b.erklaerung.length > 20, `Erklaerung zu kurz bei ${b.id}`);
    assert.ok(b.rat.length > 10, `Rat fehlt bei ${b.id}`);
  }
  assert.ok(bericht.punkte >= 0 && bericht.punkte <= 100);
});
