#!/usr/bin/env node
/**
 * Lokaler Server für die Browseroberfläche mit Seitenabruf.
 *
 *   npm run server              ->  http://127.0.0.1:8787
 *   node bin/server.js --port 9000
 *
 * Nötig, weil eine per Doppelklick geöffnete Seite aus Sicherheitsgründen
 * keine fremden Webseiten lesen darf. Der Server lauscht nur auf diesem
 * Rechner und nimmt nur Anfragen der eigenen Oberfläche an.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ruefeSeiteAb } from '../src/abruf.js';

const argumente = process.argv.slice(2);
const portIndex = argumente.indexOf('--port');
const PORT = Number(portIndex === -1 ? process.env.PORT || 8787 : argumente[portIndex + 1]);
const SEITE = fileURLToPath(new URL('../dist/phishing-check.html', import.meta.url));

if (!existsSync(SEITE)) {
  console.error('dist/phishing-check.html fehlt. Bitte zuerst "npm run build" ausführen.');
  process.exit(2);
}
const seite = readFileSync(SEITE);

/** Nur Anfragen an diesen Rechner, nur von der eigenen Oberfläche. */
function istEigeneAnfrage(anfrage) {
  const erlaubt = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
  if (!erlaubt.includes(anfrage.headers.host)) return false;
  const herkunft = anfrage.headers.origin;
  if (herkunft && !erlaubt.some((h) => herkunft === `http://${h}`)) return false;
  // Eigener Kopf: Fremde Seiten können ihn nicht ohne Rückfrage setzen,
  // und diese Rückfrage beantwortet der Server nicht.
  return anfrage.headers['x-mail-befund'] === '1';
}

function json(antwort, status, daten) {
  antwort.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  antwort.end(JSON.stringify(daten));
}

const server = createServer(async (anfrage, antwort) => {
  const url = new URL(anfrage.url, `http://127.0.0.1:${PORT}`);

  if (anfrage.method === 'GET' && url.pathname === '/') {
    antwort.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    antwort.end(seite);
    return;
  }

  if (anfrage.method === 'GET' && url.pathname.startsWith('/abruf')) {
    if (!istEigeneAnfrage(anfrage)) {
      json(antwort, 403, { fehler: 'Nur für die eigene Oberfläche' });
      return;
    }
    if (url.pathname === '/abruf/bereit') {
      json(antwort, 200, { bereit: true });
      return;
    }
    const ziel = url.searchParams.get('url') || '';
    const abruf = await ruefeSeiteAb(ziel);
    console.log(`${new Date().toISOString()}  ${abruf.ok ? abruf.status : 'FEHLER'}  ${ziel}${abruf.fehler ? `  (${abruf.fehler})` : ''}`);
    const { html, ...ohneHtml } = abruf;
    json(antwort, 200, ohneHtml);
    return;
  }

  antwort.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  antwort.end('Nicht gefunden');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mail-Befund läuft auf http://127.0.0.1:${PORT}`);
  console.log('Seitenabrufe gehen von diesem Rechner aus. Beenden mit Strg+C.');
});
