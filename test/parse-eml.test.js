import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEml, parseAddressList, registrableDomain,
  decodeEncodedWords, decodeQuotedPrintable, parseParameterizedHeader,
} from '../src/parse-eml.js';

test('erkennt echte Mail-Koepfe und trennt sie vom Rumpf', () => {
  const mail = parseEml('From: a@b.de\nSubject: Test\n\nHallo Welt');
  assert.equal(mail.isEmail, true);
  assert.equal(mail.header('subject'), 'Test');
  assert.equal(mail.text, 'Hallo Welt');
});

test('behandelt blossen Text ohne Kopf als Rumpf', () => {
  const mail = parseEml('Nur ein bisschen Text ohne jeden Header.');
  assert.equal(mail.isEmail, false);
  assert.match(mail.text, /Nur ein bisschen Text/);
});

test('entfaltet mehrzeilige Header', () => {
  const mail = parseEml('Subject: Erste Zeile\n\tzweite Zeile\nFrom: a@b.de\n\nRumpf');
  assert.equal(mail.header('subject'), 'Erste Zeile zweite Zeile');
});

test('dekodiert Base64-Encoded-Words', () => {
  assert.equal(decodeEncodedWords('=?UTF-8?B?SGFsbG8gV2VsdA==?='), 'Hallo Welt');
});

test('dekodiert Quoted-Printable-Encoded-Words mit Unterstrich als Leerzeichen', () => {
  assert.equal(decodeEncodedWords('=?UTF-8?Q?Gr=C3=BC=C3=9Fe_Max?='), 'Grüße Max');
});

test('dekodiert Quoted-Printable inklusive weicher Zeilenumbrueche', () => {
  assert.equal(decodeQuotedPrintable('Gr=C3=BC=\r\nsse'), 'Grüsse');
});

test('zerlegt Adresslisten mit Anzeigenamen und Kommas darin', () => {
  const adressen = parseAddressList('"Mustermann, Max" <max@beispiel.de>, zweite@andere.de');
  assert.equal(adressen.length, 2);
  assert.equal(adressen[0].display, 'Mustermann, Max');
  assert.equal(adressen[0].domain, 'beispiel.de');
  assert.equal(adressen[1].address, 'zweite@andere.de');
});

test('ermittelt die registrierbare Domain, auch bei mehrteiligen Endungen', () => {
  assert.equal(registrableDomain('mail.beispiel.de'), 'beispiel.de');
  assert.equal(registrableDomain('a.b.beispiel.co.uk'), 'beispiel.co.uk');
  assert.equal(registrableDomain('beispiel.de'), 'beispiel.de');
});

test('liest Parameter aus Content-Type inklusive Anfuehrungszeichen', () => {
  const ct = parseParameterizedHeader('multipart/mixed; boundary="ab; cd"; charset=utf-8');
  assert.equal(ct.value, 'multipart/mixed');
  assert.equal(ct.params.boundary, 'ab; cd');
  assert.equal(ct.params.charset, 'utf-8');
});

test('zerlegt mehrteilige Mails in Text, HTML und Anhaenge', () => {
  const roh = [
    'From: a@b.de',
    'Content-Type: multipart/mixed; boundary="XX"',
    '',
    '--XX',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    'Klartext hier',
    '--XX',
    'Content-Type: text/html; charset=UTF-8',
    '',
    '<p>HTML hier</p>',
    '--XX',
    'Content-Type: application/pdf; name="rechnung.pdf"',
    'Content-Disposition: attachment; filename="rechnung.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    'JVBERi0=',
    '--XX--',
  ].join('\n');
  const mail = parseEml(roh);
  assert.match(mail.text, /Klartext hier/);
  assert.match(mail.html, /HTML hier/);
  assert.equal(mail.attachments.length, 1);
  assert.equal(mail.attachments[0].filename, 'rechnung.pdf');
});

test('faellt bei kaputter Struktur nicht um', () => {
  for (const eingabe of ['', '\n\n\n', 'From:', 'Content-Type: multipart/mixed; boundary="fehlt"\n\n--anders', '=?kaputt?X?zz?=']) {
    assert.doesNotThrow(() => parseEml(eingabe));
  }
});
