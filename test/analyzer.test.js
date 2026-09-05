import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analysiere } from '../src/analyzer.js';

const lade = (name) => readFileSync(new URL(`../beispiele/${name}`, import.meta.url), 'utf8');
const hatBefund = (bericht, id) => bericht.befunde.some((b) => b.id === id);

test('echte Mail bleibt unauffaellig', () => {
  const bericht = analysiere(lade('echte-mail.eml'));
  assert.equal(bericht.stufe, 'gruen');
  assert.equal(bericht.punkte, 0);
  assert.ok(hatBefund(bericht, 'auth-ok'));
});

test('Bank-Phishing wird als Betrug erkannt', () => {
  const bericht = analysiere(lade('phishing-bank.eml'));
  assert.equal(bericht.stufe, 'rot');
  assert.ok(bericht.punkte >= 80);
  for (const id of ['auth-dmarc', 'auth-spf', 'link-tarnung', 'link-marke-subdomain',
    'inhalt-zugangsdaten', 'inhalt-drohung', 'reply-to-abweichung', 'versteckter-text']) {
    assert.ok(hatBefund(bericht, id), `Befund fehlt: ${id}`);
  }
});

test('Rechnungsbetrug mit geaenderter Bankverbindung wird erkannt', () => {
  const bericht = analysiere(lade('rechnungsbetrug.eml'));
  assert.equal(bericht.stufe, 'rot');
  assert.ok(hatBefund(bericht, 'inhalt-kontowechsel'));
  assert.ok(hatBefund(bericht, 'reply-to-abweichung'));
  assert.ok(hatBefund(bericht, 'inhalt-falsche-antwort'));
});

test('getarnter Link wird unabhaengig vom uebrigen Inhalt gefunden', () => {
  const bericht = analysiere('From: a@b.de\nContent-Type: text/html\n\n<a href="http://boese.example.top/x">https://www.sparkasse.de</a>');
  assert.ok(hatBefund(bericht, 'link-tarnung'));
  assert.equal(bericht.stufe, 'rot');
});

test('At-Zeichen-Trick in der Adresse wird erkannt', () => {
  const bericht = analysiere('From: a@b.de\n\nBitte hier klicken: https://www.paypal.de@boese-server.example.top/login');
  assert.ok(hatBefund(bericht, 'link-userinfo'));
});

test('Markenname nur in der Subdomain wird erkannt', () => {
  const bericht = analysiere('From: a@b.de\n\nhttps://amazon.de.konto-pruefung.example.top/verify');
  assert.ok(hatBefund(bericht, 'link-marke-subdomain'));
});

test('Anzeigename mit fremder Marke schlaegt an', () => {
  const bericht = analysiere('From: "PayPal Service" <abrechnung@zahlung-pruefen.example.top>\nTo: x@y.de\n\nHallo');
  assert.ok(hatBefund(bericht, 'anzeigename-marke'));
});

test('Firmenname ueber Freemail-Adresse schlaegt an', () => {
  const bericht = analysiere('From: "Muster Holding GmbH Buchhaltung" <muster.holding@gmail.com>\nTo: x@y.de\n\nHallo');
  assert.ok(hatBefund(bericht, 'freemail-firma'));
});

test('ausfuehrbarer Anhang mit doppelter Endung ist kritisch', () => {
  const roh = [
    'From: a@b.de',
    'Content-Type: multipart/mixed; boundary="XX"',
    '',
    '--XX',
    'Content-Type: text/plain',
    '',
    'Siehe Anhang.',
    '--XX',
    'Content-Type: application/octet-stream; name="Rechnung.pdf.exe"',
    'Content-Disposition: attachment; filename="Rechnung.pdf.exe"',
    '',
    'AAAA',
    '--XX--',
  ].join('\n');
  const bericht = analysiere(roh);
  assert.ok(hatBefund(bericht, 'anhang-doppelte-endung'));
  assert.equal(bericht.stufe, 'rot');
});

test('Passwortfeld direkt in der Mail ist kritisch', () => {
  const bericht = analysiere('From: a@b.de\nContent-Type: text/html\n\n<form action="http://x.example.top"><input type="password" name="p"></form>');
  assert.ok(hatBefund(bericht, 'formular-in-mail'));
  assert.equal(bericht.stufe, 'rot');
});

