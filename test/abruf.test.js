import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { ruefeSeiteAb, istPrivateIp } from '../src/abruf.js';
import { analysiereAdresse } from '../src/analyzer.js';

const beispiel = readFileSync(new URL('../beispiele/anlagebetrug-seite.txt', import.meta.url), 'utf8');
const hatBefund = (bericht, id) => bericht.befunde.some((b) => b.id === id);

/** Kleiner Testserver: jede Route liefert, was die Tabelle sagt. */
function starteServer(routen) {
  return new Promise((fertig) => {
    const server = createServer((anfrage, antwort) => {
      const route = routen[anfrage.url] || { status: 404, body: 'nicht da' };
      antwort.writeHead(route.status || 200, { 'content-type': 'text/html; charset=utf-8', ...route.kopf });
      antwort.end(route.body || '');
    });
    server.listen(0, '127.0.0.1', () => fertig(server));
  });
}

const html = (text) => `<!doctype html><html><head><title>RenditeTurbo</title></head><body><p>${text.replace(/\n/g, '</p><p>')}</p></body></html>`;

test('Seite wird abgerufen und ihr Inhalt geprueft', async () => {
  const server = await starteServer({ '/': { body: html(beispiel) } });
  const basis = `http://127.0.0.1:${server.address().port}`;
  try {
    const abruf = await ruefeSeiteAb(`${basis}/`, { erlaubePrivat: true });
    assert.equal(abruf.ok, true);
    assert.equal(abruf.status, 200);
    assert.match(abruf.text, /RenditeTurbo/);
    assert.match(abruf.text, /garantierte Rendite/);

    const bericht = analysiereAdresse(`${basis}/`, '', abruf);
    assert.equal(bericht.stufe, 'rot');
    assert.equal(bericht.sicherheit.stufe, 'mittel');
    assert.ok(hatBefund(bericht, 'seite-renditeversprechen'));
    assert.ok(hatBefund(bericht, 'abruf-hinweis'));
    assert.ok(!hatBefund(bericht, 'adresse-offline'));
    assert.equal(bericht.abruf.ok, true);
  } finally {
    server.close();
  }
});

test('Weiterleitungen werden einzeln verfolgt und mitgeschrieben', async () => {
  const server = await starteServer({
    '/a': { status: 302, kopf: { location: '/b' } },
    '/b': { status: 301, kopf: { location: '/ziel' } },
    '/ziel': { body: html('Hallo') },
  });
  const basis = `http://127.0.0.1:${server.address().port}`;
  try {
    const abruf = await ruefeSeiteAb(`${basis}/a`, { erlaubePrivat: true });
    assert.equal(abruf.ok, true);
    assert.equal(abruf.endUrl, `${basis}/ziel`);
    assert.deepEqual(abruf.kette.map((k) => k.status), [302, 301, 200]);
  } finally {
    server.close();
  }
});

test('Endlose Weiterleitungen brechen ab, ohne zu werfen', async () => {
  const server = await starteServer({ '/x': { status: 302, kopf: { location: '/x' } } });
  const basis = `http://127.0.0.1:${server.address().port}`;
  try {
    const abruf = await ruefeSeiteAb(`${basis}/x`, { erlaubePrivat: true });
    assert.equal(abruf.ok, false);
    assert.match(abruf.fehler, /Zu viele Weiterleitungen/);
  } finally {
    server.close();
  }
});

test('Grosse Seiten werden abgeschnitten, Nicht-HTML wird abgelehnt', async () => {
  const server = await starteServer({
    '/gross': { body: html('x'.repeat(300000)) },
    '/datei': { body: 'MZ', kopf: { 'content-type': 'application/octet-stream' } },
  });
  const basis = `http://127.0.0.1:${server.address().port}`;
  try {
    const gross = await ruefeSeiteAb(`${basis}/gross`, { erlaubePrivat: true, maxBytes: 50000 });
    assert.equal(gross.abgeschnitten, true);
    assert.ok(gross.html.length <= 50000);
    const datei = await ruefeSeiteAb(`${basis}/datei`, { erlaubePrivat: true });
    assert.equal(datei.ok, false);
    assert.match(datei.fehler, /keine Webseite/);
  } finally {
    server.close();
  }
});