test('Aussagekraft sinkt, wenn der Kopf fehlt', () => {
  const ohne = analysiere('Ihr Konto wurde gesperrt.');
  const mit = analysiere(lade('phishing-bank.eml'));
  assert.equal(ohne.sicherheit.stufe, 'niedrig');
  assert.equal(mit.sicherheit.stufe, 'hoch');
  assert.ok(hatBefund(ohne, 'kein-header'));
});

test('Punktzahl bleibt immer zwischen 0 und 100', () => {
  const eingaben = ['', 'harmloser Text', lade('phishing-bank.eml'), lade('rechnungsbetrug.eml'), 'x'.repeat(50000)];
  for (const eingabe of eingaben) {
    const bericht = analysiere(eingabe);
    assert.ok(bericht.punkte >= 0 && bericht.punkte <= 100, `ausserhalb: ${bericht.punkte}`);
    assert.ok(['rot', 'gelb', 'gruen'].includes(bericht.stufe));
    assert.ok(bericht.naechsteSchritte.length > 0);
  }
});

test('jeder Befund traegt Erklaerung und Handlungsrat', () => {
  const bericht = analysiere(lade('phishing-bank.eml'));
  for (const b of bericht.befunde) {
    assert.ok(b.id && b.titel && b.kategorie, `unvollstaendig: ${JSON.stringify(b)}`);
    assert.ok(b.erklaerung.length > 20, `Erklaerung zu kurz bei ${b.id}`);
    assert.ok(b.rat.length > 10, `Rat fehlt bei ${b.id}`);
  }
});

test('beliebige Eingaben fuehren nie zu einer Ausnahme', () => {
  const muell = [' ', '<<<>>>', 'From: '.repeat(1000), '=?=?=?', '--', 'a@'.repeat(500)];
  for (const eingabe of muell) {
    assert.doesNotThrow(() => analysiere(eingabe), `Ausnahme bei: ${eingabe.slice(0, 20)}`);
  }
});

test('Firmennamen mit Markensilben loesen keinen Fehlalarm aus', () => {
  // "Holding" enthaelt "ing", "Duo24" enthaelt "o2": beides darf NICHT als
  // Missbrauch der Marken ING bzw. o2 gemeldet werden.
  const faelle = [
    'From: "Beispiel Holding GmbH" <noreply@beispiel-holding-mv.de>\nTo: x@y.de\n\nGuten Tag, anbei die Unterlagen. Mit freundlichen Gruessen',
    'From: "Duo24 Service" <info@duo24.de>\nTo: x@y.de\n\nGuten Tag, anbei die Unterlagen. Mit freundlichen Gruessen',
    'From: "Klingel Versand" <info@klingel-versand.de>\nTo: x@y.de\n\nGuten Tag, anbei die Unterlagen. Mit freundlichen Gruessen',
  ];
  for (const roh of faelle) {
    const bericht = analysiere(roh);
    assert.ok(!hatBefund(bericht, 'anzeigename-marke'), `Fehlalarm bei: ${roh.split('\n')[0]}`);
    assert.ok(!hatBefund(bericht, 'marke-in-subdomain'), `Fehlalarm bei: ${roh.split('\n')[0]}`);
  }
});

test('echter Markenmissbrauch wird trotz der Wortgrenze weiter erkannt', () => {
  const treffer = [
    ['From: "ING Kundenservice" <service@ing-sicherheit.example.top>\nTo: x@y.de\n\nHallo', 'anzeigename-marke'],
    ['From: "PayPal" <x@paypal-verify.example.top>\nTo: x@y.de\n\nHallo', 'anzeigename-marke'],
    ['From: "Deutsche Bank" <x@db-kundenportal.example.top>\nTo: x@y.de\n\nHallo', 'anzeigename-marke'],
  ];
  for (const [roh, id] of treffer) {
    assert.ok(hatBefund(analysiere(roh), id), `nicht erkannt: ${roh.split('\n')[0]}`);
  }
});