test('Zeitlimit greift', async () => {
  const server = createServer(() => { /* antwortet nie */ });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const abruf = await ruefeSeiteAb(`http://127.0.0.1:${server.address().port}/`, { erlaubePrivat: true, zeitlimitMs: 300 });
    assert.equal(abruf.ok, false);
    assert.match(abruf.fehler, /Keine Antwort/);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('Adressen im eigenen Netz werden standardmaessig verweigert', async () => {
  for (const url of ['http://127.0.0.1/', 'http://192.168.1.1/', 'http://[::1]/', 'http://10.0.0.8/', 'http://localhost/']) {
    const abruf = await ruefeSeiteAb(url);
    assert.equal(abruf.ok, false, url);
    assert.match(abruf.fehler, /eigene Netz|nicht auflösbar|Keine gültige/, url);
  }
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:192.168.0.1']) {
    assert.equal(istPrivateIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '2a00:1450:4001::1']) {
    assert.equal(istPrivateIp(ip), false, ip);
  }
});

test('Weiterleitung ins eigene Netz wird nicht verfolgt', async () => {
  // Der Testserver selbst ist erlaubt, das Ziel der Weiterleitung nicht.
  const server = await starteServer({ '/': { status: 302, kopf: { location: 'http://192.168.0.1/admin' } } });
  const port = server.address().port;
  let aufrufe = 0;
  const holen = (url, init) => {
    aufrufe++;
    return fetch(url, init);
  };
  try {
    const erlaubt = new Set([`127.0.0.1`]);
    const abruf = await ruefeSeiteAb(`http://127.0.0.1:${port}/`, {
      fetch: holen,
      pruefeZiel: async (host) => {
        if (!erlaubt.has(host)) throw new Error(`${host} zeigt ins eigene Netz - Abruf verweigert`);
      },
    });
    assert.equal(abruf.ok, false);
    assert.match(abruf.fehler, /eigene Netz/);
    assert.equal(aufrufe, 1);
  } finally {
    server.close();
  }
});

test('Weiterleitung auf fremde Domain wird zum Befund', () => {
  const abruf = {
    ok: true, status: 200, endUrl: 'https://anlage-profit.top/start', fehler: '', skripte: 0,
    kette: [{ url: 'https://harmlos.de/', status: 302 }, { url: 'https://anlage-profit.top/start', status: 200 }],
    text: '',
  };
  const bericht = analysiereAdresse('https://harmlos.de/', '', abruf);
  assert.ok(hatBefund(bericht, 'abruf-weiterleitung'));
  assert.ok(hatBefund(bericht, 'adresse-geldkoeder'), 'Ziel der Weiterleitung wird mitgeprueft');
  assert.ok(bericht.befunde.some((b) => b.titel.startsWith('Ziel der Weiterleitung')));
});

test('Reine JavaScript-Seite wird als solche benannt', () => {
  const abruf = {
    ok: true, status: 200, endUrl: 'https://app.beispiel.de/', fehler: '', skripte: 5, kette: [], text: 'Laden...',
  };
  assert.ok(hatBefund(analysiereAdresse('https://app.beispiel.de/', '', abruf), 'abruf-nur-javascript'));
});

test('Selbst eingefuegter Text geht dem abgerufenen vor', () => {
  const abruf = { ok: true, status: 200, endUrl: 'https://x.de/', fehler: '', skripte: 0, kette: [], text: 'Garantierte Rendite, risikofrei!' };
  const bericht = analysiereAdresse('https://x.de/', 'Guten Tag, hier ist unser Impressum.', abruf);
  assert.ok(!hatBefund(bericht, 'seite-renditeversprechen'));
});
